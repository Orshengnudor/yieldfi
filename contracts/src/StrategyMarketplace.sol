// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StrategyMarketplace
/// @notice Agents can list, buy, and rate DeFi strategy templates
contract StrategyMarketplace is Ownable, ReentrancyGuard {

    struct Strategy {
        uint256 id;
        address creator;
        string  name;
        string  description;
        string  category;       // "compound", "rebalance", "dca", "arbitrage", etc.
        uint256 price;          // in USDC (6 decimals), 0 = free
        uint256 totalPurchases;
        uint256 ratingSum;      // sum of all ratings (1–5)
        uint256 totalRatings;
        bool    active;
        uint256 createdAt;
    }

    mapping(uint256 => Strategy) public strategies;
    mapping(address => uint256[]) public creatorStrategies;
    mapping(uint256 => mapping(address => bool)) public hasPurchased;
    mapping(uint256 => mapping(address => bool)) public hasRated;

    uint256 public nextId = 1;
    uint256 public platformFeeBps = 1000; // 10%
    address public immutable usdc;

    event StrategyListed(uint256 indexed id, address indexed creator, string name, uint256 price);
    event StrategyPurchased(uint256 indexed id, address indexed buyer);
    event StrategyRated(uint256 indexed id, address indexed rater, uint256 rating);
    event StrategyDeactivated(uint256 indexed id);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = _usdc;
    }

    function listStrategy(
        string calldata name,
        string calldata description,
        string calldata category,
        uint256 price
    ) external returns (uint256 id) {
        id = nextId++;
        strategies[id] = Strategy({
            id: id,
            creator: msg.sender,
            name: name,
            description: description,
            category: category,
            price: price,
            totalPurchases: 0,
            ratingSum: 0,
            totalRatings: 0,
            active: true,
            createdAt: block.timestamp
        });
        creatorStrategies[msg.sender].push(id);
        // Creator gets free access
        hasPurchased[id][msg.sender] = true;
        emit StrategyListed(id, msg.sender, name, price);
    }

    function purchaseStrategy(uint256 id) external nonReentrant {
        Strategy storage s = strategies[id];
        require(s.active, "Not active");
        require(!hasPurchased[id][msg.sender], "Already owned");

        if (s.price > 0) {
            uint256 fee = (s.price * platformFeeBps) / 10000;
            uint256 creatorShare = s.price - fee;
            IERC20(usdc).transferFrom(msg.sender, address(this), s.price);
            IERC20(usdc).transfer(s.creator, creatorShare);
            // fee stays in contract for owner to withdraw
        }

        hasPurchased[id][msg.sender] = true;
        s.totalPurchases++;
        emit StrategyPurchased(id, msg.sender);
    }

    function rateStrategy(uint256 id, uint256 rating) external {
        require(rating >= 1 && rating <= 5, "Rating 1-5");
        require(hasPurchased[id][msg.sender], "Must own to rate");
        require(!hasRated[id][msg.sender], "Already rated");

        strategies[id].ratingSum += rating;
        strategies[id].totalRatings++;
        hasRated[id][msg.sender] = true;
        emit StrategyRated(id, msg.sender, rating);
    }

    function deactivate(uint256 id) external {
        require(strategies[id].creator == msg.sender || msg.sender == owner(), "Not creator");
        strategies[id].active = false;
        emit StrategyDeactivated(id);
    }

    /// @notice Returns average rating * 100 (e.g. 450 = 4.5 stars)
    function getAverageRating(uint256 id) external view returns (uint256) {
        Strategy storage s = strategies[id];
        if (s.totalRatings == 0) return 0;
        return (s.ratingSum * 100) / s.totalRatings;
    }

    /// @notice Paginated strategy list (all active)
    function getStrategies(uint256 offset, uint256 limit) external view returns (Strategy[] memory result) {
        uint256 total = nextId - 1;
        if (offset >= total) return new Strategy[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        result = new Strategy[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = strategies[i + 1]; // ids start at 1
        }
    }

    function getCreatorStrategies(address creator) external view returns (uint256[] memory) {
        return creatorStrategies[creator];
    }

    function setPlatformFee(uint256 bps) external onlyOwner {
        require(bps <= 3000, "Max 30%");
        platformFeeBps = bps;
    }

    function withdrawFees() external onlyOwner {
        uint256 bal = IERC20(usdc).balanceOf(address(this));
        IERC20(usdc).transfer(owner(), bal);
    }
}
