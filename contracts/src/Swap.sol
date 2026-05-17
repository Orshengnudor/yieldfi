// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Swap
/// @notice Minimal constant-product AMM for USDC/EURC.
///         Fee is extracted BEFORE updating reserves so reserves only ever
///         reflect actual liquidity (not the portion sent to feeDistributor).
contract Swap is Ownable, ReentrancyGuard {
    IERC20 public usdc;
    IERC20 public eurc;

    uint256 public reserve0; // USDC reserve (6 decimals)
    uint256 public reserve1; // EURC reserve (6 decimals)

    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public swapFee = 3; // 0.3%

    address public feeDistributor;

    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1);
    event Swapped(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut, uint256 fee);
    event FeeDistributorUpdated(address indexed newDistributor);

    constructor(address _usdc, address _eurc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        eurc = IERC20(_eurc);
    }

    function setFeeDistributor(address _distributor) external onlyOwner {
        feeDistributor = _distributor;
        emit FeeDistributorUpdated(_distributor);
    }

    function addLiquidity(uint256 amount0Desired, uint256 amount1Desired) external nonReentrant {
        require(amount0Desired > 0 && amount1Desired > 0, "Amounts must be >0");

        uint256 _reserve0 = reserve0;
        uint256 _reserve1 = reserve1;

        uint256 amount0 = amount0Desired;
        uint256 amount1 = amount1Desired;

        if (_reserve0 > 0 || _reserve1 > 0) {
            uint256 optimalAmount1 = (amount0Desired * _reserve1) / _reserve0;
            if (optimalAmount1 < amount1Desired) {
                amount1 = optimalAmount1;
            } else {
                uint256 optimalAmount0 = (amount1Desired * _reserve0) / _reserve1;
                if (optimalAmount0 < amount0Desired) {
                    amount0 = optimalAmount0;
                }
            }
        }

        require(usdc.transferFrom(msg.sender, address(this), amount0), "USDC transfer failed");
        require(eurc.transferFrom(msg.sender, address(this), amount1), "EURC transfer failed");

        reserve0 += amount0;
        reserve1 += amount1;

        emit LiquidityAdded(msg.sender, amount0, amount1);
    }

    function removeLiquidity(uint256 /*shares*/) external nonReentrant {
        // MVP: owner-only full withdrawal
        require(msg.sender == owner(), "Only owner can remove liquidity");
        uint256 amount0 = reserve0;
        uint256 amount1 = reserve1;

        reserve0 = 0;
        reserve1 = 0;

        require(usdc.transfer(msg.sender, amount0), "USDC transfer failed");
        require(eurc.transfer(msg.sender, amount1), "EURC transfer failed");

        emit LiquidityRemoved(msg.sender, amount0, amount1);
    }

    /// @notice Swap tokenIn for tokenOut.
    ///         Fee is deducted from amountIn BEFORE reserves are updated so that
    ///         reserves correctly reflect only the net liquidity, not the fee portion.
    function swap(address tokenIn, address tokenOut, uint256 amountIn)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Amount in must be >0");
        require(tokenIn == address(usdc) || tokenIn == address(eurc), "Invalid tokenIn");
        require(tokenOut == address(usdc) || tokenOut == address(eurc), "Invalid tokenOut");
        require(tokenIn != tokenOut, "Cannot swap same token");

        // Pull the full amountIn from user
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "Transfer failed");

        // --- Fee first, THEN reserves ---
        uint256 feeAmount = (amountIn * swapFee) / FEE_DENOMINATOR;
        uint256 amountInNet = amountIn - feeAmount; // net amount entering the pool

        uint256 reserveIn  = tokenIn == address(usdc) ? reserve0 : reserve1;
        uint256 reserveOut = tokenOut == address(usdc) ? reserve0 : reserve1;

        // Constant-product: x * y = k, using net amount (no extra fee factor needed)
        amountOut = (amountInNet * reserveOut) / (reserveIn + amountInNet);
        require(amountOut > 0, "Insufficient output amount");

        // Update reserves with NET amounts only
        if (tokenIn == address(usdc)) {
            reserve0 += amountInNet;
            reserve1 -= amountOut;
        } else {
            reserve1 += amountInNet;
            reserve0 -= amountOut;
        }

        // Send output token to user
        require(IERC20(tokenOut).transfer(msg.sender, amountOut), "Transfer out failed");

        // Send fee to feeDistributor (separate from reserves)
        if (feeDistributor != address(0) && feeAmount > 0) {
            // Only USDC fees go to FeeDistributor (which holds USDC rewards for yUSDC holders)
            if (tokenIn == address(usdc)) {
                require(IERC20(tokenIn).transfer(feeDistributor, feeAmount), "Fee transfer failed");
            } else {
                // EURC fee: just keep in contract for now (could add EURC distributor later)
                // Re-add to reserveIn so it's not lost
                reserve1 += feeAmount;
            }
        } else if (feeAmount > 0) {
            // No distributor set: put fee back into reserves
            if (tokenIn == address(usdc)) {
                reserve0 += feeAmount;
            } else {
                reserve1 += feeAmount;
            }
        }

        emit Swapped(msg.sender, tokenIn, amountIn, amountOut, feeAmount);
    }

    function getReserves() external view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    /// @notice Get quoted output amount for a given input (view, no state change)
    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256 amountOut, uint256 fee) {
        require(tokenIn == address(usdc) || tokenIn == address(eurc), "Invalid tokenIn");
        fee = (amountIn * swapFee) / FEE_DENOMINATOR;
        uint256 amountInNet = amountIn - fee;
        uint256 reserveIn  = tokenIn == address(usdc) ? reserve0 : reserve1;
        uint256 reserveOut = tokenIn == address(usdc) ? reserve1 : reserve0;
        if (reserveIn == 0 || reserveOut == 0) return (0, fee);
        amountOut = (amountInNet * reserveOut) / (reserveIn + amountInNet);
    }
}
