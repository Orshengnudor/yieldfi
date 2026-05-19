// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPointsTracker {
    function recordActivity(address user, uint8 activityType, uint256 usdcAmount) external;
}

/// @title StakingRewards
/// @notice Stake yUSDC for a chosen lock duration and earn bonus USDC rewards.
///         Longer locks = higher reward multiplier.
///         Points are awarded when a stake is created.
///
/// Multipliers:
///   >= 365 days  2.00x
///   >= 180 days  1.50x
///   >=  90 days  1.25x
///   >=  30 days  1.10x
///   >=   7 days  1.00x (min lock)
///
/// Reward rate: set by owner via notifyRewardAmount(). Uses standard
///              reward-per-token accumulator pattern (same as Synthetix).
contract StakingRewards is Ownable, ReentrancyGuard {
    // ── Tokens ────────────────────────────────────────────────────────────────
    IERC20 public immutable yusdc;  // staking token
    IERC20 public immutable usdc;   // reward token

    // ── Lock durations ────────────────────────────────────────────────────────
    uint256 public constant MIN_LOCK = 7 days;
    uint256 public constant MAX_LOCK = 365 days;

    // ── Reward accounting ─────────────────────────────────────────────────────
    uint256 public rewardRate;           // USDC per second (6 decimals)
    uint256 public rewardsDuration = 30 days;
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    // ── Stakes ────────────────────────────────────────────────────────────────
    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
        uint256 lockDuration;
        uint256 multiplierBps; // e.g. 20000 = 2.00x (basis points × 10000)
    }

    mapping(address => StakeInfo[]) public userStakes;
    mapping(address => uint256) public stakedBalance; // per-user total staked
    uint256 public totalStaked;

    // ── Points ────────────────────────────────────────────────────────────────
    IPointsTracker public pointsTracker;
    uint8 private constant ACTIVITY_STAKE = 5;

    // ── Events ────────────────────────────────────────────────────────────────
    event Staked(address indexed user, uint256 stakeIndex, uint256 amount, uint256 lockDuration, uint256 multiplierBps);
    event Unstaked(address indexed user, uint256 stakeIndex, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(uint256 reward);
    event PointsTrackerUpdated(address indexed tracker);

    constructor(address _yusdc, address _usdc) Ownable(msg.sender) {
        yusdc = IERC20(_yusdc);
        usdc  = IERC20(_usdc);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Fund the contract with USDC rewards and start a new reward period
    function notifyRewardAmount(uint256 reward) external onlyOwner updateReward(address(0)) {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / rewardsDuration;
        }
        require(rewardRate > 0, "Reward rate = 0");

        uint256 balance = usdc.balanceOf(address(this));
        require(rewardRate <= balance / rewardsDuration, "Provided reward too high");

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;

        require(usdc.transferFrom(msg.sender, address(this), reward), "Transfer failed");
        emit RewardAdded(reward);
    }

    function setRewardsDuration(uint256 _duration) external onlyOwner {
        require(block.timestamp > periodFinish, "Period not finished");
        rewardsDuration = _duration;
    }

    function setPointsTracker(address _tracker) external onlyOwner {
        pointsTracker = IPointsTracker(_tracker);
        emit PointsTrackerUpdated(_tracker);
    }

    // ── Staking ───────────────────────────────────────────────────────────────

    /// @notice Stake yUSDC for a locked duration
    /// @param amount       Amount of yUSDC to stake
    /// @param lockDuration Lock duration in seconds (MIN_LOCK to MAX_LOCK)
    function stake(uint256 amount, uint256 lockDuration)
        external
        nonReentrant
        updateReward(msg.sender)
    {
        require(amount > 0, "Cannot stake 0");
        require(lockDuration >= MIN_LOCK && lockDuration <= MAX_LOCK, "Invalid lock duration");

        uint256 multiplierBps = _getMultiplierBps(lockDuration);

        yusdc.transferFrom(msg.sender, address(this), amount);
        totalStaked += amount;
        stakedBalance[msg.sender] += amount;

        userStakes[msg.sender].push(StakeInfo({
            amount: amount,
            startTime: block.timestamp,
            lockDuration: lockDuration,
            multiplierBps: multiplierBps
        }));

        uint256 stakeIndex = userStakes[msg.sender].length - 1;

        // Award points
        _tryRecordPoints(msg.sender, ACTIVITY_STAKE, 0);

        emit Staked(msg.sender, stakeIndex, amount, lockDuration, multiplierBps);
    }

    /// @notice Unstake after lock expires. Collects pending rewards at the same time.
    /// @param stakeIndex  Index in userStakes[msg.sender]
    function unstake(uint256 stakeIndex) external nonReentrant updateReward(msg.sender) {
        StakeInfo[] storage stakes = userStakes[msg.sender];
        require(stakeIndex < stakes.length, "Invalid index");

        StakeInfo memory s = stakes[stakeIndex];
        require(block.timestamp >= s.startTime + s.lockDuration, "Still locked");

        uint256 amount = s.amount;
        totalStaked -= amount;
        stakedBalance[msg.sender] -= amount;

        // Swap with last element and pop
        stakes[stakeIndex] = stakes[stakes.length - 1];
        stakes.pop();

        // Collect rewards
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            // Apply multiplier: boostedReward = reward * multiplierBps / 10000
            uint256 boostedReward = (reward * s.multiplierBps) / 10_000;
            // Cap to available balance
            uint256 available = usdc.balanceOf(address(this));
            if (boostedReward > available) boostedReward = available;
            if (boostedReward > 0) {
                usdc.transfer(msg.sender, boostedReward);
                emit RewardPaid(msg.sender, boostedReward);
            }
        }

        yusdc.transfer(msg.sender, amount);
        emit Unstaked(msg.sender, stakeIndex, amount);
    }

    /// @notice Claim accrued rewards without unstaking
    function claimRewards() external nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        require(reward > 0, "No rewards");
        rewards[msg.sender] = 0;
        usdc.transfer(msg.sender, reward);
        emit RewardPaid(msg.sender, reward);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function stakeCount(address user) external view returns (uint256) {
        return userStakes[user].length;
    }

    function earned(address account) public view returns (uint256) {
        uint256 userBal = stakedBalance[account];
        return
            (userBal * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18
                + rewards[account];
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        return
            rewardPerTokenStored +
            ((_lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / totalStaked;
    }

    function getMultiplier(uint256 lockDuration) external pure returns (uint256 bps) {
        return _getMultiplierBps(lockDuration);
    }

    function isUnlocked(address user, uint256 stakeIndex) external view returns (bool) {
        StakeInfo memory s = userStakes[user][stakeIndex];
        return block.timestamp >= s.startTime + s.lockDuration;
    }

    function timeUntilUnlock(address user, uint256 stakeIndex) external view returns (uint256) {
        StakeInfo memory s = userStakes[user][stakeIndex];
        uint256 unlockTime = s.startTime + s.lockDuration;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = _lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _lastTimeRewardApplicable() internal view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function _getMultiplierBps(uint256 lockDuration) internal pure returns (uint256) {
        if (lockDuration >= 365 days) return 20_000; // 2.00x
        if (lockDuration >= 180 days) return 15_000; // 1.50x
        if (lockDuration >= 90 days)  return 12_500; // 1.25x
        if (lockDuration >= 30 days)  return 11_000; // 1.10x
        return 10_000;                                // 1.00x
    }

    function _tryRecordPoints(address user, uint8 activityType, uint256 usdcAmount) internal {
        if (address(pointsTracker) == address(0)) return;
        try pointsTracker.recordActivity(user, activityType, usdcAmount) {} catch {}
    }
}
