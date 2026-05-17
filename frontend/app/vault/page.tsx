'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useVault } from '@/hooks/useVault';
import { useFeeDistributor } from '@/hooks/useFeeDistributor';
import ClientOnly from '../components/ClientOnly';
import StatCard from '../components/StatCard';
import { ARCSCAN_ADDR, ARCSCAN_TX, VAULT_ADDRESS, FEE_DISTRIBUTOR_ADDRESS } from '@/lib/constants';
import { showToast, updateToast } from '../components/TxToast';

function useVaultAPY(totalAssets: bigint | undefined) {
  const [apy, setApy] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !totalAssets) return;
    const KEY = 'yieldfi_ta_snapshots';
    try {
      const raw = localStorage.getItem(KEY);
      const snapshots: Array<{ ts: number; value: string }> = raw ? JSON.parse(raw) : [];
      snapshots.push({ ts: Date.now(), value: totalAssets.toString() });
      const pruned = snapshots.slice(-500);
      localStorage.setItem(KEY, JSON.stringify(pruned));

      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const old = pruned.find(s => s.ts >= oneDayAgo);
      if (!old || pruned.length < 2) { setApy(null); return; }

      const oldVal = parseFloat(old.value);
      const newVal = parseFloat(totalAssets.toString());
      if (oldVal === 0) { setApy(null); return; }

      const change = (newVal - oldVal) / oldVal;
      setApy(Math.max(0, change * 365 * 100));
    } catch { setApy(null); }
  }, [totalAssets]);

  return apy;
}

function VaultContent() {
  const { isConnected } = useAccount();
  const vault = useVault();
  const fee = useFeeDistributor();
  const apy = useVaultAPY(vault.totalAssets as bigint | undefined);
  const [claimTx, setClaimTx] = useState('');

  // earned() may revert on the currently deployed contract (stale bytecode).
  // We detect this: if distributorBalance > 0 but pendingRewards is undefined → stale contract.
  const distributorHasFunds = fee.distributorBalance != null && (fee.distributorBalance as bigint) > 0n;
  const earnedWorks = fee.pendingRewards !== undefined;
  const hasPendingRewards = earnedWorks && (fee.pendingRewards as bigint) > 0n;

  // Is the FeeDistributor receiving fees? If balance == 0, fees aren't being routed there.
  const feesNotRouted = !distributorHasFunds;

  const handleClaim = async () => {
    const id = showToast({ type: 'pending', message: 'Claiming rewards…' });
    try {
      const hash = await fee.claim();
      setClaimTx(hash);
      updateToast(id, { type: 'success', message: 'Rewards claimed!', txHash: hash });
    } catch (e: any) {
      updateToast(id, { type: 'error', message: e?.shortMessage ?? e?.message ?? 'Claim failed' });
    }
  };

  if (!isConnected) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
        <p style={{ color: 'var(--text-secondary)' }}>Connect your wallet to view vault details</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Vault Details
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          yUSDC ERC-4626 vault —{' '}
          <a href={ARCSCAN_ADDR(VAULT_ADDRESS)} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent-purple)', textDecoration: 'none', fontSize: '0.85rem' }}>
            {VAULT_ADDRESS.slice(0, 8)}…{VAULT_ADDRESS.slice(-6)}
          </a>
        </p>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Assets" value={vault.formatUSDC(vault.totalAssets as bigint)} subValue="USDC"
          accentColor="purple" className="animate-fade-in-up delay-100" />
        <StatCard label="Live APY" value={apy !== null ? `${apy.toFixed(2)}%` : '—'} subValue={apy !== null ? 'Annualized' : 'Accumulating…'}
          accentColor="green" className="animate-fade-in-up delay-200" />
        <StatCard label="Your yUSDC" value={vault.formatShares(vault.userShares as bigint)} subValue="shares"
          accentColor="blue" className="animate-fade-in-up delay-300" />
        <StatCard label="Your USDC Value" value={vault.formatUSDC(vault.userAssets as bigint)} subValue="USDC"
          accentColor="cyan" className="animate-fade-in-up delay-400" />
      </div>

      {/* Fee Rewards */}
      <div className="glass-card p-6 animate-fade-in-up delay-300 mb-6">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Swap Fee Rewards
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              0.3% swap fees distributed proportionally to yUSDC holders
            </p>
          </div>
          {hasPendingRewards && <span className="badge-success">Claimable</span>}
        </div>

        {/* Rewards row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.25rem', background: 'rgba(255,255,255,0.03)',
          borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '1rem',
        }}>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Your Claimable Rewards
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: hasPendingRewards ? '#4ade80' : 'var(--text-primary)' }}>
              {earnedWorks
                ? `${fee.formatUSDC(fee.pendingRewards as bigint)} USDC`
                : feesNotRouted ? '0.000000 USDC' : '—'}
            </div>
          </div>
          <button
            className="btn-gradient"
            onClick={handleClaim}
            disabled={!hasPendingRewards}
            style={{ padding: '0.75rem 1.5rem', opacity: hasPendingRewards ? 1 : 0.5 }}
          >
            Claim
          </button>
        </div>

        {/* Pool balance row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
        }}>
          <div style={{
            padding: '0.875rem 1rem', background: 'rgba(255,255,255,0.02)',
            borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Total in Fee Pool
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>
              {fee.formatUSDC(fee.distributorBalance as bigint)} USDC
            </div>
          </div>
          <div style={{
            padding: '0.875rem 1rem', background: 'rgba(255,255,255,0.02)',
            borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Your Share
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>
              {vault.userShares && vault.totalAssets
                ? (() => {
                    const shares = vault.userShares as bigint;
                    // totalSupply not directly available but approximate from shares/assets
                    // Just show yUSDC shares
                    return `${vault.formatShares(shares)} yUSDC`;
                  })()
                : '—'}
            </div>
          </div>
        </div>

        {/* Warning if fees aren't routing */}
        {feesNotRouted && (
          <div style={{
            marginTop: '1rem', padding: '0.875rem',
            background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
            borderRadius: '0.75rem', fontSize: '0.8125rem', color: '#fbbf24',
          }}>
            ⚠️ Fee distributor has no USDC yet. The Swap contract's <code>feeDistributor</code> address
            needs to be set by the contract owner. Once set, every swap will route 0.3% fees here
            automatically.
          </div>
        )}

        {claimTx && (
          <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
            <a href={ARCSCAN_TX(claimTx)} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '0.8125rem', color: 'var(--accent-purple)', textDecoration: 'none' }}>
              View claim tx →
            </a>
          </div>
        )}
      </div>

      {/* Contract info */}
      <div className="glass-card p-6 animate-fade-in-up delay-400">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Contract Info</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', fontSize: '0.8125rem' }}>
          {[
            { label: 'Vault (yUSDC)', addr: VAULT_ADDRESS },
            { label: 'Fee Distributor', addr: FEE_DISTRIBUTOR_ADDRESS },
          ].map(({ label, addr }) => (
            <div key={addr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <a href={ARCSCAN_ADDR(addr)} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent-purple)', textDecoration: 'none', fontFamily: 'monospace' }}>
                {addr.slice(0, 10)}…{addr.slice(-8)}
              </a>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Your Allowance</span>
            <span style={{ fontFamily: 'monospace' }}>{vault.formatUSDC(vault.allowance as bigint)} USDC</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VaultPage() {
  return (
    <ClientOnly>
      <VaultContent />
    </ClientOnly>
  );
}
