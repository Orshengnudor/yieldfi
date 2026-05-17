// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Swap is Ownable, ReentrancyGuard {
    IERC20 public usdc;
    IERC20 public eurc;

    uint256 public reserve0; // USDC reserve (6 decimals)
    uint256 public reserve1; // EURC reserve (6 decimals)

    uint256 public constant FEE_DENOMINATOR = 1000; // 0.3% fee => 3/1000
    uint256 public swapFee = 3; // 0.3%

    address public feeDistributor; // contract that collects fees

    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1);
    event Swap(address indexed user, uint256 amountIn, uint256 amountOut, uint256 fee);
    event FeeDistributorUpdated(address indexed newDistributor);

    constructor(address _usdc, address _eurc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        eurc = IERC20(_eurc);
    }

    // Set fee distributor contract address
    function setFeeDistributor(address _distributor) external onlyOwner {
        feeDistributor = _distributor;
        emit FeeDistributorUpdated(_distributor);
    }

    // Add liquidity: sends USDC + EURC to the pool
    function addLiquidity(uint256 amount0Desired, uint256 amount1Desired) external nonReentrant {
        require(amount0Desired > 0 && amount1Desired > 0, "Amounts must be >0");

        uint256 _reserve0 = reserve0;
        uint256 _reserve1 = reserve1;

        uint256 amount0 = amount0Desired;
        uint256 amount1 = amount1Desired;

        if (_reserve0 > 0 || _reserve1 > 0) {
            // Determine optimal amounts to maintain constant product
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

        // Transfer tokens from user to this contract
        require(usdc.transferFrom(msg.sender, address(this), amount0), "USDC transfer failed");
        require(eurc.transferFrom(msg.sender, address(this), amount1), "EURC transfer failed");

        reserve0 += amount0;
        reserve1 += amount1;

        // Mint LP tokens to msg.sender (simplified – we'll use a separate LP token later)
        emit LiquidityAdded(msg.sender, amount0, amount1);
    }

    // Remove liquidity: return USDC + EURC to user (proportional to share)
    function removeLiquidity(uint256 shares) external nonReentrant {
        // We'd need an LP token contract. For MVP, assume we track shares manually.
        // Simpler: just allow withdrawal of all liquidity (for owner). But we'll implement full LP later.
        // For now, we'll restrict to owner for demonstration.
        require(msg.sender == owner(), "Only owner can remove liquidity");
        uint256 amount0 = reserve0;
        uint256 amount1 = reserve1;

        reserve0 = 0;
        reserve1 = 0;

        require(usdc.transfer(msg.sender, amount0), "USDC transfer failed");
        require(eurc.transfer(msg.sender, amount1), "EURC transfer failed");

        emit LiquidityRemoved(msg.sender, amount0, amount1);
    }

    // Swap: user sends tokenIn, receives tokenOut. Fee sent to feeDistributor.
    function swap(address tokenIn, address tokenOut, uint256 amountIn) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Amount in must be >0");
        require(tokenIn == address(usdc) || tokenIn == address(eurc), "Invalid tokenIn");
        require(tokenOut == address(usdc) || tokenOut == address(eurc), "Invalid tokenOut");
        require(tokenIn != tokenOut, "Cannot swap same token");

        // Transfer tokenIn from user
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "Transfer failed");

        uint256 reserveIn = tokenIn == address(usdc) ? reserve0 : reserve1;
        uint256 reserveOut = tokenOut == address(usdc) ? reserve0 : reserve1;

        // Calculate amountOut with fee
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - swapFee) / FEE_DENOMINATOR;
        amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
        require(amountOut > 0, "Insufficient output amount");

        // Update reserves
        if (tokenIn == address(usdc)) {
            reserve0 += amountIn;
            reserve1 -= amountOut;
        } else {
            reserve1 += amountIn;
            reserve0 -= amountOut;
        }

        // Send output token to user
        require(IERC20(tokenOut).transfer(msg.sender, amountOut), "Transfer out failed");

        // Calculate fee in the input token and send to feeDistributor
        uint256 feeAmount = amountIn * swapFee / FEE_DENOMINATOR;
        if (feeDistributor != address(0) && feeAmount > 0) {
            require(IERC20(tokenIn).transfer(feeDistributor, feeAmount), "Fee transfer failed");
        }

        emit Swap(msg.sender, amountIn, amountOut, feeAmount);

        return amountOut;
    }

    // Get current reserves
    function getReserves() external view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }
}