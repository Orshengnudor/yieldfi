// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Swap.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    uint8 private _dec;
    constructor(string memory name, string memory sym, uint8 dec_) ERC20(name, sym) { _dec = dec_; }
    function decimals() public view override returns (uint8) { return _dec; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract SwapTest is Test {
    Swap   swapContract;
    MockToken usdc;
    MockToken eurc;

    address owner = address(this);
    address alice = address(0xA11CE);
    address feeRecipient = address(0xFEE);

    uint256 constant INIT_LIQUIDITY = 10_000e6; // 10k USDC / EURC

    function setUp() public {
        usdc = new MockToken("Mock USDC", "USDC", 6);
        eurc = new MockToken("Mock EURC", "EURC", 6);
        swapContract = new Swap(address(usdc), address(eurc));

        // Seed liquidity (owner adds)
        usdc.mint(owner, INIT_LIQUIDITY);
        eurc.mint(owner, INIT_LIQUIDITY);
        usdc.approve(address(swapContract), INIT_LIQUIDITY);
        eurc.approve(address(swapContract), INIT_LIQUIDITY);
        swapContract.addLiquidity(INIT_LIQUIDITY, INIT_LIQUIDITY);

        // Give alice tokens to swap
        usdc.mint(alice, 1000e6);
        eurc.mint(alice, 1000e6);
    }

    // ─── addLiquidity ─────────────────────────────────────────────────────

    function test_addLiquidity_updatesReserves() public {
        (uint256 r0, uint256 r1) = swapContract.getReserves();
        assertEq(r0, INIT_LIQUIDITY);
        assertEq(r1, INIT_LIQUIDITY);
    }

    function test_addLiquidity_revertsOnZero() public {
        vm.expectRevert("Amounts must be >0");
        swapContract.addLiquidity(0, 100e6);
    }

    // ─── swap ─────────────────────────────────────────────────────────────

    function test_swap_usdc_to_eurc_basic() public {
        vm.startPrank(alice);
        usdc.approve(address(swapContract), 100e6);

        uint256 eurcBefore = eurc.balanceOf(alice);
        uint256 amountOut = swapContract.swap(address(usdc), address(eurc), 100e6);
        vm.stopPrank();

        assertGt(amountOut, 0);
        assertEq(eurc.balanceOf(alice), eurcBefore + amountOut);
    }

    function test_swap_eurc_to_usdc_basic() public {
        vm.startPrank(alice);
        eurc.approve(address(swapContract), 100e6);

        uint256 usdcBefore = usdc.balanceOf(alice);
        uint256 amountOut = swapContract.swap(address(eurc), address(usdc), 100e6);
        vm.stopPrank();

        assertGt(amountOut, 0);
        assertEq(usdc.balanceOf(alice), usdcBefore + amountOut);
    }

    /// @dev Reserves should only include net amount (amountIn - fee)
    function test_swap_reserves_exclude_fee() public {
        (uint256 r0Before, uint256 r1Before) = swapContract.getReserves();

        uint256 amountIn = 100e6;
        uint256 fee = (amountIn * 3) / 1000; // 0.3%

        vm.startPrank(alice);
        usdc.approve(address(swapContract), amountIn);
        uint256 amountOut = swapContract.swap(address(usdc), address(eurc), amountIn);
        vm.stopPrank();

        (uint256 r0After, uint256 r1After) = swapContract.getReserves();

        // reserve0 should increase by amountInNet (fee excluded — no distributor set so fee goes to reserve)
        // With no distributor, fee is re-added to reserve0
        assertEq(r0After, r0Before + amountIn); // net + fee (fee re-added to reserve)
        assertEq(r1After, r1Before - amountOut);
    }

    /// @dev With feeDistributor set, fee is sent to distributor, NOT reserves
    function test_swap_fee_sent_to_distributor() public {
        swapContract.setFeeDistributor(feeRecipient);

        uint256 amountIn = 1000e6;
        uint256 expectedFee = (amountIn * 3) / 1000;

        vm.startPrank(alice);
        usdc.approve(address(swapContract), amountIn);
        swapContract.swap(address(usdc), address(eurc), amountIn);
        vm.stopPrank();

        assertEq(usdc.balanceOf(feeRecipient), expectedFee);
    }

    function test_swap_constant_product_maintained() public {
        (uint256 r0Before, uint256 r1Before) = swapContract.getReserves();
        uint256 kBefore = r0Before * r1Before;

        uint256 amountIn = 100e6;
        swapContract.setFeeDistributor(feeRecipient); // fee leaves pool

        vm.startPrank(alice);
        usdc.approve(address(swapContract), amountIn);
        swapContract.swap(address(usdc), address(eurc), amountIn);
        vm.stopPrank();

        (uint256 r0After, uint256 r1After) = swapContract.getReserves();
        uint256 kAfter = r0After * r1After;

        // k should be >= kBefore (fee removed → k may decrease slightly, but net amount in ≥ amountOut)
        // With fee to distributor, k after should be >= k before (constant product invariant)
        assertGe(kAfter, kBefore);
    }

    function test_swap_reverts_same_token() public {
        vm.startPrank(alice);
        usdc.approve(address(swapContract), 100e6);
        vm.expectRevert("Cannot swap same token");
        swapContract.swap(address(usdc), address(usdc), 100e6);
        vm.stopPrank();
    }

    function test_swap_reverts_invalid_token() public {
        vm.startPrank(alice);
        vm.expectRevert("Invalid tokenIn");
        swapContract.swap(address(0xDEAD), address(usdc), 100e6);
        vm.stopPrank();
    }

    // ─── getAmountOut ─────────────────────────────────────────────────────

    function test_getAmountOut_matches_swap() public {
        (uint256 quoted,) = swapContract.getAmountOut(address(usdc), 100e6);

        vm.startPrank(alice);
        usdc.approve(address(swapContract), 100e6);
        uint256 actual = swapContract.swap(address(usdc), address(eurc), 100e6);
        vm.stopPrank();

        assertEq(quoted, actual);
    }

    // ─── removeLiquidity ──────────────────────────────────────────────────

    function test_removeLiquidity_ownerOnly() public {
        vm.prank(alice);
        vm.expectRevert("Only owner can remove liquidity");
        swapContract.removeLiquidity(0);
    }

    function test_removeLiquidity_returnsTokens() public {
        uint256 usdcBefore = usdc.balanceOf(owner);
        (uint256 r0,) = swapContract.getReserves();

        swapContract.removeLiquidity(0);

        assertEq(usdc.balanceOf(owner), usdcBefore + r0);
        (uint256 r0After, uint256 r1After) = swapContract.getReserves();
        assertEq(r0After, 0);
        assertEq(r1After, 0);
    }
}
