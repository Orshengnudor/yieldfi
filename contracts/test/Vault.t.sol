// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Vault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC-20 with mint/burn for testing
contract MockUSDC is ERC20 {
    uint8 private _dec;
    constructor(uint8 dec_) ERC20("Mock USDC", "USDC") { _dec = dec_; }
    function decimals() public view override returns (uint8) { return _dec; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract VaultTest is Test {
    Vault vault;
    MockUSDC usdc;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);
    address owner = address(this);

    function setUp() public {
        usdc  = new MockUSDC(6);
        vault = new Vault(IERC20(address(usdc)));

        // Give alice and bob some USDC
        usdc.mint(alice, 1000e6);
        usdc.mint(bob,   1000e6);
    }

    // ─── Deposit / Withdraw ────────────────────────────────────────────────

    function test_deposit_mintsShares() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        uint256 shares = vault.deposit(100e6, alice);
        vm.stopPrank();

        assertEq(shares, vault.balanceOf(alice));
        assertGt(shares, 0);
        assertEq(vault.totalAssets(), 100e6);
    }

    function test_withdraw_burnsShares() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);

        uint256 sharesBefore = vault.balanceOf(alice);
        vault.redeem(sharesBefore, alice, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 0);
        assertEq(usdc.balanceOf(alice), 1000e6); // back to start
    }

    function test_multipleDepositors_shareProportional() public {
        // Both deposit equal amounts → equal shares
        vm.prank(alice);
        usdc.approve(address(vault), 500e6);
        vm.prank(alice);
        uint256 aliceShares = vault.deposit(500e6, alice);

        vm.prank(bob);
        usdc.approve(address(vault), 500e6);
        vm.prank(bob);
        uint256 bobShares = vault.deposit(500e6, bob);

        assertEq(aliceShares, bobShares);
        assertEq(vault.totalAssets(), 1000e6);
    }

    // ─── injectYield ──────────────────────────────────────────────────────

    function test_injectYield_increasesTotalAssets() public {
        // Alice deposits first so there are shares outstanding
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        uint256 before = vault.totalAssets();

        // Owner injects 10 USDC of yield
        usdc.mint(owner, 10e6);
        usdc.approve(address(vault), 10e6);
        vault.injectYield(10e6);

        assertEq(vault.totalAssets(), before + 10e6);
    }

    function test_injectYield_increasesRedeemValue() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        uint256 shares = vault.deposit(100e6, alice);
        vm.stopPrank();

        uint256 redeemBefore = vault.convertToAssets(shares);

        usdc.mint(owner, 10e6);
        usdc.approve(address(vault), 10e6);
        vault.injectYield(10e6);

        uint256 redeemAfter = vault.convertToAssets(shares);
        assertGt(redeemAfter, redeemBefore);
    }

    function test_injectYield_revertsIfNoShares() public {
        usdc.mint(owner, 10e6);
        usdc.approve(address(vault), 10e6);
        vm.expectRevert("No shares outstanding");
        vault.injectYield(10e6);
    }

    function test_injectYield_revertsIfNotOwner() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        usdc.mint(alice, 10e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), 10e6);
        vm.expectRevert();
        vault.injectYield(10e6);
        vm.stopPrank();
    }

    // ─── ERC-4626 metadata ────────────────────────────────────────────────

    function test_name_and_symbol() public view {
        assertEq(vault.name(),   "YieldFi USDC");
        assertEq(vault.symbol(), "yUSDC");
    }
}
