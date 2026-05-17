// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FeeDistributor.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _dec;
    constructor(string memory name, string memory sym, uint8 dec_) ERC20(name, sym) { _dec = dec_; }
    function decimals() public view override returns (uint8) { return _dec; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev Stub referral: deterministic referrer mapping
contract MockReferral {
    mapping(address => address) public referrers;
    function setReferrer(address user, address referrer) external { referrers[user] = referrer; }
    function getReferrer(address user) external view returns (address) { return referrers[user]; }
}

contract FeeDistributorTest is Test {
    FeeDistributor dist;
    MockERC20 usdc;
    MockERC20 yusdc;
    MockReferral referral;

    address owner   = address(this);
    address alice   = address(0xA11CE);
    address bob     = address(0xB0B);
    address charlie = address(0xC0FFEE);

    function setUp() public {
        usdc   = new MockERC20("USDC",  "USDC",  6);
        yusdc  = new MockERC20("yUSDC", "yUSDC", 6);
        dist   = new FeeDistributor(address(usdc), address(yusdc));
        referral = new MockReferral();

        // Give alice and bob yUSDC (simulating vault shares)
        yusdc.mint(alice, 100e6);
        yusdc.mint(bob,   100e6);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    function _notify(uint256 amount, address user) internal {
        usdc.mint(owner, amount);
        usdc.approve(address(dist), amount);
        dist.notifyRewardAmount(amount, user);
    }

    // ─── Basic reward distribution ────────────────────────────────────────

    function test_notifyRewardAmount_updatesEarned() public {
        _notify(100e6, address(0));

        uint256 aliceEarned = dist.earned(alice);
        uint256 bobEarned   = dist.earned(bob);

        // Equal shares → equal earnings
        assertEq(aliceEarned, bobEarned);
        // Together they should earn ~100e6 (slight rounding)
        assertApproxEqAbs(aliceEarned + bobEarned, 100e6, 2);
    }

    function test_proportional_to_shares() public {
        // Charlie has 3x more shares
        yusdc.mint(charlie, 300e6); // total: alice=100, bob=100, charlie=300

        _notify(100e6, address(0));

        uint256 aliceEarned   = dist.earned(alice);
        uint256 charlieEarned = dist.earned(charlie);

        // charlie should earn ~3x alice
        assertApproxEqAbs(charlieEarned, aliceEarned * 3, 2);
    }

    function test_claim_transfers_usdc() public {
        _notify(100e6, address(0));

        uint256 aliceExpected = dist.earned(alice);
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        dist.claim();

        assertEq(usdc.balanceOf(alice), aliceUsdcBefore + aliceExpected);
        assertEq(dist.earned(alice), 0);
    }

    function test_claim_reverts_if_no_rewards() public {
        vm.prank(alice);
        vm.expectRevert("No rewards to claim");
        dist.claim();
    }

    function test_multiple_reward_epochs() public {
        _notify(100e6, address(0));

        // Alice claims after epoch 1
        vm.prank(alice);
        dist.claim();

        // Epoch 2
        _notify(50e6, address(0));

        uint256 aliceEarned = dist.earned(alice);
        uint256 bobEarned   = dist.earned(bob);

        // Bob should have epoch1 + epoch2 earnings; alice only epoch2
        assertApproxEqAbs(aliceEarned, 25e6, 2); // half of 50e6
        assertApproxEqAbs(bobEarned, 75e6, 2);   // 50e6 + 25e6
    }

    // ─── Referral ─────────────────────────────────────────────────────────

    function test_referral_gives_20pct_to_referrer() public {
        dist.setReferralContract(address(referral));
        referral.setReferrer(bob, charlie); // charlie referred bob

        // charlie needs yUSDC to be a participant (already has none, but direct rewards are set)
        _notify(100e6, bob);

        uint256 charlieReward = dist.earned(charlie);
        uint256 expectedReferrerCut = (100e6 * 20) / 100;
        assertApproxEqAbs(charlieReward, expectedReferrerCut, 2);
    }

    function test_referral_pool_gets_80pct() public {
        dist.setReferralContract(address(referral));
        referral.setReferrer(bob, charlie);

        _notify(100e6, bob);

        // alice and bob share the remaining 80e6 in the pool
        uint256 aliceEarned = dist.earned(alice);
        uint256 bobEarned   = dist.earned(bob);
        assertApproxEqAbs(aliceEarned + bobEarned, 80e6, 4);
    }

    function test_referral_not_self_referral() public {
        dist.setReferralContract(address(referral));
        referral.setReferrer(alice, alice); // self-referral → should be ignored

        _notify(100e6, alice);

        // No referral reward, full amount in pool
        assertApproxEqAbs(dist.earned(alice) + dist.earned(bob), 100e6, 2);
    }

    // ─── Admin ────────────────────────────────────────────────────────────

    function test_setReferralContract_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        dist.setReferralContract(address(referral));
    }

    function test_emergencyWithdraw() public {
        _notify(50e6, address(0));

        uint256 balance = usdc.balanceOf(address(dist));
        uint256 ownerBefore = usdc.balanceOf(owner);
        dist.emergencyWithdraw(owner, balance);
        assertEq(usdc.balanceOf(owner), ownerBefore + balance);
    }

    function test_rewardPerShare_zeroIfNoShares() public {
        // Burn all shares
        uint256 aliceBal = yusdc.balanceOf(alice);
        uint256 bobBal   = yusdc.balanceOf(bob);
        vm.prank(alice); // simulate burn (just transfer to dead address)
        yusdc.transfer(address(0xDEAD), aliceBal);
        vm.prank(bob);
        yusdc.transfer(address(0xDEAD), bobBal);

        uint256 rps = dist.rewardPerShare();
        assertEq(rps, dist.rewardPerShareStored());
    }
}
