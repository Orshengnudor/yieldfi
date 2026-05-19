// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title PointsTracker
/// @notice On-chain leaderboard engine for YieldFi.
///         Authorized protocol contracts call recordActivity() which mints points
///         to users. Points are permanent and cumulative — they determine tier.
///
/// Tiers (cumulative points):
///   Bronze   0 – 499
///   Silver   500 – 1,999
///   Gold     2,000 – 4,999
///   Platinum 5,000 – 9,999
///   Champion 10,000+
///
/// Point values per activity:
///   SWAP     10 base + 1 per $10 of volume (amountUSDC / 10e6)
///   DEPOSIT  20 base + 1 per $10 deposited
///   REFERRAL 50 flat (awarded to referrer when referee does first swap)
///   BRIDGE   15 flat
///   STAKE    25 flat
contract PointsTracker is Ownable {
    // ── Activity type constants ──────────────────────────────────────────────
    uint8 public constant ACTIVITY_SWAP    = 1;
    uint8 public constant ACTIVITY_DEPOSIT = 2;
    uint8 public constant ACTIVITY_REFERRAL = 3;
    uint8 public constant ACTIVITY_BRIDGE  = 4;
    uint8 public constant ACTIVITY_STAKE   = 5;

    // ── Tier thresholds ──────────────────────────────────────────────────────
    uint256 public constant TIER_SILVER_MIN   = 500;
    uint256 public constant TIER_GOLD_MIN     = 2_000;
    uint256 public constant TIER_PLATINUM_MIN = 5_000;
    uint256 public constant TIER_CHAMPION_MIN = 10_000;

    // ── State ────────────────────────────────────────────────────────────────
    /// @dev address => total accumulated points
    mapping(address => uint256) public points;

    /// @dev Contracts allowed to call recordActivity
    mapping(address => bool) public authorizedCallers;

    /// @dev All users who have ever earned points (for enumeration)
    address[] public participants;
    mapping(address => bool) private _isParticipant;

    // ── Events ───────────────────────────────────────────────────────────────
    event PointsAdded(address indexed user, uint8 indexed activityType, uint256 pointsAwarded, uint256 totalPoints);
    event CallerAuthorized(address indexed caller, bool authorized);

    constructor() Ownable(msg.sender) {}

    // ── Admin ────────────────────────────────────────────────────────────────

    /// @notice Authorize or deauthorize a contract to record points
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

    // ── Core recording ───────────────────────────────────────────────────────

    /// @notice Record an activity and award points.
    /// @param user         The user earning points
    /// @param activityType One of the ACTIVITY_* constants
    /// @param usdcAmount   Amount in USDC (6 decimals) — used for volume-scaled activities.
    ///                     Pass 0 for flat-rate activities (BRIDGE, STAKE, REFERRAL).
    function recordActivity(address user, uint8 activityType, uint256 usdcAmount) external {
        require(authorizedCallers[msg.sender] || msg.sender == owner(), "Not authorized");
        require(user != address(0), "Invalid user");

        uint256 pts = _calculatePoints(activityType, usdcAmount);
        require(pts > 0, "Zero points");

        if (!_isParticipant[user]) {
            _isParticipant[user] = true;
            participants.push(user);
        }

        points[user] += pts;
        emit PointsAdded(user, activityType, pts, points[user]);
    }

    /// @notice Owner can manually award points (e.g. for bridge/referral events tracked off-chain)
    function awardPoints(address user, uint8 activityType, uint256 pts) external onlyOwner {
        require(user != address(0), "Invalid user");
        require(pts > 0, "Zero points");

        if (!_isParticipant[user]) {
            _isParticipant[user] = true;
            participants.push(user);
        }

        points[user] += pts;
        emit PointsAdded(user, activityType, pts, points[user]);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice Returns tier name for a user
    function getTier(address user) external view returns (string memory) {
        return _tierName(points[user]);
    }

    /// @notice Returns tier index: 0=Bronze 1=Silver 2=Gold 3=Platinum 4=Champion
    function getTierIndex(address user) external view returns (uint8) {
        return _tierIndex(points[user]);
    }

    /// @notice Total number of unique participants
    function participantCount() external view returns (uint256) {
        return participants.length;
    }

    /// @notice Paginated leaderboard — returns users + points sorted descending.
    ///         NOTE: sorting is done off-chain by the indexer for gas efficiency.
    ///         This just returns raw data for a page.
    function getParticipants(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory users, uint256[] memory pts)
    {
        uint256 total = participants.length;
        if (offset >= total) return (new address[](0), new uint256[](0));
        uint256 end = offset + limit > total ? total : offset + limit;
        uint256 len = end - offset;
        users = new address[](len);
        pts   = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            users[i] = participants[offset + i];
            pts[i]   = points[participants[offset + i]];
        }
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _calculatePoints(uint8 activityType, uint256 usdcAmount) internal pure returns (uint256) {
        if (activityType == ACTIVITY_SWAP) {
            // 10 base + 1 per $10 swapped (1 USDC = 1e6)
            return 10 + usdcAmount / 10e6;
        }
        if (activityType == ACTIVITY_DEPOSIT) {
            // 20 base + 1 per $10 deposited
            return 20 + usdcAmount / 10e6;
        }
        if (activityType == ACTIVITY_REFERRAL) {
            return 50;
        }
        if (activityType == ACTIVITY_BRIDGE) {
            return 15;
        }
        if (activityType == ACTIVITY_STAKE) {
            return 25;
        }
        return 5; // minimum fallback
    }

    function _tierIndex(uint256 pts) internal pure returns (uint8) {
        if (pts >= TIER_CHAMPION_MIN)  return 4;
        if (pts >= TIER_PLATINUM_MIN)  return 3;
        if (pts >= TIER_GOLD_MIN)      return 2;
        if (pts >= TIER_SILVER_MIN)    return 1;
        return 0;
    }

    function _tierName(uint256 pts) internal pure returns (string memory) {
        if (pts >= TIER_CHAMPION_MIN)  return "Champion";
        if (pts >= TIER_PLATINUM_MIN)  return "Platinum";
        if (pts >= TIER_GOLD_MIN)      return "Gold";
        if (pts >= TIER_SILVER_MIN)    return "Silver";
        return "Bronze";
    }
}
