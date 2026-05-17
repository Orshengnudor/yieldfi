// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Referral.sol";

contract ReferralTest is Test {
    Referral referral;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        referral = new Referral();
    }

    // ─── createReferralCode ───────────────────────────────────────────────

    function test_createCode_basic() public {
        vm.prank(alice);
        referral.createReferralCode("ALICE");

        assertEq(referral.getReferralCode(alice), "ALICE");
        assertEq(referral.codeToReferrer("ALICE"), alice);
    }

    event ReferralCodeCreated(address indexed user, string code);
    event ReferralUsed(address indexed referrer, address indexed referee);

    function test_createCode_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ReferralCodeCreated(alice, "ALICE");

        vm.prank(alice);
        referral.createReferralCode("ALICE");
    }

    function test_createCode_reverts_empty() public {
        vm.prank(alice);
        vm.expectRevert("Code cannot be empty");
        referral.createReferralCode("");
    }

    function test_createCode_reverts_duplicate() public {
        vm.prank(alice);
        referral.createReferralCode("ALICE");

        vm.prank(bob);
        vm.expectRevert("Code already taken");
        referral.createReferralCode("ALICE");
    }

    function test_createCode_reverts_userAlreadyHasCode() public {
        vm.startPrank(alice);
        referral.createReferralCode("ALICE");
        vm.expectRevert("User already has a code");
        referral.createReferralCode("ALICE2");
        vm.stopPrank();
    }

    // ─── useReferralCode ──────────────────────────────────────────────────

    function test_useReferralCode_links_referee() public {
        vm.prank(alice);
        referral.createReferralCode("ALICE");

        // Owner calls useReferralCode on behalf of bob
        referral.useReferralCode("ALICE", bob);

        assertEq(referral.getReferrer(bob), alice);
    }

    function test_useReferralCode_emitsEvent() public {
        vm.prank(alice);
        referral.createReferralCode("ALICE");

        vm.expectEmit(true, true, false, false);
        emit ReferralUsed(alice, bob);
        referral.useReferralCode("ALICE", bob);
    }

    function test_useReferralCode_reverts_invalid_code() public {
        vm.expectRevert("Invalid referral code");
        referral.useReferralCode("NONEXISTENT", bob);
    }

    function test_useReferralCode_reverts_already_referred() public {
        vm.prank(alice);
        referral.createReferralCode("ALICE");

        referral.useReferralCode("ALICE", bob);

        // bob tries to be referred again
        vm.expectRevert("Referee already has a referrer");
        referral.useReferralCode("ALICE", bob);
    }

    function test_useReferralCode_onlyOwner() public {
        vm.prank(alice);
        referral.createReferralCode("ALICE");

        vm.prank(bob);
        vm.expectRevert();
        referral.useReferralCode("ALICE", bob);
    }

    // ─── getReferrer ──────────────────────────────────────────────────────

    function test_getReferrer_returnsZeroIfNone() public view {
        assertEq(referral.getReferrer(alice), address(0));
    }

    // ─── getReferralCode ──────────────────────────────────────────────────

    function test_getReferralCode_returnsEmptyIfNone() public view {
        assertEq(referral.getReferralCode(alice), "");
    }
}
