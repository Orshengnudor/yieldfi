'use client';

import { useState } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { useStaking, LOCK_OPTIONS } from '@/hooks/useStaking';
import ClientOnly from '../components/ClientOnly';
import StatCard from '../components/StatCard';
import { ARCSCAN_TX, STAKING_ADDRESS, VAULT_DECIMALS } from '@/lib/constants';
import { showToast, updateToast } from '../components/TxToast';

type Step = 'idle' | 'approving' | 'staking' | 'unstaking' | 'claiming' | 'done' | 'error';

const STAKING_READ_ABI = [
  {
    type: 'function', name: 'getStake',
    inputs: [{ name: 'user', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ components: [{ name: 'amount', type: 'uint256' }, { name: 'startTime', type: 'uint256' }, { name: 'lockDuration', type: 'uint256' }, { name: 'multiplier', type: 'uint256' }], type: 'tuple' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'isUnlocked',
    inputs: [{ name: 'user', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'timeUntilUnlock',
    inputs: [{ name: 'user', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

function StakePosition({
  index, address, onUnstake, busy, formatYUsdc,
}: {
  index: number; address: string; onUnstake: (i: number) => void;
  busy: boolean; formatYUsdc: (v: bigint) => string;
}) {
  const { data } = useReadContracts({
    contracts: [
      { address: STAKING_ADDRESS as `0x${string}`, abi: STAKING_READ_ABI, functionName: 'getStake', args: [address as `0x${string}`, BigInt(index)] },
      { address: STAKING_ADDRESS as `0x${string}`, abi: STAKING_READ_ABI, functionName: 'isUnlocked', args: [address as `0x${string}`, BigInt(index)] },
      { address: STAKING_ADDRESS as `0x${string}`, abi: STAKING_READ_ABI, functionName: 'timeUntilUnlock', args: [address as `0x${string}`, BigInt(index)] },
    ],
    query: { refetchInterval: 15_000 },
  });

  const stake = data?.[0]?.result as { amount: bigint; startTime: bigint; lockDuration: bigint; multiplier: bigint } | undefined;
  const unlocked = data?.[1]?.result as boolean | undefined;
  const timeLeft = data?.[2]?.result as bigint | undefined;

  if (!stake) {
    return (
      <div style={{ color: '#718096', fontSize: 13, padding: '12px 0' }}>Loading position #{index}…</div>
    );
  }

  const daysLeft = timeLeft ? Math.ceil(Number(timeLeft) / 86400) : 0;
  const hoursLeft = timeLeft ? Math.ceil(Number(timeLeft) / 3600) : 0;
  const multiplier = stake.multiplier ? Number(stake.multiplier) / 100 : 1;
  const lockLabel = stake.lockDuration === 0n ? 'No lock'
    : `${Math.round(Number(stake.lockDuration) / 86400)}d lock`;

  const timeLeftLabel = unlocked
    ? '✅ Unlocked'
    : daysLeft > 1
    ? `🔒 ${daysLeft}d left`
    : `🔒 ${hoursLeft}h left`;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: unlocked ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '16px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    }}>
      <div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>
          {parseFloat(formatYUsdc(stake.amount)).toFixed(4)} yUSDC
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
          {lockLabel} · {multiplier}x multiplier · {timeLeftLabel}
        </div>
      </div>
      <button
        onClick={() => onUnstake(index)}
        disabled={busy || !unlocked}
        style={{
          padding: '10px 20px', borderRadius: 8,
          cursor: (!unlocked || busy) ? 'not-allowed' : 'pointer',
          background: unlocked ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
          border: unlocked ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.08)',
          color: unlocked ? '#fca5a5' : '#4a5568',
          fontSize: 13, fontWeight: 600,
          opacity: busy ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? 'Wait…' : unlocked ? 'Unstake' : 'Locked'}
      </button>
    </div>
  );
}

function StakingContent() {
  const { isConnected, address, chainId } = useAccount();
  const onCorrectChain = chainId === 5042002;
  const [amount, setAmount] = useState('');
  const [lockIndex, setLockIndex] = useState(0);
  const [step, setStep] = useState<Step>('idle');
  const [lastTx, setLastTx] = useState('');

  const {
    yUsdcBalance,
    stakedBalance,
    earned,
    stakeCount,
    totalStaked,
    approveAndStake,
    unstake,
    claimRewards,
    formatYUsdc,
    formatUsdc,
  } = useStaking();

  const busy = ['approving', 'staking', 'unstaking', 'claiming'].includes(step);

  const handleStake = async () => {
    if (!amount || !address) return;
    const id = showToast({ type: 'pending', message: 'Approving yUSDC…' });
    setStep('approving');
    try {
      const hash = await approveAndStake(amount, LOCK_OPTIONS[lockIndex].duration);
      updateToast(id, { type: 'success', message: 'Staked successfully!', txHash: hash });
      setLastTx(hash);
      setAmount('');
      setStep('done');
    } catch (e: any) {
      updateToast(id, { type: 'error', message: e?.shortMessage || e?.message || 'Stake failed' });
      setStep('error');
    }
  };

  const handleUnstake = async (index: number) => {
    const id = showToast({ type: 'pending', message: `Unstaking position #${index}…` });
    setStep('unstaking');
    try {
      const hash = await unstake(index);
      updateToast(id, { type: 'success', message: 'Unstaked!', txHash: hash });
      setLastTx(hash);
      setStep('done');
    } catch (e: any) {
      updateToast(id, { type: 'error', message: e?.shortMessage || e?.message || 'Unstake failed' });
      setStep('error');
    }
  };

  const handleClaim = async () => {
    const id = showToast({ type: 'pending', message: 'Claiming rewards…' });
    setStep('claiming');
    try {
      const hash = await claimRewards();
      updateToast(id, { type: 'success', message: 'Rewards claimed!', txHash: hash });
      setLastTx(hash);
      setStep('done');
    } catch (e: any) {
      updateToast(id, { type: 'error', message: e?.shortMessage || e?.message || 'Claim failed' });
      setStep('error');
    }
  };

  if (!isConnected) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a0aec0' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <p style={{ fontSize: 18 }}>Connect your wallet to stake yUSDC</p>
      </div>
    );
  }

  if (!onCorrectChain) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: '#f6c90e' }}>
        <p>Switch to <strong>Arc Testnet</strong> to use staking.</p>
      </div>
    );
  }

  const hasEnoughToStake = amount && parseFloat(amount) > 0 &&
    yUsdcBalance > 0n &&
    BigInt(Math.floor(parseFloat(amount) * 10 ** 18)) <= yUsdcBalance;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#fff' }}>Staking</h1>
      <p style={{ color: '#a0aec0', marginBottom: 32 }}>
        Stake yUSDC to earn USDC rewards. Minimum lock: 7 days. Longer locks = higher multiplier.
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard label="Your yUSDC"      value={parseFloat(formatYUsdc(yUsdcBalance)).toFixed(4)}   accentColor="purple" />
        <StatCard label="Total Staked"    value={parseFloat(formatYUsdc(stakedBalance)).toFixed(4)}  accentColor="blue" />
        <StatCard label="Pending Rewards" value={`${parseFloat(formatUsdc(earned)).toFixed(6)} USDC`} accentColor="green" />
      </div>

      {/* Stake */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 24, marginBottom: 24,
      }}>
        <h2 style={{ color: '#e2e8f0', marginBottom: 16, fontSize: 18 }}>Stake yUSDC</h2>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#a0aec0', fontSize: 13, display: 'block', marginBottom: 6 }}>
            Amount (yUSDC) · Balance: {parseFloat(formatYUsdc(yUsdcBalance)).toFixed(4)}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              style={{
                flex: 1, padding: '12px 16px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, color: '#fff', fontSize: 16, outline: 'none',
              }}
            />
            <button
              onClick={() => setAmount(formatUnits(yUsdcBalance, VAULT_DECIMALS))}
              style={{
                padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                color: '#a5b4fc', fontSize: 13, whiteSpace: 'nowrap',
              }}
            >Max</button>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: '#a0aec0', fontSize: 13, display: 'block', marginBottom: 8 }}>Lock Period</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {LOCK_OPTIONS.map((opt, i) => (
              <button
                key={i}
                onClick={() => setLockIndex(i)}
                style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  background: lockIndex === i ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                  border: lockIndex === i ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.1)',
                  color: lockIndex === i ? '#a5b4fc' : '#94a3b8',
                  fontSize: 13,
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        <button
          onClick={handleStake}
          disabled={busy || !amount || parseFloat(amount) <= 0}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12,
            cursor: busy || !amount ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none', color: '#fff', fontSize: 16, fontWeight: 600,
            opacity: busy || !amount ? 0.6 : 1,
          }}
        >
          {step === 'approving' ? 'Step 1/2 — Approving…'
            : step === 'staking' ? 'Step 2/2 — Staking…'
            : 'Stake yUSDC'}
        </button>
      </div>

      {/* Claim Rewards */}
      {earned > 0n && (
        <div style={{
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: 16, padding: 20, marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ color: '#6ee7b7', fontSize: 13, marginBottom: 4 }}>Claimable Rewards</div>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>
              {parseFloat(formatUsdc(earned)).toFixed(6)} USDC
            </div>
          </div>
          <button
            onClick={handleClaim}
            disabled={busy}
            style={{
              padding: '12px 24px', borderRadius: 10, cursor: busy ? 'not-allowed' : 'pointer',
              background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)',
              color: '#6ee7b7', fontSize: 15, fontWeight: 600,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {step === 'claiming' ? 'Claiming…' : 'Claim'}
          </button>
        </div>
      )}

      {/* Active Stakes */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 24,
      }}>
        <h2 style={{ color: '#e2e8f0', marginBottom: 4, fontSize: 18 }}>Active Stakes</h2>
        <p style={{ color: '#718096', fontSize: 13, marginBottom: 16 }}>
          {stakeCount === 0
            ? 'No active stakes yet. Stake yUSDC above to get started.'
            : `${stakeCount} position${stakeCount !== 1 ? 's' : ''} · ${parseFloat(formatYUsdc(stakedBalance)).toFixed(4)} yUSDC total staked`}
        </p>
        {stakeCount > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: stakeCount }, (_, i) => (
              <StakePosition
                key={i}
                index={i}
                address={address!}
                onUnstake={handleUnstake}
                busy={busy}
                formatYUsdc={v => formatUnits(v, VAULT_DECIMALS)}
              />
            ))}
          </div>
        )}
      </div>

      {lastTx && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <a href={ARCSCAN_TX(lastTx)} target="_blank" rel="noreferrer"
            style={{ color: '#7c3aed', fontSize: 13 }}>View last tx on ArcScan ↗</a>
        </div>
      )}
    </div>
  );
}

export default function StakingPage() {
  return (
    <ClientOnly>
      <StakingContent />
    </ClientOnly>
  );
}
