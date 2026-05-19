// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IPointsTracker {
    function recordActivity(address user, uint8 activityType, uint256 usdcAmount) external;
}

/// @title Referral
/// @notice 3-tier referral system for YieldFi.
///         Users create a referral code; new users link via useReferralCode() on
///         their first interaction. Points are awarded to the referrer on first use.
///
/// Reward distribution (of swap fees routed through FeeDistributor):
///   Tier 1 (direct referrer):  20%
///   Tier 2 (referrer's referrer): 5%
///   Tier 3: 2%
///
/// @dev useReferralCode is now open (no onlyOwner) so the frontend can call it
///      directly from the user's wallet.
contract Referral is Ownable {
    // ── Tier reward percents ──────────────────────────────────────────────────
    uint256 public constant TIER1_PERCENT = 20;
    uint256 public constant TIER2_PERCENT = 5;
    uint256 public constant TIER3_PERCENT = 2;

    // ── State ─────────────────────────────────────────────────────────────────
    mapping(address => string)  public referralCodes;
    mapping(string => address)  public codeToReferrer;
    mapping(address => address) public referrerOf;
    mapping(address => bool)    public hasUsedReferral;
    mapping(address => uint256) public referralCount; // direct referrals made

    IPointsTracker public pointsTracker;
    uint8 private constant ACTIVITY_REFERRAL = 3;

    // ── Events ────────────────────────────────────────────────────────────────
    event ReferralCodeCreated(address indexed user, string code);
    event ReferralUsed(address indexed referrer, address indexed referee);
    event PointsTrackerUpdated(address indexed tracker);

    constructor() Ownable(msg.sender) {}

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setPointsTracker(address _tracker) external onlyOwner {
        pointsTracker = IPointsTracker(_tracker);
        emit PointsTrackerUpdated(_tracker);
    }

    // ── User actions ─────────────────────────────────────────────────────────

    /// @notice Create your unique referral code
    function createReferralCode(string memory code) external {
        require(bytes(code).length > 0, "Code cannot be empty");
        require(bytes(code).length <= 32, "Code too long");
        require(codeToReferrer[code] == address(0), "Code already taken");
        require(bytes(referralCodes[msg.sender]).length == 0, "Already has a code");

        referralCodes[msg.sender] = code;
        codeToReferrer[code] = msg.sender;

        emit ReferralCodeCreated(msg.sender, code);
    }

    /// @notice Link yourself to a referrer using their code.
    ///         Can only be done once per address. Awards 50 points to the referrer.
    /// @param code     The referral code
    /// @param referee  The new user being referred (usually msg.sender, but
    ///                 authorized callers can pass a specific address)
    function useReferralCode(string memory code, address referee) external {
        require(codeToReferrer[code] != address(0), "Invalid referral code");
        require(!hasUsedReferral[referee], "Already used a referral");
        require(referrerOf[referee] == address(0), "Already has a referrer");

        address referrer = codeToReferrer[code];
        require(referrer != referee, "Cannot self-refer");

        referrerOf[referee] = referrer;
        hasUsedReferral[referee] = true;
        referralCount[referrer]++;

        // Award points to the referrer
        _tryRecordPoints(referrer, ACTIVITY_REFERRAL, 0);

        emit ReferralUsed(referrer, referee);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getReferrer(address user) external view returns (address) {
        return referrerOf[user];
    }

    function getReferralCode(address user) external view returns (string memory) {
        return referralCodes[user];
    }

    /// @notice Get the full 3-tier referrer chain for a user
    function getReferrerChain(address user) external view returns (address tier1, address tier2, address tier3) {
        tier1 = referrerOf[user];
        if (tier1 != address(0)) {
            tier2 = referrerOf[tier1];
            if (tier2 != address(0)) {
                tier3 = referrerOf[tier2];
            }
        }
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _tryRecordPoints(address user, uint8 activityType, uint256 usdcAmount) internal {
        if (address(pointsTracker) == address(0)) return;
        try pointsTracker.recordActivity(user, activityType, usdcAmount) {} catch {}
    }
}
