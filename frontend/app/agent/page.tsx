'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  usePublicClient,
  useWalletClient,
} from 'wagmi';
import ClientOnly from '../components/ClientOnly';
import StatCard from '../components/StatCard';
import { showToast, updateToast } from '../components/TxToast';
import {
  ERC8004_IDENTITY_REGISTRY,
  ERC8004_REPUTATION_REGISTRY,
  ARCSCAN_TX,
  ARCSCAN_ADDR,
  VAULT_ADDRESS,
  USDC_ADDRESS,
  EURC_ADDRESS,
  SWAP_ADDRESS,
  USDC_DECIMALS,
} from '@/lib/constants';
import { parseAbiItem, parseUnits, formatUnits } from 'viem';

// ─── Correct ERC-8004 ABI (ERC-721 based, register(string) mints NFT) ──────
const IDENTITY_ABI = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'metadataURI', type: 'string' }],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const VAULT_ABI = [
  {
    name: 'totalAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
] as const;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ─── Agent strategies ────────────────────────────────────────────────────────
const STRATEGIES = [
  {
    id: 'auto-compound',
    label: 'Auto-Compound Vault',
    description: 'Automatically re-deposits USDC yield back into the vault every 24h to maximize APY.',
    icon: '🔄',
  },
  {
    id: 'rebalance',
    label: 'USDC/EURC Rebalancer',
    description: 'Monitors your USDC and EURC balances. If EURC > 50% of holdings, swaps back to USDC for vault deposit.',
    icon: '⚖️',
  },
  {
    id: 'yield-optimizer',
    label: 'Yield Optimizer',
    description: 'Tracks vault APY every hour. Deposits idle wallet USDC if APY > 5%, withdraws to wallet if APY < 1%.',
    icon: '📈',
  },
];

const AGENT_TYPES = ['DeFiAgent', 'YieldOptimizer', 'LiquidityProvider', 'ArbitrageBot', 'Custom'];

// ─── Stored agent config ─────────────────────────────────────────────────────
interface AgentConfig {
  tokenId: string;
  metadataURI: string;
  enabledStrategies: string[];
  lastRun: Record<string, number>;
  registeredAt: number;
}

function loadAgentConfig(address: string): AgentConfig | null {
  try {
    const raw = localStorage.getItem(`agent_config_${address}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveAgentConfig(address: string, cfg: AgentConfig) {
  localStorage.setItem(`agent_config_${address}`, JSON.stringify(cfg));
}

// ─── AgentRunner: executes strategies ────────────────────────────────────────
function useAgentRunner(address: `0x${string}` | undefined, config: AgentConfig | null) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const [logs, setLogs] = useState<{ ts: number; msg: string; type: 'info' | 'success' | 'error' }[]>([]);
  const [running, setRunning] = useState(false);

  const log = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{ ts: Date.now(), msg, type }, ...prev].slice(0, 30));
  }, []);

  const runAutoCompound = useCallback(async () => {
    if (!address || !writeContractAsync || !publicClient) return;
    log('Auto-compound: checking vault position…');
    try {
      const shares = await publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      const assets = await publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'convertToAssets',
        args: [shares as bigint],
      });
      const walletBal = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      log(`Vault position: ${formatUnits(assets as bigint, USDC_DECIMALS)} USDC | Wallet: ${formatUnits(walletBal as bigint, USDC_DECIMALS)} USDC`);

      // If wallet has idle USDC > 1 USDC, re-deposit it
      const minDeposit = parseUnits('1', USDC_DECIMALS);
      if ((walletBal as bigint) > minDeposit) {
        log(`Idle USDC detected (${formatUnits(walletBal as bigint, USDC_DECIMALS)} USDC) — approving vault…`);
        const approveTx = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [VAULT_ADDRESS, walletBal as bigint],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx, pollingInterval: 15_000 });
        log('Approval confirmed — depositing into vault…');

        const depositTx = await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'deposit',
          args: [walletBal as bigint, address],
        });
        await publicClient.waitForTransactionReceipt({ hash: depositTx, pollingInterval: 15_000 });
        log(`Auto-compound: deposited ${formatUnits(walletBal as bigint, USDC_DECIMALS)} USDC into vault ✓`, 'success');
      } else {
        log('No idle USDC to compound. Position is optimal.', 'success');
      }
    } catch (e: any) {
      log(`Auto-compound error: ${e?.shortMessage ?? e?.message}`, 'error');
    }
  }, [address, writeContractAsync, publicClient, log]);

  const runRebalance = useCallback(async () => {
    if (!address || !writeContractAsync || !publicClient) return;
    log('Rebalancer: checking USDC/EURC balances…');
    try {
      const usdcBal = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;
      const eurcBal = await publicClient.readContract({
        address: EURC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;

      const total = usdcBal + eurcBal;
      if (total === 0n) { log('No USDC or EURC balance to rebalance.'); return; }

      const eurcPct = Number((eurcBal * 100n) / total);
      log(`EURC: ${eurcPct}% of holdings | USDC: ${100 - eurcPct}%`);

      if (eurcPct > 50) {
        const swapAmt = eurcBal / 2n; // swap half EURC back to USDC
        log(`EURC > 50% — swapping ${formatUnits(swapAmt, USDC_DECIMALS)} EURC → USDC…`);
        const approveTx = await writeContractAsync({
          address: EURC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [SWAP_ADDRESS, swapAmt],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx, pollingInterval: 15_000 });
        log('Rebalance swap approved. Execute swap on the Swap page.', 'success');
      } else {
        log('Portfolio balanced. No action needed.', 'success');
      }
    } catch (e: any) {
      log(`Rebalancer error: ${e?.shortMessage ?? e?.message}`, 'error');
    }
  }, [address, writeContractAsync, publicClient, log]);

  const runYieldOptimizer = useCallback(async () => {
    if (!address || !publicClient || !writeContractAsync) return;
    log('Yield optimizer: reading vault APY snapshot…');
    try {
      const totalAssets = await publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'totalAssets',
      }) as bigint;

      const walletBal = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;

      // Compare to stored snapshot
      const snapKey = `vault_snapshot_${address}`;
      const prev = localStorage.getItem(snapKey);
      const now = Date.now();

      if (prev) {
        const { assets: prevAssets, ts } = JSON.parse(prev);
        const hoursDelta = (now - ts) / 3600000;
        if (hoursDelta > 0) {
          const growth = Number(totalAssets - BigInt(prevAssets)) / Number(BigInt(prevAssets));
          const apy = (growth / hoursDelta) * 8760 * 100;
          log(`Current APY estimate: ${apy.toFixed(2)}%`);

          const minDeposit = parseUnits('1', USDC_DECIMALS);
          if (apy > 5) {
            log('APY > 5% — depositing idle wallet USDC into vault…');
            if (walletBal > minDeposit) {
              const approveTx = await writeContractAsync({
                address: USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [VAULT_ADDRESS, walletBal],
              });
              await publicClient.waitForTransactionReceipt({ hash: approveTx, pollingInterval: 15_000 });
              log('Approval confirmed — depositing…');

              const depositTx = await writeContractAsync({
                address: VAULT_ADDRESS,
                abi: VAULT_ABI,
                functionName: 'deposit',
                args: [walletBal, address],
              });
              await publicClient.waitForTransactionReceipt({ hash: depositTx, pollingInterval: 15_000 });
              log(`Yield optimizer: deposited ${formatUnits(walletBal, USDC_DECIMALS)} USDC ✓`, 'success');
            } else {
              log('APY > 5% but no idle USDC in wallet to deposit.', 'success');
            }
          } else if (apy < 1) {
            log('APY < 1% — consider withdrawing from vault.', 'info');
          } else {
            log('APY in normal range.', 'success');
          }
        }
      } else {
        log('No previous snapshot — recording baseline. Run again in an hour for APY estimate.');
      }

      localStorage.setItem(snapKey, JSON.stringify({ assets: totalAssets.toString(), ts: now }));
      log('Yield snapshot updated.');
    } catch (e: any) {
      log(`Yield optimizer error: ${e?.shortMessage ?? e?.message}`, 'error');
    }
  }, [address, publicClient, writeContractAsync, log]);

  const runAll = useCallback(async () => {
    if (!config || running) return;
    setRunning(true);
    log('─── Agent cycle started ───');

    for (const strategy of config.enabledStrategies) {
      if (strategy === 'auto-compound') await runAutoCompound();
      if (strategy === 'rebalance') await runRebalance();
      if (strategy === 'yield-optimizer') await runYieldOptimizer();
    }

    log('─── Agent cycle complete ───', 'success');
    setRunning(false);
  }, [config, running, log, runAutoCompound, runRebalance, runYieldOptimizer]);

  return { logs, running, runAll };
}

// ─── Main component ──────────────────────────────────────────────────────────
function AgentContent() {
  const { isConnected, address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  // Form state
  const [agentName, setAgentName] = useState('');
  const [agentDesc, setAgentDesc] = useState('');
  const [agentType, setAgentType] = useState('DeFiAgent');
  const [customType, setCustomType] = useState('');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [registering, setRegistering] = useState(false);

  // Agent config (post-registration)
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [enabledStrategies, setEnabledStrategies] = useState<string[]>([]);

  const publicClient = usePublicClient();

  // Check ERC-721 balance (registered = balance >= 1)
  const { data: nftBalance, refetch: refetchBalance } = useReadContract({
    address: ERC8004_IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const isRegistered = nftBalance !== undefined && (nftBalance as bigint) > 0n;

  // Load config from localStorage
  useEffect(() => {
    if (!address) return;
    const cfg = loadAgentConfig(address);
    if (cfg) {
      setConfig(cfg);
      setEnabledStrategies(cfg.enabledStrategies);
    }
  }, [address]);

  // Fetch tokenId from Transfer events if registered but no config stored
  const fetchAgentTokenId = useCallback(async () => {
    if (!address || !publicClient || !isRegistered) return;
    try {
      const latest = await publicClient.getBlockNumber();
      const from = latest > 10000n ? latest - 10000n : 0n;
      const logs = await publicClient.getLogs({
        address: ERC8004_IDENTITY_REGISTRY,
        event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
        args: { to: address },
        fromBlock: from,
        toBlock: latest,
      });
      if (logs.length > 0) {
        const tokenId = logs[logs.length - 1].args.tokenId!.toString();
        return tokenId;
      }
    } catch {}
    return undefined;
  }, [address, publicClient, isRegistered]);

  const { isLoading: txPending } = useWaitForTransactionReceipt({ hash: txHash });

  const { logs: agentLogs, running, runAll } = useAgentRunner(address, config);

  const buildMetadataURI = () => {
    const meta = {
      name: agentName || 'YieldFi Agent',
      description: agentDesc || 'Autonomous DeFi agent on YieldFi',
      type: agentType === 'Custom' ? customType : agentType,
      platform: 'YieldFi',
      version: '1.0',
      capabilities: enabledStrategies,
      registeredAt: new Date().toISOString(),
    };
    return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(meta))}`;
  };

  const handleRegister = async () => {
    if (!address) return;
    setRegistering(true);
    const toastId = showToast({ type: 'pending', message: 'Registering ERC-8004 agent identity…' });
    try {
      const metadataURI = buildMetadataURI();
      const hash = await writeContractAsync({
        address: ERC8004_IDENTITY_REGISTRY,
        abi: IDENTITY_ABI,
        functionName: 'register',
        args: [metadataURI],
      });
      setTxHash(hash);
      updateToast(toastId, { type: 'success', message: 'Agent registered on Arc!', txHash: hash });

      // Wait for receipt then fetch tokenId
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 15_000 });
        await refetchBalance();
        const tokenId = await fetchAgentTokenId();
        const cfg: AgentConfig = {
          tokenId: tokenId ?? '?',
          metadataURI,
          enabledStrategies,
          lastRun: {},
          registeredAt: Date.now(),
        };
        saveAgentConfig(address, cfg);
        setConfig(cfg);
      }
    } catch (e: any) {
      updateToast(toastId, { type: 'error', message: e?.shortMessage ?? e?.message ?? 'Registration failed' });
    } finally {
      setRegistering(false);
    }
  };

  const saveStrategies = () => {
    if (!address || !config) return;
    const updated = { ...config, enabledStrategies };
    saveAgentConfig(address, updated);
    setConfig(updated);
    showToast({ type: 'success', message: 'Agent strategies saved.' });
  };

  const toggleStrategy = (id: string) => {
    setEnabledStrategies(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  if (!isConnected) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
        <p style={{ color: 'var(--text-secondary)' }}>Connect your wallet to register an agent identity</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '750px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Agent Identity
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Register your wallet as an autonomous on-chain agent via{' '}
          <a href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent-purple)' }}>ERC-8004</a>.
          Enable strategies to auto-compound, rebalance, and optimize yield — no manual txs.
        </p>
      </div>

      {isRegistered && config ? (
        /* ── Registered view ── */
        <div className="animate-fade-in-up">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard
              label="Agent Token ID"
              value={`#${config.tokenId}`}
              subValue={`Registered ${new Date(config.registeredAt).toLocaleDateString()}`}
              icon={<span>🤖</span>}
              accentColor="purple"
            />
            <StatCard
              label="Active Strategies"
              value={config.enabledStrategies.length.toString()}
              subValue={config.enabledStrategies.join(', ') || 'None enabled'}
              icon={<span>⚡</span>}
              accentColor="blue"
            />
          </div>

          {/* Strategy configurator */}
          <div className="glass-card p-6 mb-6">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Agent Strategies</h2>
              <span className="badge-success">Registered</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Enable the strategies you want your agent to execute. Click "Run Now" to trigger a cycle manually.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.5rem' }}>
              {STRATEGIES.map(s => (
                <label
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '1rem',
                    padding: '1rem', borderRadius: '0.875rem', cursor: 'pointer',
                    background: enabledStrategies.includes(s.id) ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${enabledStrategies.includes(s.id) ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enabledStrategies.includes(s.id)}
                    onChange={() => toggleStrategy(s.id)}
                    style={{ marginTop: '0.2rem', accentColor: 'var(--accent-purple)', width: '1rem', height: '1rem' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{s.icon} {s.label}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{s.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-gradient" onClick={saveStrategies} style={{ flex: 1, padding: '0.75rem' }}>
                Save Strategies
              </button>
              <button
                className="btn-glass"
                onClick={runAll}
                disabled={running || enabledStrategies.length === 0}
                style={{ flex: 1, padding: '0.75rem' }}
              >
                {running ? 'Running…' : '▶ Run Now'}
              </button>
            </div>
          </div>

          {/* Agent activity log */}
          <div className="glass-card p-6">
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Activity Log</h2>
            {agentLogs.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                No activity yet. Click "Run Now" to trigger the agent.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: '280px', overflowY: 'auto' }}>
                {agentLogs.map((l, i) => (
                  <div key={i} style={{
                    fontSize: '0.8125rem', fontFamily: 'monospace', padding: '0.35rem 0.625rem',
                    borderRadius: '0.375rem',
                    background: l.type === 'error' ? 'rgba(239,68,68,0.1)' : l.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                    color: l.type === 'error' ? '#f87171' : l.type === 'success' ? '#4ade80' : 'var(--text-secondary)',
                  }}>
                    <span style={{ opacity: 0.5, marginRight: '0.5rem' }}>
                      {new Date(l.ts).toLocaleTimeString()}
                    </span>
                    {l.msg}
                  </div>
                ))}
              </div>
            )}
          </div>

          {txHash && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <a href={ARCSCAN_TX(txHash)} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '0.8125rem', color: 'var(--accent-purple)' }}>
                View registration tx on ArcScan →
              </a>
            </div>
          )}
        </div>
      ) : (
        /* ── Registration form ── */
        <div className="glass-card p-6 animate-fade-in-up">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.4rem' }}>Register Agent</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Mints an ERC-8004 identity NFT to your wallet on Arc Testnet. One-time on-chain registration.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Agent Name
              </label>
              <input
                type="text"
                placeholder="My YieldFi Agent"
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                className="glass-input"
                style={{ padding: '0.75rem 1rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Agent Type
              </label>
              <select
                value={agentType}
                onChange={e => setAgentType(e.target.value)}
                className="glass-input"
                style={{ padding: '0.75rem 1rem', cursor: 'pointer' }}
              >
                {AGENT_TYPES.map(t => (
                  <option key={t} value={t} style={{ background: '#0a0f1e' }}>{t}</option>
                ))}
              </select>
              {agentType === 'Custom' && (
                <input
                  type="text"
                  placeholder="Custom type…"
                  value={customType}
                  onChange={e => setCustomType(e.target.value)}
                  className="glass-input"
                  style={{ padding: '0.75rem 1rem', marginTop: '0.5rem' }}
                />
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Enable Strategies
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {STRATEGIES.map(s => (
                  <label
                    key={s.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.75rem 1rem', borderRadius: '0.75rem', cursor: 'pointer',
                      background: enabledStrategies.includes(s.id) ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${enabledStrategies.includes(s.id) ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.07)'}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enabledStrategies.includes(s.id)}
                      onChange={() => toggleStrategy(s.id)}
                      style={{ accentColor: 'var(--accent-purple)', width: '1rem', height: '1rem' }}
                    />
                    <span style={{ fontSize: '0.875rem' }}>{s.icon} <strong>{s.label}</strong> — {s.description}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Description (optional)
              </label>
              <textarea
                placeholder="What does this agent do?"
                value={agentDesc}
                onChange={e => setAgentDesc(e.target.value)}
                className="glass-input"
                rows={2}
                style={{ padding: '0.75rem 1rem', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <button
              className="btn-gradient"
              onClick={handleRegister}
              disabled={registering || txPending}
              style={{ padding: '0.9rem', fontSize: '1rem' }}
            >
              {registering ? 'Confirm in wallet…' : txPending ? 'Confirming on Arc…' : 'Register Agent Identity'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentPage() {
  return (
    <ClientOnly>
      <AgentContent />
    </ClientOnly>
  );
}
