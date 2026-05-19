'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useReadContract, usePublicClient,
} from 'wagmi';
import { parseUnits, formatUnits, parseAbiItem } from 'viem';
import ClientOnly from '../components/ClientOnly';
import StatCard from '../components/StatCard';
import { showToast, updateToast } from '../components/TxToast';
import {
  ERC8004_IDENTITY_REGISTRY, ARCSCAN_TX, ARCSCAN_ADDR,
  VAULT_ADDRESS, USDC_ADDRESS, EURC_ADDRESS, SWAP_ADDRESS,
  USDC_DECIMALS, VAULT_DECIMALS,
  AGENT_REPUTATION_ADDRESS, AGENT_EXECUTOR_ADDRESS, STRATEGY_MARKETPLACE_ADDRESS,
} from '@/lib/constants';

// ─── ABIs ────────────────────────────────────────────────────────────────────

const IDENTITY_ABI = [
  { name: 'register',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'metadataURI', type: 'string' }], outputs: [] },
  { name: 'balanceOf',  type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }],      outputs: [{ name: '', type: 'uint256' }] },
] as const;

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }],                                          outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],     outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],      outputs: [{ name: '', type: 'uint256' }] },
] as const;

const VAULT_ABI = [
  { name: 'balanceOf',       type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }],       outputs: [{ name: '', type: 'uint256' }] },
  { name: 'convertToAssets', type: 'function', stateMutability: 'view',       inputs: [{ name: 'shares',  type: 'uint256' }],        outputs: [{ name: '', type: 'uint256' }] },
  { name: 'deposit',         type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const EXECUTOR_ABI = [
  {
    name: 'configure', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: '_autoCompound',    type: 'bool' },
      { name: '_rebalance',       type: 'bool' },
      { name: '_yieldOpt',        type: 'bool' },
      { name: '_dca',             type: 'bool' },
      { name: '_stopLoss',        type: 'bool' },
      { name: '_maxAmount',       type: 'uint256' },
      { name: '_eurcThreshold',   type: 'uint256' },
      { name: '_stopLossApyBps',  type: 'uint256' },
      { name: '_dcaAmount',       type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'executeAll', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'agent', type: 'address' }], outputs: [],
  },
  {
    name: 'getConfig', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'autoCompoundEnabled',   type: 'bool' },
        { name: 'rebalanceEnabled',      type: 'bool' },
        { name: 'yieldOptimizerEnabled', type: 'bool' },
        { name: 'dcaEnabled',            type: 'bool' },
        { name: 'stopLossEnabled',       type: 'bool' },
        { name: 'maxAmountPerTxn',       type: 'uint256' },
        { name: 'eurcRebalanceThreshold',type: 'uint256' },
        { name: 'stopLossApyBps',        type: 'uint256' },
        { name: 'dcaAmountPerRun',       type: 'uint256' },
        { name: 'lastAutoCompound',      type: 'uint256' },
        { name: 'lastRebalance',         type: 'uint256' },
        { name: 'lastYieldOptimizer',    type: 'uint256' },
        { name: 'lastDca',               type: 'uint256' },
        { name: 'configured',            type: 'bool' },
      ],
    }],
  },
  {
    name: 'nextRunTime', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [
      { name: 'compoundAt',  type: 'uint256' },
      { name: 'rebalanceAt', type: 'uint256' },
      { name: 'yieldOptAt',  type: 'uint256' },
      { name: 'dcaAt',       type: 'uint256' },
    ],
  },
] as const;

const REPUTATION_ABI = [
  {
    name: 'getScoreByAddress', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'totalExecutions',      type: 'uint256' },
        { name: 'successfulExecutions', type: 'uint256' },
        { name: 'totalValueManaged',    type: 'uint256' },
        { name: 'trustScore',           type: 'uint256' },
        { name: 'lastUpdated',          type: 'uint256' },
        { name: 'agentName',            type: 'string' },
        { name: 'agentAddress',         type: 'address' },
      ],
    }],
  },
  {
    name: 'registerAgent', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'agentAddress', type: 'address' }, { name: 'name', type: 'string' }],
    outputs: [],
  },
  {
    name: 'endorse', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [],
  },
  {
    name: 'getTopAgents', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'n', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'totalExecutions',      type: 'uint256' },
        { name: 'successfulExecutions', type: 'uint256' },
        { name: 'totalValueManaged',    type: 'uint256' },
        { name: 'trustScore',           type: 'uint256' },
        { name: 'lastUpdated',          type: 'uint256' },
        { name: 'agentName',            type: 'string' },
        { name: 'agentAddress',         type: 'address' },
      ],
    }],
  },
  {
    name: 'totalAgents', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    name: 'endorsementCount', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }], outputs: [{ type: 'uint256' }],
  },
  {
    name: 'addressToTokenId', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
] as const;

const MARKETPLACE_ABI = [
  {
    name: 'listStrategy', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'name',        type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'category',    type: 'string' },
      { name: 'price',       type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    name: 'purchaseStrategy', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }], outputs: [],
  },
  {
    name: 'rateStrategy', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'rating', type: 'uint256' }], outputs: [],
  },
  {
    name: 'getStrategies', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'id',             type: 'uint256' },
        { name: 'creator',        type: 'address' },
        { name: 'name',           type: 'string' },
        { name: 'description',    type: 'string' },
        { name: 'category',       type: 'string' },
        { name: 'price',          type: 'uint256' },
        { name: 'totalPurchases', type: 'uint256' },
        { name: 'ratingSum',      type: 'uint256' },
        { name: 'totalRatings',   type: 'uint256' },
        { name: 'active',         type: 'bool' },
        { name: 'createdAt',      type: 'uint256' },
      ],
    }],
  },
  {
    name: 'hasPurchased', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'address' }], outputs: [{ type: 'bool' }],
  },
  {
    name: 'nextId', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
] as const;

// ─── Strategies definition ───────────────────────────────────────────────────

const STRATEGIES = [
  {
    id: 'auto-compound',
    label: 'Auto-Compound',
    icon: '🔄',
    cooldown: '24h',
    description: 'Re-deposits idle wallet USDC into the vault every 24h to maximise APY.',
    configKey: 'autoCompoundEnabled' as const,
  },
  {
    id: 'rebalance',
    label: 'USDC/EURC Rebalancer',
    icon: '⚖️',
    cooldown: '4h',
    description: 'If EURC > 50% of your holdings, swaps excess back to USDC and deposits into vault.',
    configKey: 'rebalanceEnabled' as const,
  },
  {
    id: 'yield-optimizer',
    label: 'Yield Optimizer',
    icon: '📈',
    cooldown: '1h',
    description: 'Deposits idle USDC when vault APY is favourable. Logs a warning if APY is low.',
    configKey: 'yieldOptimizerEnabled' as const,
  },
  {
    id: 'dca',
    label: 'DCA Depositor',
    icon: '📆',
    cooldown: '7d',
    description: 'Dollar-cost-averages a fixed USDC amount into the vault every week, rain or shine.',
    configKey: 'dcaEnabled' as const,
  },
  {
    id: 'stop-loss',
    label: 'Stop-Loss Protection',
    icon: '🛡️',
    cooldown: '12h',
    description: 'Monitors vault APY; if APY drops below threshold for 12h, alerts you to consider withdrawing.',
    configKey: 'stopLossEnabled' as const,
  },
];

type Tab = 'strategies' | 'reputation' | 'leaderboard' | 'marketplace';

// ─── LocalStorage helpers ────────────────────────────────────────────────────

interface StoredConfig {
  tokenId: string;
  metadataURI: string;
  registeredAt: number;
  agentName: string;
}

function loadStored(address: string): StoredConfig | null {
  try { return JSON.parse(localStorage.getItem(`agent_config_${address}`) ?? 'null'); }
  catch { return null; }
}
function saveStored(address: string, cfg: StoredConfig) {
  localStorage.setItem(`agent_config_${address}`, JSON.stringify(cfg));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }
function fmtUsdc(v: bigint)   { return parseFloat(formatUnits(v, USDC_DECIMALS)).toFixed(2); }
function fmtTime(ts: number)  {
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}
function timeUntil(ts: bigint) {
  const secs = Number(ts) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return 'Ready';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 24) return `${Math.floor(h/24)}d ${h%24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Main component ──────────────────────────────────────────────────────────

function AgentContent() {
  const { isConnected, address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const onCorrectChain = chainId === 5042002;

  // ── Tabs ──
  const [tab, setTab] = useState<Tab>('strategies');

  // ── Registration form ──
  const [agentName, setAgentName] = useState('');
  const [agentDesc, setAgentDesc] = useState('');
  const [agentType, setAgentType] = useState('DeFiAgent');
  const [registering, setRegistering] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  // ── Stored local config ──
  const [stored, setStored] = useState<StoredConfig | null>(null);

  // ── Strategy form state ──
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const [dcaAmount, setDcaAmount] = useState('10');
  const [eurcThreshold, setEurcThreshold] = useState('50');
  const [maxAmount, setMaxAmount] = useState('0');
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningAll, setRunningAll] = useState(false);

  // ── Activity log ──
  const [logs, setLogs] = useState<{ ts: number; msg: string; type: 'info' | 'success' | 'error' }[]>([]);
  const log = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{ ts: Date.now(), msg, type }, ...prev].slice(0, 50));
  }, []);

  // ── Marketplace form ──
  const [mktName, setMktName] = useState('');
  const [mktDesc, setMktDesc] = useState('');
  const [mktCategory, setMktCategory] = useState('compound');
  const [mktPrice, setMktPrice] = useState('0');
  const [listingStrategy, setListingStrategy] = useState(false);

  // ─── Contract reads ───────────────────────────────────────────────────────

  const { data: nftBalance, refetch: refetchBalance } = useReadContract({
    address: ERC8004_IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain },
  });
  const isRegistered = nftBalance !== undefined && (nftBalance as bigint) > 0n;

  const { data: executorConfig, refetch: refetchExecConfig } = useReadContract({
    address: AGENT_EXECUTOR_ADDRESS,
    abi: EXECUTOR_ABI,
    functionName: 'getConfig',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain },
  });

  const { data: nextRun, refetch: refetchNextRun } = useReadContract({
    address: AGENT_EXECUTOR_ADDRESS,
    abi: EXECUTOR_ABI,
    functionName: 'nextRunTime',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain, refetchInterval: 30_000 },
  });

  const { data: repScore, refetch: refetchRep } = useReadContract({
    address: AGENT_REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getScoreByAddress',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain, refetchInterval: 30_000 },
  });

  const { data: tokenId } = useReadContract({
    address: AGENT_REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'addressToTokenId',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain },
  });

  const { data: topAgents } = useReadContract({
    address: AGENT_REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getTopAgents',
    args: [10n],
    query: { enabled: onCorrectChain && tab === 'leaderboard', refetchInterval: 30_000 },
  });

  const { data: marketStrategies, refetch: refetchMkt } = useReadContract({
    address: STRATEGY_MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: 'getStrategies',
    args: [0n, 20n],
    query: { enabled: onCorrectChain && tab === 'marketplace', refetchInterval: 30_000 },
  });

  const { data: usdcAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, AGENT_EXECUTOR_ADDRESS] : undefined,
    query: { enabled: !!address && onCorrectChain, refetchInterval: 30_000 },
  });

  const { isLoading: txPending } = useWaitForTransactionReceipt({ hash: txHash });

  // ─── Load local state ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!address) return;
    const s = loadStored(address);
    if (s) setStored(s);
  }, [address]);

  // Sync executor config → local toggle state when loaded
  useEffect(() => {
    if (!executorConfig) return;
    const c = executorConfig as any;
    if (!c.configured) return;
    setEnabledMap({
      'auto-compound':   c.autoCompoundEnabled,
      'rebalance':       c.rebalanceEnabled,
      'yield-optimizer': c.yieldOptimizerEnabled,
      'dca':             c.dcaEnabled,
      'stop-loss':       c.stopLossEnabled,
    });
    setDcaAmount(fmtUsdc(c.dcaAmountPerRun));
    setEurcThreshold(c.eurcRebalanceThreshold.toString());
    setMaxAmount(fmtUsdc(c.maxAmountPerTxn));
  }, [executorConfig]);

  // ─── Register agent ───────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!address || !publicClient) return;
    setRegistering(true);
    const toastId = showToast({ type: 'pending', message: 'Registering ERC-8004 agent identity…' });
    try {
      const meta = JSON.stringify({
        name: agentName || 'YieldFi Agent',
        description: agentDesc || 'Autonomous DeFi agent on YieldFi',
        type: agentType,
        platform: 'YieldFi',
        version: '2.0',
        registeredAt: new Date().toISOString(),
      });
      const metaURI = `data:application/json;charset=utf-8,${encodeURIComponent(meta)}`;
      const hash = await writeContractAsync({
        address: ERC8004_IDENTITY_REGISTRY,
        abi: IDENTITY_ABI,
        functionName: 'register',
        args: [metaURI],
      });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 15_000 });
      await refetchBalance();

      // Fetch tokenId from events
      let tid = '?';
      try {
        const latest = await publicClient.getBlockNumber();
        const from = latest > 10000n ? latest - 10000n : 0n;
        const evts = await publicClient.getLogs({
          address: ERC8004_IDENTITY_REGISTRY,
          event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
          args: { to: address },
          fromBlock: from,
          toBlock: latest,
        });
        if (evts.length) tid = evts[evts.length - 1].args.tokenId!.toString();
      } catch {}

      // Register in our reputation contract
      if (tid !== '?') {
        try {
          const regHash = await writeContractAsync({
            address: AGENT_REPUTATION_ADDRESS,
            abi: REPUTATION_ABI,
            functionName: 'registerAgent',
            args: [BigInt(tid), address, agentName || 'YieldFi Agent'],
          });
          await publicClient.waitForTransactionReceipt({ hash: regHash, pollingInterval: 15_000 });
        } catch {}
      }

      const cfg: StoredConfig = { tokenId: tid, metadataURI: metaURI, registeredAt: Date.now(), agentName: agentName || 'YieldFi Agent' };
      saveStored(address, cfg);
      setStored(cfg);
      updateToast(toastId, { type: 'success', message: 'Agent registered!', txHash: hash });
    } catch (e: any) {
      updateToast(toastId, { type: 'error', message: e?.shortMessage ?? e?.message ?? 'Failed' });
    } finally {
      setRegistering(false);
    }
  };

  // ─── Save strategy config to executor contract ────────────────────────────
  const handleSaveConfig = async () => {
    if (!address || !publicClient) return;
    setSavingConfig(true);
    const toastId = showToast({ type: 'pending', message: 'Saving strategy config on-chain…' });
    try {
      // First approve executor to spend USDC (large allowance)
      const currentAllowance = (usdcAllowance as bigint) ?? 0n;
      const approveAmount = parseUnits('999999', USDC_DECIMALS);
      if (currentAllowance < parseUnits('100', USDC_DECIMALS)) {
        const approveTx = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [AGENT_EXECUTOR_ADDRESS, approveAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx, pollingInterval: 15_000 });
        log('USDC approval granted to executor', 'success');
      }

      const dcaRaw   = parseUnits(dcaAmount || '0', USDC_DECIMALS);
      const maxRaw   = parseUnits(maxAmount || '0', USDC_DECIMALS);
      const ethresh  = BigInt(eurcThreshold || '50');

      const hash = await writeContractAsync({
        address: AGENT_EXECUTOR_ADDRESS,
        abi: EXECUTOR_ABI,
        functionName: 'configure',
        args: [
          !!enabledMap['auto-compound'],
          !!enabledMap['rebalance'],
          !!enabledMap['yield-optimizer'],
          !!enabledMap['dca'],
          !!enabledMap['stop-loss'],
          maxRaw,
          ethresh,
          100n,   // stop-loss APY = 1% bps
          dcaRaw,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 15_000 });
      await refetchExecConfig();
      await refetchNextRun();
      updateToast(toastId, { type: 'success', message: 'Strategies configured on-chain!', txHash: hash });
      log('Strategy configuration saved on-chain ✓', 'success');
    } catch (e: any) {
      updateToast(toastId, { type: 'error', message: e?.shortMessage ?? e?.message ?? 'Failed' });
      log(`Config error: ${e?.shortMessage ?? e?.message}`, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // ─── Trigger executeAll on-chain ──────────────────────────────────────────
  const handleRunAll = async () => {
    if (!address || !publicClient) return;
    setRunningAll(true);
    const toastId = showToast({ type: 'pending', message: 'Executing all enabled strategies…' });
    log('─── Agent execution cycle started ───');
    try {
      const hash = await writeContractAsync({
        address: AGENT_EXECUTOR_ADDRESS,
        abi: EXECUTOR_ABI,
        functionName: 'executeAll',
        args: [address],
      });
      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 15_000 });
      await refetchRep();
      await refetchNextRun();
      updateToast(toastId, { type: 'success', message: 'Agent cycle complete!', txHash: hash });
      log('─── Agent cycle complete ───', 'success');
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? 'Execution failed';
      updateToast(toastId, { type: 'error', message: msg });
      log(`Execution error: ${msg}`, 'error');
    } finally {
      setRunningAll(false);
    }
  };

  // ─── Endorse an agent ─────────────────────────────────────────────────────
  const handleEndorse = async (endorseTokenId: bigint) => {
    if (!address || !publicClient) return;
    const toastId = showToast({ type: 'pending', message: 'Endorsing agent…' });
    try {
      const hash = await writeContractAsync({
        address: AGENT_REPUTATION_ADDRESS,
        abi: REPUTATION_ABI,
        functionName: 'endorse',
        args: [endorseTokenId],
      });
      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 15_000 });
      updateToast(toastId, { type: 'success', message: 'Agent endorsed!', txHash: hash });
    } catch (e: any) {
      updateToast(toastId, { type: 'error', message: e?.shortMessage ?? e?.message ?? 'Failed' });
    }
  };

  // ─── List strategy on marketplace ─────────────────────────────────────────
  const handleListStrategy = async () => {
    if (!address || !publicClient) return;
    setListingStrategy(true);
    const toastId = showToast({ type: 'pending', message: 'Listing strategy on marketplace…' });
    try {
      const priceRaw = parseUnits(mktPrice || '0', USDC_DECIMALS);
      const hash = await writeContractAsync({
        address: STRATEGY_MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'listStrategy',
        args: [mktName, mktDesc, mktCategory, priceRaw],
      });
      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 15_000 });
      updateToast(toastId, { type: 'success', message: 'Strategy listed!', txHash: hash });
      await refetchMkt();
      setMktName(''); setMktDesc(''); setMktPrice('0');
    } catch (e: any) {
      updateToast(toastId, { type: 'error', message: e?.shortMessage ?? e?.message ?? 'Failed' });
    } finally {
      setListingStrategy(false);
    }
  };

  // ─── Guards ───────────────────────────────────────────────────────────────
  if (!isConnected) return (
    <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: 480, margin: '4rem auto' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
      <p style={{ color: 'var(--text-secondary)' }}>Connect your wallet to access the agent system</p>
    </div>
  );

  if (!onCorrectChain) return (
    <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: 480, margin: '4rem auto' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
      <p style={{ color: '#f87171', fontWeight: 600 }}>Wrong Network — switch to Arc Testnet (5042002)</p>
    </div>
  );

  // ─── Rep score data ───────────────────────────────────────────────────────
  const rep = repScore as any;
  const execConf = executorConfig as any;
  const nr = nextRun as any;

  const trustScore     = rep ? Number(rep.trustScore) : 0;
  const totalExec      = rep ? Number(rep.totalExecutions) : 0;
  const successExec    = rep ? Number(rep.successfulExecutions) : 0;
  const valueManaged   = rep ? rep.totalValueManaged as bigint : 0n;
  const successRate    = totalExec > 0 ? Math.round((successExec / totalExec) * 100) : 0;

  // ─── Registration form ────────────────────────────────────────────────────
  if (!isRegistered) return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Agent Identity
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Register your wallet as an autonomous on-chain agent via{' '}
          <a href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-purple)' }}>ERC-8004</a>.
          Enable strategies, earn reputation, and list strategies on the marketplace.
        </p>
      </div>
      <div className="glass-card p-6 animate-fade-in-up">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>Register Agent</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Agent Name</label>
            <input type="text" placeholder="My YieldFi Agent" value={agentName} onChange={e => setAgentName(e.target.value)}
              className="glass-input" style={{ padding: '0.75rem 1rem' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Agent Type</label>
            <select value={agentType} onChange={e => setAgentType(e.target.value)} className="glass-input" style={{ padding: '0.75rem 1rem' }}>
              {['DeFiAgent', 'YieldOptimizer', 'LiquidityProvider', 'ArbitrageBot', 'Custom'].map(t => (
                <option key={t} value={t} style={{ background: '#0a0f1e' }}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Description (optional)</label>
            <textarea placeholder="What does this agent do?" value={agentDesc} onChange={e => setAgentDesc(e.target.value)}
              className="glass-input" rows={2} style={{ padding: '0.75rem 1rem', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <button className="btn-gradient" onClick={handleRegister} disabled={registering || txPending} style={{ padding: '0.9rem', fontSize: '1rem' }}>
            {registering ? 'Confirm in wallet…' : txPending ? 'Confirming on Arc…' : 'Register Agent Identity'}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Registered view ──────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div className="animate-fade-in-up mb-6">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.25rem' }}>
              Agent Dashboard
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {stored?.agentName ?? 'YieldFi Agent'} · Token #{stored?.tokenId ?? '?'} · <span className="badge-success">Registered</span>
            </p>
          </div>
          <a href={ARCSCAN_ADDR(AGENT_EXECUTOR_ADDRESS)} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '0.75rem', color: 'var(--accent-purple)' }}>
            View Executor Contract →
          </a>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard label="Trust Score"    value={`${trustScore}/100`} subValue={`${totalExec} executions`}  icon={<span>⭐</span>} accentColor="purple" />
        <StatCard label="Success Rate"   value={`${successRate}%`}   subValue={`${successExec}/${totalExec} succeeded`}  icon={<span>✅</span>} accentColor="blue" />
        <StatCard label="Value Managed"  value={`$${fmtUsdc(valueManaged as bigint)}`} subValue="lifetime USDC"  icon={<span>💰</span>} accentColor="green" />
        <StatCard label="Active Strats"  value={Object.values(enabledMap).filter(Boolean).length.toString()} subValue="on-chain strategies"  icon={<span>⚡</span>} accentColor="blue" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.875rem', padding: '0.25rem', border: '1px solid rgba(255,255,255,0.06)' }}>
        {([
          { id: 'strategies',  label: '⚡ Strategies' },
          { id: 'reputation',  label: '⭐ Reputation' },
          { id: 'leaderboard', label: '🏆 Leaderboard' },
          { id: 'marketplace', label: '🛒 Marketplace' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '0.5rem 0.25rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer',
            fontWeight: tab === t.id ? 600 : 400, fontSize: '0.8125rem',
            color: tab === t.id ? 'white' : 'var(--text-secondary)',
            background: tab === t.id ? 'linear-gradient(135deg, #6366f1, #3b82f6)' : 'transparent',
            transition: 'all 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab: Strategies ── */}
      {tab === 'strategies' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass-card p-6">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Configure Strategies</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Executor: {shortAddr(AGENT_EXECUTOR_ADDRESS)}
              </span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Strategies run on-chain via the <strong>AgentExecutor</strong> contract.
              Configure once, then anyone (or a keeper) can call <code>executeAll</code> to trigger them within their cooldowns.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {STRATEGIES.map(s => (
                <div key={s.id} style={{
                  padding: '1rem', borderRadius: '0.875rem', cursor: 'pointer',
                  background: enabledMap[s.id] ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${enabledMap[s.id] ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  transition: 'all 0.2s',
                }} onClick={() => setEnabledMap(prev => ({ ...prev, [s.id]: !prev[s.id] }))}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input type="checkbox" checked={!!enabledMap[s.id]} onChange={() => {}}
                        onClick={e => e.stopPropagation()}
                        style={{ accentColor: 'var(--accent-purple)', width: '1rem', height: '1rem' }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{s.icon} {s.label}</div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{s.description}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', minWidth: 60 }}>
                      <div>cooldown</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{s.cooldown}</div>
                    </div>
                  </div>
                  {/* DCA amount input */}
                  {s.id === 'dca' && enabledMap['dca'] && (
                    <div style={{ marginTop: '0.75rem' }} onClick={e => e.stopPropagation()}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                        USDC amount per weekly run
                      </label>
                      <input type="number" value={dcaAmount} onChange={e => setDcaAmount(e.target.value)}
                        className="glass-input" placeholder="10" style={{ padding: '0.5rem 0.75rem', width: '160px', fontSize: '0.875rem' }} />
                    </div>
                  )}
                  {s.id === 'rebalance' && enabledMap['rebalance'] && (
                    <div style={{ marginTop: '0.75rem' }} onClick={e => e.stopPropagation()}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                        EURC% threshold to trigger rebalance (default 50)
                      </label>
                      <input type="number" value={eurcThreshold} onChange={e => setEurcThreshold(e.target.value)}
                        className="glass-input" placeholder="50" style={{ padding: '0.5rem 0.75rem', width: '100px', fontSize: '0.875rem' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Max amount */}
            <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                  Max USDC per transaction (0 = unlimited)
                </label>
                <input type="number" value={maxAmount} onChange={e => setMaxAmount(e.target.value)}
                  className="glass-input" placeholder="0" style={{ padding: '0.5rem 0.75rem', width: '180px', fontSize: '0.875rem' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-gradient" onClick={handleSaveConfig} disabled={savingConfig}
                style={{ flex: 1, padding: '0.8rem', fontSize: '0.9375rem' }}>
                {savingConfig ? 'Saving on-chain…' : '💾 Save Config On-Chain'}
              </button>
              <button className="btn-glass" onClick={handleRunAll} disabled={runningAll || !(executorConfig as any)?.configured}
                style={{ flex: 1, padding: '0.8rem', fontSize: '0.9375rem' }}>
                {runningAll ? 'Executing…' : '▶ Run Now'}
              </button>
            </div>
            {!(executorConfig as any)?.configured && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Save config first before running.
              </p>
            )}
          </div>

          {/* Next run times */}
          {nr && (
            <div className="glass-card p-5">
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.875rem' }}>⏱ Next Run Times</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                {[
                  { label: 'Auto-Compound', val: nr[0] },
                  { label: 'Rebalancer',    val: nr[1] },
                  { label: 'Yield Opt.',    val: nr[2] },
                  { label: 'DCA',           val: nr[3] },
                ].map(({ label, val }) => (
                  <div key={label} style={{ padding: '0.625rem 0.875rem', borderRadius: '0.625rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{label}</div>
                    <div style={{
                      fontSize: '0.875rem', fontWeight: 600,
                      color: timeUntil(val as bigint) === 'Ready' ? '#4ade80' : 'var(--text-secondary)',
                    }}>{timeUntil(val as bigint)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity log */}
          <div className="glass-card p-5">
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.875rem' }}>Activity Log</h3>
            {logs.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No activity yet. Configure and run strategies above.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '240px', overflowY: 'auto' }}>
                {logs.map((l, i) => (
                  <div key={i} style={{
                    fontSize: '0.8125rem', fontFamily: 'monospace', padding: '0.3rem 0.625rem', borderRadius: '0.375rem',
                    background: l.type === 'error' ? 'rgba(239,68,68,0.1)' : l.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                    color: l.type === 'error' ? '#f87171' : l.type === 'success' ? '#4ade80' : 'var(--text-secondary)',
                  }}>
                    <span style={{ opacity: 0.5, marginRight: '0.5rem' }}>{new Date(l.ts).toLocaleTimeString()}</span>
                    {l.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Reputation ── */}
      {tab === 'reputation' && (
        <div className="glass-card p-6">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>⭐ Reputation Score</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Your reputation score is computed on-chain from execution success rate (80%) + endorsements from other agents (20%).
          </p>

          {/* Trust score bar */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>Trust Score</span>
              <span style={{ fontWeight: 700, color: trustScore > 70 ? '#4ade80' : trustScore > 40 ? '#facc15' : '#f87171' }}>
                {trustScore}/100
              </span>
            </div>
            <div style={{ height: '10px', background: 'rgba(255,255,255,0.07)', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '999px',
                width: `${trustScore}%`,
                background: trustScore > 70 ? 'linear-gradient(90deg,#10b981,#4ade80)' : trustScore > 40 ? 'linear-gradient(90deg,#f59e0b,#facc15)' : 'linear-gradient(90deg,#ef4444,#f87171)',
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.875rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Total Executions',   val: totalExec.toString() },
              { label: 'Success Rate',        val: `${successRate}%` },
              { label: 'Value Managed',       val: `$${fmtUsdc(valueManaged as bigint)}` },
              { label: 'Last Updated',        val: rep?.lastUpdated ? fmtTime(Number(rep.lastUpdated)) : '—' },
            ].map(({ label, val }) => (
              <div key={label} style={{ padding: '0.875rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{label}</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'white' }}>How to improve your score:</strong>
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1rem', lineHeight: '1.8' }}>
              <li>Run strategies successfully → +80 pts (success rate component)</li>
              <li>Get endorsed by other registered agents → +up to 20 pts</li>
              <li>Higher executions with good success = higher trust</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Tab: Leaderboard ── */}
      {tab === 'leaderboard' && (
        <div className="glass-card p-6">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>🏆 Agent Leaderboard</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Top agents ranked by on-chain trust score. Endorse agents you trust to boost their score.
          </p>
          {!topAgents || (topAgents as any[]).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No agents registered yet. Be the first!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {(topAgents as any[]).filter(a => a.agentAddress !== '0x0000000000000000000000000000000000000000').map((agent, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.875rem 1rem', borderRadius: '0.875rem',
                  background: agent.agentAddress?.toLowerCase() === address?.toLowerCase() ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${agent.agentAddress?.toLowerCase() === address?.toLowerCase() ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.07)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: i === 0 ? 'linear-gradient(135deg,#f59e0b,#facc15)' : i === 1 ? 'linear-gradient(135deg,#9ca3af,#d1d5db)' : i === 2 ? 'linear-gradient(135deg,#b45309,#d97706)' : 'rgba(255,255,255,0.1)',
                      fontSize: '0.875rem', fontWeight: 800,
                    }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                        {agent.agentName || shortAddr(agent.agentAddress)}
                        {agent.agentAddress?.toLowerCase() === address?.toLowerCase() && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--accent-purple)', background: 'rgba(99,102,241,0.15)', padding: '0.15rem 0.4rem', borderRadius: '0.3rem' }}>You</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {shortAddr(agent.agentAddress)} · {Number(agent.totalExecutions)} executions
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Trust</div>
                      <div style={{
                        fontWeight: 700, fontSize: '1rem',
                        color: Number(agent.trustScore) > 70 ? '#4ade80' : Number(agent.trustScore) > 40 ? '#facc15' : '#f87171',
                      }}>{agent.trustScore.toString()}/100</div>
                    </div>
                    {agent.agentAddress?.toLowerCase() !== address?.toLowerCase() && tokenId && (
                      <button
                        onClick={() => handleEndorse(tokenId as bigint)}
                        style={{
                          padding: '0.35rem 0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(99,102,241,0.4)',
                          background: 'rgba(99,102,241,0.1)', color: 'var(--accent-purple)', cursor: 'pointer',
                          fontSize: '0.75rem', fontWeight: 600,
                        }}>
                        Endorse
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Marketplace ── */}
      {tab === 'marketplace' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* List a new strategy */}
          <div className="glass-card p-6">
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>📤 List a Strategy</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Share your DeFi strategy with other agents. Set a USDC price or list it free. You earn 90% of each sale.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Strategy Name</label>
                  <input type="text" placeholder="My Alpha Strategy" value={mktName} onChange={e => setMktName(e.target.value)}
                    className="glass-input" style={{ padding: '0.625rem 0.875rem', fontSize: '0.875rem' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Category</label>
                  <select value={mktCategory} onChange={e => setMktCategory(e.target.value)} className="glass-input" style={{ padding: '0.625rem 0.875rem', fontSize: '0.875rem' }}>
                    {['compound', 'rebalance', 'dca', 'arbitrage', 'stop-loss', 'other'].map(c => (
                      <option key={c} value={c} style={{ background: '#0a0f1e' }}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Description</label>
                <textarea placeholder="Describe what your strategy does and when it performs best…" value={mktDesc} onChange={e => setMktDesc(e.target.value)}
                  className="glass-input" rows={2} style={{ padding: '0.625rem 0.875rem', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.875rem' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.875rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Price (USDC, 0 = free)</label>
                  <input type="number" placeholder="0" value={mktPrice} onChange={e => setMktPrice(e.target.value)}
                    className="glass-input" style={{ padding: '0.625rem 0.875rem', width: '140px', fontSize: '0.875rem' }} />
                </div>
                <button className="btn-gradient" onClick={handleListStrategy} disabled={listingStrategy || !mktName}
                  style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem' }}>
                  {listingStrategy ? 'Listing…' : 'List Strategy'}
                </button>
              </div>
            </div>
          </div>

          {/* Browse strategies */}
          <div className="glass-card p-6">
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>🛒 Browse Strategies</h2>
            {!marketStrategies || (marketStrategies as any[]).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No strategies listed yet. Be the first!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(marketStrategies as any[]).filter(s => s.active).map((s, i) => {
                  const avgRating = s.totalRatings > 0 ? (Number(s.ratingSum) / Number(s.totalRatings)).toFixed(1) : '—';
                  return (
                    <div key={i} style={{
                      padding: '1rem', borderRadius: '0.875rem',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{s.name}</span>
                            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '0.3rem', background: 'rgba(99,102,241,0.15)', color: 'var(--accent-purple)' }}>
                              {s.category}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{s.description}</p>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            By {shortAddr(s.creator)} · {s.totalPurchases.toString()} purchases · ★ {avgRating}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: '80px' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: Number(s.price) === 0 ? '#4ade80' : 'white', marginBottom: '0.5rem' }}>
                            {Number(s.price) === 0 ? 'Free' : `$${fmtUsdc(s.price as bigint)}`}
                          </div>
                          <button
                            onClick={async () => {
                              if (!address || !publicClient) return;
                              const toastId = showToast({ type: 'pending', message: 'Purchasing strategy…' });
                              try {
                                if (Number(s.price) > 0) {
                                  const allowance = await publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, STRATEGY_MARKETPLACE_ADDRESS] }) as bigint;
                                  if (allowance < (s.price as bigint)) {
                                    const approveTx = await writeContractAsync({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [STRATEGY_MARKETPLACE_ADDRESS, s.price as bigint] });
                                    await publicClient.waitForTransactionReceipt({ hash: approveTx, pollingInterval: 15_000 });
                                  }
                                }
                                const hash = await writeContractAsync({ address: STRATEGY_MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI, functionName: 'purchaseStrategy', args: [s.id as bigint] });
                                await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 15_000 });
                                updateToast(toastId, { type: 'success', message: 'Strategy purchased!', txHash: hash });
                                await refetchMkt();
                              } catch (e: any) {
                                updateToast(toastId, { type: 'error', message: e?.shortMessage ?? e?.message ?? 'Failed' });
                              }
                            }}
                            style={{
                              padding: '0.375rem 0.75rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer',
                              background: 'linear-gradient(135deg,#6366f1,#3b82f6)', color: 'white', fontSize: '0.8125rem', fontWeight: 600,
                            }}>
                            {Number(s.price) === 0 ? 'Get Free' : 'Buy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
