// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVault {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
    function balanceOf(address account) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
}

interface ISwap {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns (uint256);
    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256 amountOut, uint256 fee);
}

interface IAgentReputation {
    function recordExecution(uint256 tokenId, bool success, uint256 valueManaged) external;
    function addressToTokenId(address agent) external view returns (uint256);
}

/// @title AgentExecutor
/// @notice On-chain automated strategy executor. Users approve this contract once;
///         the keeper (or user) can then trigger strategies on their behalf.
contract AgentExecutor is Ownable, ReentrancyGuard {

    // ─── Config per user ────────────────────────────────────────────────────
    struct AgentConfig {
        bool autoCompoundEnabled;
        bool rebalanceEnabled;
        bool yieldOptimizerEnabled;
        bool dcaEnabled;
        bool stopLossEnabled;
        uint256 maxAmountPerTxn;      // max USDC per execution (6 decimals), 0 = unlimited
        uint256 eurcRebalanceThreshold; // pct (0-100) EURC triggers rebalance, default 50
        uint256 stopLossApyBps;       // withdraw if APY < this (basis points), default 100 = 1%
        uint256 dcaAmountPerRun;      // USDC amount to DCA per run (6 decimals)
        uint256 lastAutoCompound;
        uint256 lastRebalance;
        uint256 lastYieldOptimizer;
        uint256 lastDca;
        bool configured;
    }

    mapping(address => AgentConfig) public configs;

    address public immutable vault;
    address public immutable swap;
    address public immutable usdc;
    address public immutable eurc;
    address public reputation;

    // Cooldowns
    uint256 public constant COMPOUND_COOLDOWN      = 23 hours;
    uint256 public constant REBALANCE_COOLDOWN     = 4 hours;
    uint256 public constant YIELD_OPT_COOLDOWN     = 1 hours;
    uint256 public constant DCA_COOLDOWN           = 7 days;
    uint256 public constant STOP_LOSS_COOLDOWN     = 12 hours;

    event StrategyExecuted(address indexed agent, string strategy, bool success, uint256 amount);
    event ConfigUpdated(address indexed agent);

    constructor(
        address _vault,
        address _swap,
        address _usdc,
        address _eurc,
        address _reputation
    ) Ownable(msg.sender) {
        vault = _vault;
        swap  = _swap;
        usdc  = _usdc;
        eurc  = _eurc;
        reputation = _reputation;
    }

    function setReputation(address _rep) external onlyOwner { reputation = _rep; }

    // ─── User sets their config ──────────────────────────────────────────────
    function configure(
        bool _autoCompound,
        bool _rebalance,
        bool _yieldOpt,
        bool _dca,
        bool _stopLoss,
        uint256 _maxAmount,
        uint256 _eurcThreshold,
        uint256 _stopLossApyBps,
        uint256 _dcaAmount
    ) external {
        AgentConfig storage c = configs[msg.sender];
        c.autoCompoundEnabled       = _autoCompound;
        c.rebalanceEnabled          = _rebalance;
        c.yieldOptimizerEnabled     = _yieldOpt;
        c.dcaEnabled                = _dca;
        c.stopLossEnabled           = _stopLoss;
        c.maxAmountPerTxn           = _maxAmount;
        c.eurcRebalanceThreshold    = _eurcThreshold == 0 ? 50 : _eurcThreshold;
        c.stopLossApyBps            = _stopLossApyBps == 0 ? 100 : _stopLossApyBps;
        c.dcaAmountPerRun           = _dcaAmount;
        c.configured                = true;
        emit ConfigUpdated(msg.sender);
    }

    // ─── Execute all enabled strategies for an agent ────────────────────────
    /// @notice Can be called by anyone (keeper or the agent themselves)
    function executeAll(address agent) external nonReentrant {
        AgentConfig storage c = configs[agent];
        require(c.configured, "Agent not configured");

        if (c.autoCompoundEnabled && block.timestamp >= c.lastAutoCompound + COMPOUND_COOLDOWN) {
            _executeAutoCompound(agent);
        }
        if (c.rebalanceEnabled && block.timestamp >= c.lastRebalance + REBALANCE_COOLDOWN) {
            _executeRebalance(agent);
        }
        if (c.yieldOptimizerEnabled && block.timestamp >= c.lastYieldOptimizer + YIELD_OPT_COOLDOWN) {
            _executeYieldOptimizer(agent);
        }
        if (c.dcaEnabled && block.timestamp >= c.lastDca + DCA_COOLDOWN) {
            _executeDCA(agent);
        }
    }

    // ─── Individual strategy executors ──────────────────────────────────────

    function executeAutoCompound(address agent) external nonReentrant {
        require(configs[agent].autoCompoundEnabled, "Not enabled");
        require(block.timestamp >= configs[agent].lastAutoCompound + COMPOUND_COOLDOWN, "Cooldown");
        _executeAutoCompound(agent);
    }

    function executeRebalance(address agent) external nonReentrant {
        require(configs[agent].rebalanceEnabled, "Not enabled");
        require(block.timestamp >= configs[agent].lastRebalance + REBALANCE_COOLDOWN, "Cooldown");
        _executeRebalance(agent);
    }

    function executeDCA(address agent) external nonReentrant {
        require(configs[agent].dcaEnabled, "Not enabled");
        require(block.timestamp >= configs[agent].lastDca + DCA_COOLDOWN, "Cooldown");
        _executeDCA(agent);
    }

    // ─── Internal strategy logic ─────────────────────────────────────────────

    function _executeAutoCompound(address agent) internal {
        AgentConfig storage c = configs[agent];
        c.lastAutoCompound = block.timestamp;

        uint256 bal = IERC20(usdc).balanceOf(agent);
        uint256 min = 1e6; // 1 USDC
        if (c.maxAmountPerTxn > 0 && bal > c.maxAmountPerTxn) bal = c.maxAmountPerTxn;

        bool success = false;
        uint256 deposited = 0;

        if (bal >= min) {
            try IERC20(usdc).transferFrom(agent, address(this), bal) returns (bool ok) {
                if (ok) {
                    IERC20(usdc).approve(vault, bal);
                    try IVault(vault).deposit(bal, agent) {
                        deposited = bal;
                        success = true;
                    } catch {
                        // refund if deposit fails
                        IERC20(usdc).transfer(agent, bal);
                    }
                }
            } catch {}
        } else {
            success = true; // no-op is still success
        }

        _recordExecution(agent, success, deposited);
        emit StrategyExecuted(agent, "auto-compound", success, deposited);
    }

    function _executeRebalance(address agent) internal {
        AgentConfig storage c = configs[agent];
        c.lastRebalance = block.timestamp;

        uint256 eurcBal = IERC20(eurc).balanceOf(agent);
        uint256 usdcBal = IERC20(usdc).balanceOf(agent);
        uint256 total   = eurcBal + usdcBal;

        bool success = false;
        uint256 swapped = 0;

        if (total > 0 && eurcBal * 100 > total * c.eurcRebalanceThreshold) {
            uint256 excess = eurcBal - (total * c.eurcRebalanceThreshold / 100);
            if (c.maxAmountPerTxn > 0 && excess > c.maxAmountPerTxn) excess = c.maxAmountPerTxn;

            try IERC20(eurc).transferFrom(agent, address(this), excess) returns (bool ok) {
                if (ok) {
                    IERC20(eurc).approve(swap, excess);
                    (uint256 minOut,) = ISwap(swap).getAmountOut(eurc, excess);
                    minOut = (minOut * 95) / 100; // 5% slippage
                    try ISwap(swap).swap(eurc, usdc, excess, minOut) returns (uint256 out) {
                        IERC20(usdc).transfer(agent, out);
                        swapped = out;
                        success = true;
                    } catch {
                        IERC20(eurc).transfer(agent, excess);
                    }
                }
            } catch {}
        } else {
            success = true;
        }

        _recordExecution(agent, success, swapped);
        emit StrategyExecuted(agent, "rebalance", success, swapped);
    }

    function _executeYieldOptimizer(address agent) internal {
        AgentConfig storage c = configs[agent];
        c.lastYieldOptimizer = block.timestamp;

        // Read vault position — if vault has assets, check growth since last snapshot
        // For testnet, simplified: just deposit idle USDC if any
        uint256 bal = IERC20(usdc).balanceOf(agent);
        uint256 min = 1e6;
        bool success = true;
        uint256 deposited = 0;

        if (bal >= min) {
            if (c.maxAmountPerTxn > 0 && bal > c.maxAmountPerTxn) bal = c.maxAmountPerTxn;
            try IERC20(usdc).transferFrom(agent, address(this), bal) returns (bool ok) {
                if (ok) {
                    IERC20(usdc).approve(vault, bal);
                    try IVault(vault).deposit(bal, agent) {
                        deposited = bal;
                    } catch {
                        IERC20(usdc).transfer(agent, bal);
                        success = false;
                    }
                }
            } catch { success = false; }
        }

        _recordExecution(agent, success, deposited);
        emit StrategyExecuted(agent, "yield-optimizer", success, deposited);
    }

    function _executeDCA(address agent) internal {
        AgentConfig storage c = configs[agent];
        c.lastDca = block.timestamp;

        uint256 amount = c.dcaAmountPerRun;
        if (amount == 0) { emit StrategyExecuted(agent, "dca", false, 0); return; }

        uint256 bal = IERC20(usdc).balanceOf(agent);
        if (bal < amount) amount = bal;

        bool success = false;
        uint256 deposited = 0;

        if (amount >= 1e6) {
            try IERC20(usdc).transferFrom(agent, address(this), amount) returns (bool ok) {
                if (ok) {
                    IERC20(usdc).approve(vault, amount);
                    try IVault(vault).deposit(amount, agent) {
                        deposited = amount;
                        success = true;
                    } catch {
                        IERC20(usdc).transfer(agent, amount);
                    }
                }
            } catch {}
        }

        _recordExecution(agent, success, deposited);
        emit StrategyExecuted(agent, "dca", success, deposited);
    }

    function _recordExecution(address agent, bool success, uint256 value) internal {
        if (reputation == address(0)) return;
        uint256 tokenId = IAgentReputation(reputation).addressToTokenId(agent);
        if (tokenId == 0) return;
        try IAgentReputation(reputation).recordExecution(tokenId, success, value) {} catch {}
    }

    // ─── View helpers ────────────────────────────────────────────────────────

    function getConfig(address agent) external view returns (AgentConfig memory) {
        return configs[agent];
    }

    function nextRunTime(address agent) external view returns (
        uint256 compoundAt,
        uint256 rebalanceAt,
        uint256 yieldOptAt,
        uint256 dcaAt
    ) {
        AgentConfig storage c = configs[agent];
        compoundAt  = c.lastAutoCompound  + COMPOUND_COOLDOWN;
        rebalanceAt = c.lastRebalance     + REBALANCE_COOLDOWN;
        yieldOptAt  = c.lastYieldOptimizer + YIELD_OPT_COOLDOWN;
        dcaAt       = c.lastDca           + DCA_COOLDOWN;
    }

    // Safety: owner can recover stuck tokens
    function recoverToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
}
