// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentReputation
/// @notice Tracks on-chain reputation scores for ERC-8004 registered agents
contract AgentReputation is Ownable {

    struct ReputationScore {
        uint256 totalExecutions;
        uint256 successfulExecutions;
        uint256 totalValueManaged;   // in USDC (6 decimals)
        uint256 trustScore;          // 0–100
        uint256 lastUpdated;
        string  agentName;
        address agentAddress;
    }

    mapping(uint256 => ReputationScore) public scores;          // tokenId => score
    mapping(uint256 => mapping(address => bool)) public endorsed; // tokenId => endorser => endorsed
    mapping(uint256 => uint256) public endorsementCount;
    mapping(address => uint256) public addressToTokenId;        // agent addr => tokenId
    uint256[] public registeredTokenIds;

    // Authorised callers (AgentExecutor contract + owner)
    mapping(address => bool) public authorised;

    event ReputationUpdated(uint256 indexed tokenId, uint256 newTrustScore);
    event AgentEndorsed(uint256 indexed tokenId, address indexed endorser);
    event AgentRegistered(uint256 indexed tokenId, address indexed agentAddress, string name);

    constructor() Ownable(msg.sender) {
        authorised[msg.sender] = true;
    }

    modifier onlyAuthorised() {
        require(authorised[msg.sender] || msg.sender == owner(), "Not authorised");
        _;
    }

    function setAuthorised(address caller, bool allowed) external onlyOwner {
        authorised[caller] = allowed;
    }

    /// @notice Register or update agent address → tokenId mapping
    function registerAgent(uint256 tokenId, address agentAddress, string calldata name) external onlyAuthorised {
        if (scores[tokenId].agentAddress == address(0)) {
            registeredTokenIds.push(tokenId);
        }
        scores[tokenId].agentAddress = agentAddress;
        scores[tokenId].agentName = name;
        addressToTokenId[agentAddress] = tokenId;
        emit AgentRegistered(tokenId, agentAddress, name);
    }

    /// @notice Record a strategy execution result
    function recordExecution(
        uint256 tokenId,
        bool success,
        uint256 valueManaged
    ) external onlyAuthorised {
        ReputationScore storage s = scores[tokenId];
        s.totalExecutions++;
        if (success) s.successfulExecutions++;
        s.totalValueManaged += valueManaged;
        s.lastUpdated = block.timestamp;
        _recalcTrust(tokenId);
        emit ReputationUpdated(tokenId, s.trustScore);
    }

    /// @notice Endorse another agent (each address can endorse once per tokenId)
    function endorse(uint256 tokenId) external {
        require(scores[tokenId].agentAddress != address(0), "Agent not registered");
        require(!endorsed[tokenId][msg.sender], "Already endorsed");
        endorsed[tokenId][msg.sender] = true;
        endorsementCount[tokenId]++;
        _recalcTrust(tokenId);
        emit AgentEndorsed(tokenId, msg.sender);
    }

    function _recalcTrust(uint256 tokenId) internal {
        ReputationScore storage s = scores[tokenId];
        if (s.totalExecutions == 0) { s.trustScore = 0; return; }
        uint256 successRate = (s.successfulExecutions * 80) / s.totalExecutions; // max 80
        uint256 bonus = endorsementCount[tokenId] > 20 ? 20 : endorsementCount[tokenId]; // max 20
        s.trustScore = successRate + bonus;
    }

    function getScore(uint256 tokenId) external view returns (ReputationScore memory) {
        return scores[tokenId];
    }

    function getScoreByAddress(address agent) external view returns (ReputationScore memory) {
        return scores[addressToTokenId[agent]];
    }

    /// @notice Return top N agents sorted by trust score (simple insertion, gas-heavy — use off-chain for large sets)
    function getTopAgents(uint256 n) external view returns (ReputationScore[] memory top) {
        uint256 total = registeredTokenIds.length;
        if (n > total) n = total;
        top = new ReputationScore[](n);

        // Copy all into memory array
        ReputationScore[] memory all = new ReputationScore[](total);
        for (uint256 i = 0; i < total; i++) {
            all[i] = scores[registeredTokenIds[i]];
        }

        // Partial selection sort for top n
        for (uint256 i = 0; i < n; i++) {
            uint256 best = i;
            for (uint256 j = i + 1; j < total; j++) {
                if (all[j].trustScore > all[best].trustScore) best = j;
            }
            top[i] = all[best];
            // swap
            ReputationScore memory tmp = all[i];
            all[i] = all[best];
            all[best] = tmp;
        }
    }

    function totalAgents() external view returns (uint256) {
        return registeredTokenIds.length;
    }
}
