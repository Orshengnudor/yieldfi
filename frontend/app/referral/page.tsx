'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import ClientOnly from '../components/ClientOnly';
import StatCard from '../components/StatCard';
import { REFERRAL_ADDRESS } from '@/lib/constants';
import { showToast, updateToast } from '../components/TxToast';

const REFERRAL_ABI = [
  { name: 'createReferralCode', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'code', type: 'string' }], outputs: [] },
  { name: 'getReferralCode', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'string' }] },
  { name: 'getReferrer', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'address' }] },
  { name: 'useReferralCode', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'code', type: 'string' }, { name: 'referee', type: 'address' }], outputs: [] },
] as const;

const isDeployed = REFERRAL_ADDRESS !== '0x0000000000000000000000000000000000000000';

function ReferralContent() {
  const { address, isConnected } = useAccount();
  const [code, setCode] = useState('');
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const { data: existingCode, refetch } = useReadContract({
    address: REFERRAL_ADDRESS,
    abi: REFERRAL_ABI,
    functionName: 'getReferralCode',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isDeployed },
  });

  const { writeContractAsync } = useWriteContract();
  const [createHash, setCreateHash] = useState<`0x${string}` | undefined>();
  const [isCreating, setIsCreating] = useState(false);
  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: createHash });

  useEffect(() => { if (isTxSuccess) refetch(); }, [isTxSuccess, refetch]);

  const handleCreate = async () => {
    if (!code.trim()) return;
    setIsCreating(true);
    const id = showToast({ type: 'pending', message: 'Creating referral code…' });
    try {
      const hash = await writeContractAsync({
        address: REFERRAL_ADDRESS,
        abi: REFERRAL_ABI,
        functionName: 'createReferralCode',
        args: [code.trim()],
      });
      setCreateHash(hash);
      updateToast(id, { type: 'success', message: `Code "${code}" created!`, txHash: hash });
    } catch (e: any) {
      updateToast(id, { type: 'error', message: e?.shortMessage ?? 'Failed' });
    } finally {
      setIsCreating(false);
    }
  };

  const referralLink = existingCode && origin ? `${origin}/?ref=${existingCode}` : '';

  const handleCopy = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isConnected) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎁</div>
        <p style={{ color: 'var(--text-secondary)' }}>Connect your wallet to start earning</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Earn with Referrals
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Get 20% of swap fees from everyone you bring to YieldFi
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { step: '1', label: 'Create your code', desc: 'Register a unique referral code on-chain' },
          { step: '2', label: 'Share your link', desc: 'Share your personalized referral URL' },
          { step: '3', label: 'Earn 20% fees', desc: 'Get 20% of every swap your referrals make' },
        ].map(({ step, label, desc }) => (
          <div key={step} className="glass-card p-4 text-center animate-fade-in-up" style={{ animationDelay: `${parseInt(step) * 100}ms` }}>
            <div
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 0.75rem', fontWeight: 700, color: 'white',
              }}
            >
              {step}
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.3rem' }}>{label}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Warning if not deployed */}
      {!isDeployed && (
        <div
          className="animate-fade-in-up mb-6"
          style={{
            padding: '0.875rem 1rem',
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: '0.875rem',
            fontSize: '0.875rem',
            color: '#f59e0b',
          }}
        >
          ⚠ Referral contract not yet deployed. Update <code>REFERRAL_ADDRESS</code> in <code>lib/constants.ts</code>.
        </div>
      )}

      {/* Main card */}
      <div className="glass-card p-6 animate-fade-in-up delay-300">
        {existingCode ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Your Referral Link</h2>
              <span className="badge-success">Active</span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                value={referralLink}
                readOnly
                className="glass-input"
                style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', fontFamily: 'monospace' }}
              />
              <button
                className="btn-gradient"
                onClick={handleCopy}
                style={{ padding: '0.75rem 1.25rem', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <div style={{ padding: '0.875rem', background: 'rgba(99,102,241,0.08)', borderRadius: '0.75rem', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Your code</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.125rem' }}>
                {existingCode as string}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Create Your Code</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Choose a unique identifier — letters and numbers only
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="ALICE123"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                className="glass-input"
                style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.05em' }}
                disabled={isCreating || isTxPending}
                maxLength={20}
              />
              <button
                className="btn-gradient"
                onClick={handleCreate}
                disabled={isCreating || isTxPending || !code.trim() || !isDeployed}
                style={{ padding: '0.875rem 1.25rem', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {isCreating ? 'Confirm…' : isTxPending ? 'Confirming…' : 'Create Code'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReferralPage() {
  return (
    <ClientOnly>
      <ReferralContent />
    </ClientOnly>
  );
}
