// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface IPointsTracker {
    function recordActivity(address user, uint8 activityType, uint256 usdcAmount) external;
}

/// @title Swap
/// @notice Constant-product AMM for USDC/EURC with:
///         - 0.3% swap fee routed to FeeDistributor
///         - Slippage protection via minAmountOut
///         - ERC-20 LP tokens for permissionless liquidity provision
///         - Points recording on every swap
/// @dev    Fee is deducted BEFORE reserves update so reserves only reflect net liquidity.
contract Swap is ERC20, Ownable, ReentrancyGuard {
    using Math for uint256;

    IERC20 public usdc;
    IERC20 public eurc;

    uint256 public reserve0; // USDC reserve (6 decimals)
    uint256 public reserve1; // EURC reserve (6 decimals)

    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public swapFee = 3; // 0.3%

    address public feeDistributor;
    IPointsTracker public pointsTracker;

    uint8 private constant ACTIVITY_SWAP = 1;

    // ── Events ────────────────────────────────────────────────────────────────
    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpBurned);
    event Swapped(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut, uint256 fee);
    event FeeDistributorUpdated(address indexed newDistributor);
    event PointsTrackerUpdated(address indexed newTracker);

    constructor(address _usdc, address _eurc)
        ERC20("YieldFi LP", "YFI-LP")
        Ownable(msg.sender)
    {
        usdc = IERC20(_usdc);
        eurc = IERC20(_eurc);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setFeeDistributor(address _distributor) external onlyOwner {
        feeDistributor = _distributor;
        emit FeeDistributorUpdated(_distributor);
    }

    function setPointsTracker(address _tracker) external onlyOwner {
        pointsTracker = IPointsTracker(_tracker);
        emit PointsTrackerUpdated(_tracker);
    }

    // ── Liquidity ─────────────────────────────────────────────────────────────

    /// @notice Deposit USDC + EURC and receive LP tokens proportional to share.
    ///         First LP sets the initial ratio.
    /// @param amount0Desired  USDC amount to deposit
    /// @param amount1Desired  EURC amount to deposit
    /// @param amount0Min      Minimum USDC actually used (slippage guard)
    /// @param amount1Min      Minimum EURC actually used (slippage guard)
    /// @return liquidity      LP tokens minted
    function addLiquidity(
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min
    ) external nonReentrant returns (uint256 liquidity) {
        require(amount0Desired > 0 && amount1Desired > 0, "Amounts must be >0");

        uint256 _reserve0 = reserve0;
        uint256 _reserve1 = reserve1;

        uint256 amount0 = amount0Desired;
        uint256 amount1 = amount1Desired;

        if (_reserve0 > 0 || _reserve1 > 0) {
            uint256 optimalAmount1 = (amount0Desired * _reserve1) / _reserve0;
            if (optimalAmount1 <= amount1Desired) {
                require(optimalAmount1 >= amount1Min, "EURC slippage");
                amount1 = optimalAmount1;
            } else {
                uint256 optimalAmount0 = (amount1Desired * _reserve0) / _reserve1;
                require(optimalAmount0 <= amount0Desired, "Bad ratio");
                require(optimalAmount0 >= amount0Min, "USDC slippage");
                amount0 = optimalAmount0;
            }
        }

        require(usdc.transferFrom(msg.sender, address(this), amount0), "USDC transfer failed");
        require(eurc.transferFrom(msg.sender, address(this), amount1), "EURC transfer failed");

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1);
        } else {
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }

        require(liquidity > 0, "Insufficient liquidity minted");
        _mint(msg.sender, liquidity);

        reserve0 += amount0;
        reserve1 += amount1;

        emit LiquidityAdded(msg.sender, amount0, amount1, liquidity);
    }

    /// @notice Burn LP tokens and receive proportional USDC + EURC.
    /// @param liquidity   LP tokens to burn
    /// @param amount0Min  Minimum USDC to receive
    /// @param amount1Min  Minimum EURC to receive
    function removeLiquidity(
        uint256 liquidity,
        uint256 amount0Min,
        uint256 amount1Min
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        require(liquidity > 0, "Zero liquidity");
        uint256 _totalSupply = totalSupply();

        amount0 = (liquidity * reserve0) / _totalSupply;
        amount1 = (liquidity * reserve1) / _totalSupply;

        require(amount0 >= amount0Min, "USDC slippage");
        require(amount1 >= amount1Min, "EURC slippage");

        _burn(msg.sender, liquidity);

        reserve0 -= amount0;
        reserve1 -= amount1;

        require(usdc.transfer(msg.sender, amount0), "USDC transfer failed");
        require(eurc.transfer(msg.sender, amount1), "EURC transfer failed");

        emit LiquidityRemoved(msg.sender, amount0, amount1, liquidity);
    }

    // ── Swap ─────────────────────────────────────────────────────────────────

    /// @notice Swap tokenIn for tokenOut.
    /// @param tokenIn      USDC or EURC address
    /// @param tokenOut     USDC or EURC address (opposite of tokenIn)
    /// @param amountIn     Amount of tokenIn to swap
    /// @param minAmountOut Minimum tokenOut to receive — reverts if not met (slippage protection)
    /// @return amountOut   Actual tokenOut received
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Amount in must be >0");
        require(tokenIn == address(usdc) || tokenIn == address(eurc), "Invalid tokenIn");
        require(tokenOut == address(usdc) || tokenOut == address(eurc), "Invalid tokenOut");
        require(tokenIn != tokenOut, "Cannot swap same token");

        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "Transfer failed");

        uint256 feeAmount = (amountIn * swapFee) / FEE_DENOMINATOR;
        uint256 amountInNet = amountIn - feeAmount;

        uint256 reserveIn  = tokenIn == address(usdc) ? reserve0 : reserve1;
        uint256 reserveOut = tokenOut == address(usdc) ? reserve0 : reserve1;

        amountOut = (amountInNet * reserveOut) / (reserveIn + amountInNet);
        require(amountOut > 0, "Insufficient output amount");
        require(amountOut >= minAmountOut, "Slippage: too little received");

        if (tokenIn == address(usdc)) {
            reserve0 += amountInNet;
            reserve1 -= amountOut;
        } else {
            reserve1 += amountInNet;
            reserve0 -= amountOut;
        }

        require(IERC20(tokenOut).transfer(msg.sender, amountOut), "Transfer out failed");

        // Route fees
        if (feeDistributor != address(0) && feeAmount > 0) {
            if (tokenIn == address(usdc)) {
                require(IERC20(tokenIn).transfer(feeDistributor, feeAmount), "Fee transfer failed");
            } else {
                reserve1 += feeAmount;
            }
        } else if (feeAmount > 0) {
            if (tokenIn == address(usdc)) {
                reserve0 += feeAmount;
            } else {
                reserve1 += feeAmount;
            }
        }

        // Award points (non-reverting — never block a swap for points)
        uint256 usdcVolume = tokenIn == address(usdc) ? amountIn : amountOut;
        _tryRecordPoints(msg.sender, ACTIVITY_SWAP, usdcVolume);

        emit Swapped(msg.sender, tokenIn, amountIn, amountOut, feeAmount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getReserves() external view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    /// @notice Quote output amount for a given input (no state change)
    function getAmountOut(address tokenIn, uint256 amountIn)
        external
        view
        returns (uint256 amountOut, uint256 fee)
    {
        require(tokenIn == address(usdc) || tokenIn == address(eurc), "Invalid tokenIn");
        fee = (amountIn * swapFee) / FEE_DENOMINATOR;
        uint256 amountInNet = amountIn - fee;
        uint256 reserveIn  = tokenIn == address(usdc) ? reserve0 : reserve1;
        uint256 reserveOut = tokenIn == address(usdc) ? reserve1 : reserve0;
        if (reserveIn == 0 || reserveOut == 0) return (0, fee);
        amountOut = (amountInNet * reserveOut) / (reserveIn + amountInNet);
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    /// @dev Calls pointsTracker safely — never reverts the parent tx
    function _tryRecordPoints(address user, uint8 activityType, uint256 usdcAmount) internal {
        if (address(pointsTracker) == address(0)) return;
        try pointsTracker.recordActivity(user, activityType, usdcAmount) {} catch {}
    }
}
