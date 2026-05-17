// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IReferral {
    function getReferrer(address user) external view returns (address);
}

/// @title FeeDistributor
/// @notice Distributes swap fees proportionally to yUSDC holders.
///
/// Accounting model (corrected):
///   We accumulate rewardPerShareStored as USDC-per-share over time.
///   To detect "new" USDC that hasn't been included in rewardPerShareStored yet:
///
///     alreadyAccounted = rewardPerShareStored * totalShares / PRECISION - totalClaimed
///
///   `totalClaimed` tracks USDC that has been paid out. When rewards are claimed,
///   the balance decreases but `alreadyAccounted` should also decrease by the same
///   amount — subtracting `totalClaimed` achieves this.
///
///   Similarly, `directRewardsOutstanding` tracks USDC reserved for specific
///   addresses (referral bonuses) so those don't pollute the general pool math.
contract FeeDistributor is Ownable, ReentrancyGuard {
    IERC20 public immutable usdc;
    IERC20 public immutable yusdc;

    uint256 public rewardPerShareStored;
    uint256 public lastUpdateTime;

    /// @dev Running total of USDC paid out via claim()
    uint256 public totalClaimed;

    /// @dev USDC in contract reserved for specific addresses (referral rewards).
    uint256 public directRewardsOutstanding;

    mapping(address => uint256) public userRewardPerSharePaid;
    mapping(address => uint256) public rewards;

    IReferral public referralContract;

    uint256 private constant PRECISION = 1e18;
    uint256 public constant REFERRAL_PERCENT = 20;

    event RewardAdded(uint256 reward);
    event RewardPaid(address indexed user, uint256 reward);
    event ReferralRewardAdded(address indexed referrer, uint256 amount);
    event ReferralContractUpdated(address indexed newContract);

    constructor(address _usdc, address _yusdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_yusdc != address(0), "Invalid yUSDC address");
        usdc = IERC20(_usdc);
        yusdc = IERC20(_yusdc);
    }

    modifier updateReward(address account) {
        rewardPerShareStored = rewardPerShare();
        lastUpdateTime = block.timestamp;
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerSharePaid[account] = rewardPerShareStored;
        }
        _;
    }

    /// @notice Compute current rewardPerShare accumulator.
    ///
    ///   poolAvailable   = balance - directReserved
    ///   alreadyInRPS    = (rewardPerShareStored * totalShares / PRECISION) - totalClaimed
    ///   newRewards      = max(0, poolAvailable - alreadyInRPS)
    ///   return rps + newRewards * PRECISION / totalShares
    function rewardPerShare() public view returns (uint256) {
        uint256 totalShares = yusdc.totalSupply();
        if (totalShares == 0) return rewardPerShareStored;

        uint256 currentBalance = usdc.balanceOf(address(this));
        uint256 poolAvailable  = currentBalance > directRewardsOutstanding
            ? currentBalance - directRewardsOutstanding
            : 0;

        // How much USDC the stored rps represents, net of what's been paid out
        uint256 rpsTotal        = (rewardPerShareStored * totalShares) / PRECISION;
        uint256 alreadyAccounted = rpsTotal > totalClaimed ? rpsTotal - totalClaimed : 0;

        uint256 newRewards = poolAvailable > alreadyAccounted
            ? poolAvailable - alreadyAccounted
            : 0;

        return rewardPerShareStored + (newRewards * PRECISION / totalShares);
    }

    function earned(address account) public view returns (uint256) {
        uint256 userShares  = yusdc.balanceOf(account);
        uint256 rewardDelta = rewardPerShare() - userRewardPerSharePaid[account];
        return rewards[account] + (userShares * rewardDelta / PRECISION);
    }

    function setReferralContract(address _referralContract) external onlyOwner {
        require(_referralContract != address(0), "Invalid address");
        referralContract = IReferral(_referralContract);
        emit ReferralContractUpdated(_referralContract);
    }

    function notifyRewardAmount(uint256 amount, address user) external updateReward(address(0)) {
        require(amount > 0, "Amount must be >0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        address referrer = address(0);
        if (address(referralContract) != address(0)) {
            referrer = referralContract.getReferrer(user);
        }

        if (referrer != address(0) && referrer != user) {
            uint256 referrerReward = (amount * REFERRAL_PERCENT) / 100;

            if (referrerReward > 0) {
                directRewardsOutstanding += referrerReward;

                uint256 rps = rewardPerShare();
                rewardPerShareStored = rps;
                lastUpdateTime = block.timestamp;
                rewards[referrer] = _earnedWith(referrer, rps);
                userRewardPerSharePaid[referrer] = rps;
                rewards[referrer] += referrerReward;
                emit ReferralRewardAdded(referrer, referrerReward);
            }
            emit RewardAdded(amount - (amount * REFERRAL_PERCENT) / 100);
        } else {
            emit RewardAdded(amount);
        }
    }

    function claim() external nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        require(reward > 0, "No rewards to claim");
        rewards[msg.sender] = 0;

        totalClaimed += reward;

        if (directRewardsOutstanding > 0) {
            uint256 reduction = reward < directRewardsOutstanding ? reward : directRewardsOutstanding;
            directRewardsOutstanding -= reduction;
        }

        require(usdc.transfer(msg.sender, reward), "Transfer failed");
        emit RewardPaid(msg.sender, reward);
    }

    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        uint256 bal = usdc.balanceOf(address(this));
        require(amount <= bal, "Insufficient balance");
        require(usdc.transfer(to, amount), "Transfer failed");
    }

    function _earnedWith(address account, uint256 rps) internal view returns (uint256) {
        uint256 userShares  = yusdc.balanceOf(account);
        uint256 rewardDelta = rps - userRewardPerSharePaid[account];
        return rewards[account] + (userShares * rewardDelta / PRECISION);
    }
}
