# YieldFi Agent v2 — Drop-in Files

## What's new
- **AgentReputation.sol** — On-chain trust scores (success rate + endorsements)
- **AgentExecutor.sol** — Automated strategy execution with cooldowns
- **StrategyMarketplace.sol** — Buy/sell strategies with USDC (10% platform fee)
- **agent/page.tsx** — 4-tab UI: Strategies, Reputation, Leaderboard, Marketplace

## Deployed addresses (Arc testnet)
- AgentReputation:     0x2f78abfCEAf61F0F6fA2a60738CaF15216ab0dE3
- AgentExecutor:       0xCFEeC6da527b0aF4ef2D69e953eAc8aF44124900
- StrategyMarketplace: 0x8c967Fc818Ab56CADAfe2b810Df34954270FaFE2

## Install

Copy each file into your repo matching the same path:

```
frontend/app/agent/page.tsx     → replaces your existing agent page
frontend/lib/constants.ts       → updated with new contract addresses
contracts/foundry.toml          → added via_ir=true for stack-depth fix
contracts/src/AgentReputation.sol   → new contract (already deployed)
contracts/src/AgentExecutor.sol     → new contract (already deployed)
contracts/src/StrategyMarketplace.sol → new contract (already deployed)
```

## How AgentExecutor works
1. User calls `configure(strategies[], cooldowns[], enabled[])` once
2. User approves USDC to the executor address
3. Anyone (keeper or user) calls `executeAll(userAddress)` — executes eligible strategies

## Cooldowns (seconds)
- autoCompound:    82800  (23h)
- rebalance:       14400  (4h)
- yieldOptimizer:  3600   (1h)
- DCA:             604800 (7d)
- stopLoss:        43200  (12h)
