// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IReferral {
    function getReferrer(address user) external view returns (address);
}

contract FeeDistributor is Ownable, ReentrancyGuard {
    IERC20 public immutable usdc;
    IERC20 public immutable yusdc;

    uint256 public rewardPerShareStored;
    uint256 public lastUpdateTime;

    mapping(address => uint256) public userRewardPerSharePaid;
    mapping(address => uint256) public rewards;

    // Referral contract address
    IReferral public referralContract;

    uint256 private constant PRECISION = 1e18;
    uint256 public constant REFERRAL_PERCENT = 20; // 20% of fees go to referrer

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

    function rewardPerShare() public view returns (uint256) {
        uint256 totalShares = yusdc.totalSupply();
        if (totalShares == 0) {
            return rewardPerShareStored;
        }
        uint256 currentBalance = usdc.balanceOf(address(this));
        // total distributed rewards = rewardPerShareStored * totalShares / PRECISION
        uint256 totalDistributed = (rewardPerShareStored * totalShares) / PRECISION;
        uint256 newRewards = currentBalance > totalDistributed ? currentBalance - totalDistributed : 0;
        return rewardPerShareStored + (newRewards * PRECISION / totalShares);
    }

    function earned(address account) public view returns (uint256) {
        uint256 userShares = yusdc.balanceOf(account);
        uint256 rewardDelta = rewardPerShare() - userRewardPerSharePaid[account];
        return rewards[account] + (userShares * rewardDelta / PRECISION);
    }

    // Set the referral contract address (only owner)
    function setReferralContract(address _referralContract) external onlyOwner {
        require(_referralContract != address(0), "Invalid address");
        referralContract = IReferral(_referralContract);
        emit ReferralContractUpdated(_referralContract);
    }

    // Notify of new fees from swaps. Called by the swap API.
    // Transfers the fee amount from the caller to this contract.
    // If the user has a referrer, we directly add 20% of the fee to the referrer's rewards.
    // The remaining 80% stays in the pool for all yUSDC holders.
    function notifyRewardAmount(uint256 amount, address user) external updateReward(address(0)) {
        require(amount > 0, "Amount must be >0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        address referrer = address(0);
        if (address(referralContract) != address(0)) {
            referrer = referralContract.getReferrer(user);
        }

        if (referrer != address(0) && referrer != user) {
            uint256 referrerReward = (amount * REFERRAL_PERCENT) / 100;
            uint256 poolReward = amount - referrerReward;

            if (referrerReward > 0) {
                // Add referrer reward directly to referrer's pending rewards
                // Update the referrer's checkpoint before adding
                rewardPerShareStored = rewardPerShare();
                lastUpdateTime = block.timestamp;
                // Compute current earned for referrer and set checkpoint
                rewards[referrer] = earned(referrer);
                userRewardPerSharePaid[referrer] = rewardPerShareStored;
                rewards[referrer] += referrerReward;
                emit ReferralRewardAdded(referrer, referrerReward);
            }
            // The poolReward is automatically accounted for because the contract's USDC balance increased.
            // The next rewardPerShare calculation will include it proportionally to the pool's total shares.
            emit RewardAdded(poolReward);
        } else {
            emit RewardAdded(amount);
        }
    }

    // Claim rewards for the caller
    function claim() external nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        require(reward > 0, "No rewards to claim");
        rewards[msg.sender] = 0;
        require(usdc.transfer(msg.sender, reward), "Transfer failed");
        emit RewardPaid(msg.sender, reward);
    }

    // Emergency withdraw (only owner)
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        require(amount <= usdc.balanceOf(address(this)), "Insufficient balance");
        require(usdc.transfer(to, amount), "Transfer failed");
    }
}