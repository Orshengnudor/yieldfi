'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useVault } from '@/hooks/useVault';
import ClientOnly from '../components/ClientOnly';
import StatCard from '../components/StatCard';
import { ARCSCAN_TX } from '@/lib/constants';
import { showToast, updateToast } from '../components/TxToast';

type DepositStep = 'idle' | 'approving' | 'depositing' | 'withdrawing' | 'done' | 'error';

function DepositContent() {
  const { isConnected, address, chainId } = useAccount();
  const onCorrectChain = chainId === 5042002;
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [step, setStep] = useState<DepositStep>('idle');
  const [lastTxHash, setLastTxHash] = useState<string>('');

  const vault = useVault();

  const isLoading = step === 'approving' || step === 'depositing' || step === 'withdrawing';

  const handleDeposit = async () => {
    if (!depositAmount || !address) return;
    const id = showToast({ type: 'pending', message: 'Step 1/2 — Approve USDC…' });
    try {
      setStep('approving');
      // approveAndDeposit handles: approve if needed → deposit, all sequential
      // It will pop wallet twice if approval is needed (approve, then deposit)
      updateToast(id, { type: 'pending', message: 'Confirm approval in wallet…' });
      
      // Check if we need approval first
      const amtNum = parseFloat(depositAmount);
      const allowanceNum = vault.allowance
        ? parseFloat(vault.formatUSDC(vault.allowance as bigint))
        : 0;

      if (allowanceNum < amtNum) {
        // Approval needed — user will see wallet popup for approve
        updateToast(id, { type: 'pending', message: 'Step 1/2 — Confirm USDC approval in wallet…' });
      } else {
        updateToast(id, { type: 'pending', message: 'Step 1/2 — Allowance OK, confirming deposit…' });
      }

      setStep('depositing');
      const hash = await vault.approveAndDeposit(depositAmount, address);
      setLastTxHash(hash);
      setStep('done');
      setDepositAmount('');
      updateToast(id, { type: 'success', message: `Deposited ${depositAmount} USDC into vault`, txHash: hash });
    } catch (e: any) {
      setStep('error');
      const msg = e?.shortMessage ?? e?.message ?? 'Deposit failed';
      updateToast(id, { type: 'error', message: msg });
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || !address) return;
    const id = showToast({ type: 'pending', message: 'Withdrawing USDC…' });
    try {
      setStep('withdrawing');
      const hash = await vault.withdrawUSDC(withdrawAmount, address, address);
      setLastTxHash(hash);
      setStep('done');
      setWithdrawAmount('');
      updateToast(id, { type: 'success', message: `Withdrew ${withdrawAmount} USDC`, txHash: hash });
    } catch (e: any) {
      setStep('error');
      const msg = e?.shortMessage ?? e?.message ?? 'Withdrawal failed';
      updateToast(id, { type: 'error', message: msg });
    }
  };

  if (!isConnected) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
        <p style={{ color: 'var(--text-secondary)' }}>Connect your wallet to deposit</p>
      </div>
    );
  }

  if (!onCorrectChain) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <p style={{ color: '#f87171', fontWeight: 600, marginBottom: '0.5rem' }}>Wrong Network</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Switch to <strong>Arc Testnet</strong> (chain ID 5042002) in your wallet to see balances and interact.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          USDC Vault
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Deposit USDC and earn yield on Arc testnet</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8 animate-fade-in-up delay-100">
        <StatCard
          label="Total Vault Assets"
          value={`${vault.formatUSDC(vault.totalAssets as bigint)} USDC`}
          icon={<span style={{ fontSize: '0.875rem' }}>📦</span>}
          accentColor="purple"
        />
        <StatCard
          label="Your yUSDC Shares"
          value={vault.formatShares(vault.userShares as bigint)}
          icon={<span style={{ fontSize: '0.875rem' }}>🪙</span>}
          accentColor="blue"
        />
        <StatCard
          label="Your USDC Value"
          value={`${vault.formatUSDC(vault.userAssets as bigint)} USDC`}
          icon={<span style={{ fontSize: '0.875rem' }}>💵</span>}
          accentColor="cyan"
          className="col-span-2 md:col-span-1"
        />
      </div>

      {/* Tab card */}
      <div className="glass-card p-6 animate-fade-in-up delay-200">
        {/* Tabs */}
        <div
          className="flex mb-6"
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '0.75rem',
            padding: '0.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
            width: 'fit-content',
          }}
        >
          {(['deposit', 'withdraw'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setStep('idle'); }}
              style={{
                padding: '0.5rem 1.5rem',
                borderRadius: '0.625rem',
                border: 'none',
                cursor: 'pointer',
                fontWeight: tab === t ? 600 : 400,
                fontSize: '0.9rem',
                color: tab === t ? 'white' : 'var(--text-secondary)',
                background: tab === t ? 'linear-gradient(135deg, #6366f1, #3b82f6)' : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'deposit' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Amount (USDC)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Balance: <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{vault.formatUSDC(vault.walletUSDC as bigint)} USDC</span>
                  </span>
                  {vault.walletUSDC && (vault.walletUSDC as bigint) > 0n && (
                    <button
                      onClick={() => setDepositAmount(vault.formatUSDC(vault.walletUSDC as bigint))}
                      style={{
                        fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '0.35rem',
                        border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)',
                        color: 'var(--accent-purple)', cursor: 'pointer', fontWeight: 600,
                      }}
                    >
                      MAX
                    </button>
                  )}
                </div>
              </div>
              <input
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={e => { setDepositAmount(e.target.value); setStep('idle'); }}
                className="glass-input"
                style={{ padding: '0.875rem 1rem', fontSize: '1.125rem' }}
                disabled={isLoading}
              />
            </div>

            <button
              className="btn-gradient"
              onClick={handleDeposit}
              disabled={isLoading || !depositAmount || parseFloat(depositAmount) <= 0}
              style={{ padding: '0.875rem', fontSize: '1rem' }}
            >
              {step === 'approving' ? 'Step 1/2 — Approving USDC…'
                : step === 'depositing' ? 'Step 2/2 — Depositing…'
                : 'Deposit USDC'}
            </button>

            {(step === 'approving' || step === 'depositing') && (
              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-0.25rem' }}>
                {step === 'approving'
                  ? 'Confirm the approval transaction in your wallet'
                  : 'Approval confirmed — confirm deposit in your wallet'}
              </p>
            )}

            {step === 'done' && lastTxHash && (
              <div style={{ padding: '0.875rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.75rem' }}>
                <p style={{ color: '#10b981', fontWeight: 600, marginBottom: '0.4rem' }}>✓ Deposited successfully</p>
                <a href={ARCSCAN_TX(lastTxHash)} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.8125rem', color: 'var(--accent-purple)', textDecoration: 'none' }}>
                  View on ArcScan →
                </a>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Amount (USDC)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Available: <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{vault.formatUSDC(vault.userAssets as bigint)} USDC</span>
                  </span>
                  {vault.userAssets && (vault.userAssets as bigint) > 0n && (
                    <button
                      onClick={() => setWithdrawAmount(vault.formatUSDC(vault.userAssets as bigint))}
                      style={{
                        fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '0.35rem',
                        border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)',
                        color: 'var(--accent-purple)', cursor: 'pointer', fontWeight: 600,
                      }}
                    >
                      MAX
                    </button>
                  )}
                </div>
              </div>
              <input
                type="number"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={e => { setWithdrawAmount(e.target.value); setStep('idle'); }}
                className="glass-input"
                style={{ padding: '0.875rem 1rem', fontSize: '1.125rem' }}
                disabled={isLoading}
              />
            </div>
            <button
              className="btn-gradient"
              onClick={handleWithdraw}
              disabled={isLoading || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
              style={{ padding: '0.875rem', fontSize: '1rem' }}
            >
              {step === 'withdrawing' ? 'Withdrawing…' : 'Withdraw USDC'}
            </button>

            {step === 'withdrawing' && (
              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-0.25rem' }}>
                Confirm the withdrawal in your wallet
              </p>
            )}

            {step === 'done' && lastTxHash && (
              <div style={{ padding: '0.875rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.75rem' }}>
                <p style={{ color: '#10b981', fontWeight: 600, marginBottom: '0.4rem' }}>✓ Withdrawn successfully</p>
                <a href={ARCSCAN_TX(lastTxHash)} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.8125rem', color: 'var(--accent-purple)', textDecoration: 'none' }}>
                  View on ArcScan →
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DepositPage() {
  return (
    <ClientOnly>
      <DepositContent />
    </ClientOnly>
  );
}
