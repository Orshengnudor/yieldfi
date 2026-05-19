/**
 * YieldFi Points Indexer + REST API
 *
 * Polls PointsAdded events from PointsTracker.sol and serves:
 *   GET /leaderboard          → top 100 users sorted by total points
 *   GET /user/:address        → single-user stats (points, tier, rank)
 *   GET /health               → uptime check
 *
 * Storage: sql.js (in-memory, persisted to ./points.db.json on writes)
 * Runs on port 3001
 */

import express from "express";
import cors from "cors";
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createPublicClient, http, parseAbiItem } from "viem";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");

// ── Config ──────────────────────────────────────────────────────────────────
const PORT = 3001;
const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const POINTS_TRACKER = "0x82fFAA304D6b81406b63718AdCC7509CdD01ef8e";
const POLL_INTERVAL_MS = 15_000;
const DB_PATH = "./points.db.bin";

function getTier(pts) {
  if (pts >= 10000) return "CHAMPION";
  if (pts >= 5000)  return "PLATINUM";
  if (pts >= 2000)  return "GOLD";
  if (pts >= 500)   return "SILVER";
  return "BRONZE";
}

// ── Viem client ─────────────────────────────────────────────────────────────
const arcTestnet = {
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const client = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });

const POINTS_ADDED_ABI = parseAbiItem(
  "event PointsAdded(address indexed user, uint256 amount, string activity)"
);

// ── SQL.js ───────────────────────────────────────────────────────────────────
let db;

async function initDb() {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const data = readFileSync(DB_PATH);
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS points (
      address TEXT PRIMARY KEY,
      total   INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS events (
      tx_hash  TEXT,
      log_idx  INTEGER,
      address  TEXT,
      amount   INTEGER,
      activity TEXT,
      block    INTEGER,
      PRIMARY KEY (tx_hash, log_idx)
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  saveDb();
}

function saveDb() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

function getLastBlock() {
  const res = db.exec("SELECT value FROM meta WHERE key = 'last_block'");
  return res.length && res[0].values.length ? BigInt(res[0].values[0][0]) : 0n;
}
function setLastBlock(n) {
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_block', ?)", [n.toString()]);
}

// ── Indexer ──────────────────────────────────────────────────────────────────
async function poll() {
  try {
    const latest = await client.getBlockNumber();
    const from = getLastBlock();
    if (from >= latest) return;

    const CHUNK = 500n;
    let cursor = from;
    let totalProcessed = 0;

    while (cursor < latest) {
      const to = cursor + CHUNK < latest ? cursor + CHUNK : latest;

      const logs = await client.getLogs({
        address: POINTS_TRACKER,
        event: POINTS_ADDED_ABI,
        fromBlock: cursor + 1n,
        toBlock: to,
      });

      for (const log of logs) {
        const addr = log.args.user.toLowerCase();
        const amount = Number(log.args.amount);
        const activity = log.args.activity;
        const txHash = log.transactionHash;
        const logIdx = log.logIndex;
        const block = Number(log.blockNumber);

        // Check if already indexed
        const existing = db.exec(
          `SELECT 1 FROM events WHERE tx_hash = '${txHash}' AND log_idx = ${logIdx}`
        );
        if (!existing.length || !existing[0].values.length) {
          db.run(
            "INSERT INTO events (tx_hash, log_idx, address, amount, activity, block) VALUES (?,?,?,?,?,?)",
            [txHash, logIdx, addr, amount, activity, block]
          );
          db.run(
            `INSERT INTO points (address, total) VALUES (?, ?)
             ON CONFLICT(address) DO UPDATE SET total = total + ?`,
            [addr, amount, amount]
          );
          totalProcessed++;
        }
      }

      cursor = to;
    }

    setLastBlock(latest);
    if (totalProcessed > 0) {
      console.log(`[indexer] Processed ${totalProcessed} events up to block ${latest}`);
      saveDb();
    }
  } catch (err) {
    console.error("[indexer] poll error:", err.message);
  }
}

// ── REST API ─────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get("/leaderboard", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const result = db.exec(`SELECT address, total FROM points ORDER BY total DESC LIMIT ${limit}`);
  const rows = result.length ? result[0].values : [];
  const data = rows.map((r, i) => ({
    rank: i + 1,
    address: r[0],
    points: r[1],
    tier: getTier(r[1]),
  }));
  res.json({ data, updatedAt: Date.now() });
});

app.get("/user/:address", (req, res) => {
  const addr = req.params.address.toLowerCase();
  const pointsRes = db.exec(`SELECT total FROM points WHERE address = '${addr}'`);
  if (!pointsRes.length || !pointsRes[0].values.length) {
    return res.json({ address: addr, points: 0, tier: "BRONZE", rank: null });
  }
  const total = pointsRes[0].values[0][0];

  const rankRes = db.exec(`SELECT COUNT(*) FROM points WHERE total > ${total}`);
  const rank = (rankRes.length ? rankRes[0].values[0][0] : 0) + 1;

  const histRes = db.exec(
    `SELECT amount, activity, block FROM events WHERE address = '${addr}' ORDER BY block DESC LIMIT 50`
  );
  const history = histRes.length
    ? histRes[0].values.map(r => ({ amount: r[0], activity: r[1], block: r[2] }))
    : [];

  res.json({ address: addr, points: total, tier: getTier(total), rank, history });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  await initDb();
  console.log("[db] SQLite initialized");

  poll();
  setInterval(poll, POLL_INTERVAL_MS);

  app.listen(PORT, () => console.log(`[api] YieldFi backend running on :${PORT}`));
})();
