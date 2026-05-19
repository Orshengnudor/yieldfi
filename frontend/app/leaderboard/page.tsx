'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import ClientOnly from '../components/ClientOnly';
import { POINTS_TRACKER_ADDRESS } from '@/lib/constants';

const POINTS_ABI = [
  {
    name: 'getParticipants', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [
      { name: 'users', type: 'address[]' },
      { name: 'pts', type: 'uint256[]' },
    ],
  },
  {
    name: 'participantCount', type: 'function', stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'points', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getTier', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'string' }],
  },
] as const;

const TIER_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Champion: { bg: 'rgba(234,179,8,0.15)',   color: '#fde047', border: 'rgba(234,179,8,0.4)' },
  Platinum: { bg: 'rgba(139,92,246,0.15)',  color: '#c4b5fd', border: 'rgba(139,92,246,0.4)' },
  Gold:     { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', border: 'rgba(251,191,36,0.35)' },
  Silver:   { bg: 'rgba(148,163,184,0.12)', color: '#cbd5e1', border: 'rgba(148,163,184,0.3)' },
  Bronze:   { bg: 'rgba(180,120,60,0.12)',  color: '#d4956a', border: 'rgba(180,120,60,0.3)' },
};

const RANK_MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };

function getTier(pts: number): string {
  if (pts >= 10000) return 'Champion';
  if (pts >= 5000)  return 'Platinum';
  if (pts >= 2000)  return 'Gold';
  if (pts >= 500)   return 'Silver';
  return 'Bronze';
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface Entry { address: string; points: number; tier: string; rank: number; }

function LeaderboardContent() {
  const { address } = useAccount();

  // Get participant count
  const { data: countData, isLoading: countLoading } = useReadContract({
    address: POINTS_TRACKER_ADDRESS as `0x${string}`,
    abi: POINTS_ABI,
    functionName: 'participantCount',
    query: { refetchInterval: 30_000 },
  });

  const total = Number(countData ?? 0n);

  // Fetch up to 100 participants
  const { data: participantsData, isLoading: listLoading, refetch } = useReadContract({
    address: POINTS_TRACKER_ADDRESS as `0x${string}`,
    abi: POINTS_ABI,
    functionName: 'getParticipants',
    args: [0n, 100n],
    query: { enabled: total > 0, refetchInterval: 30_000 },
  });

  // My points
  const { data: myPoints } = useReadContract({
    address: POINTS_TRACKER_ADDRESS as `0x${string}`,
    abi: POINTS_ABI,
    functionName: 'points',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const isLoading = countLoading || (total > 0 && listLoading);

  // Build sorted leaderboard
  const entries: Entry[] = (() => {
    if (!participantsData) return [];
    const [users, pts] = participantsData as [readonly `0x${string}`[], readonly bigint[]];
    return users
      .map((u, i) => ({
        address: u,
        points: Number(pts[i]),
        tier: getTier(Number(pts[i])),
        rank: 0,
      }))
      .sort((a, b) => b.points - a.points)
      .map((e, i) => ({ ...e, rank: i }));
  })();

  const myEntry = address ? entries.find(e => e.address.toLowerCase() === address.toLowerCase()) : null;
  const myRawPoints = Number(myPoints ?? 0n);
  const myTier = getTier(myRawPoints);
  const tierStyle = TIER_COLORS[myTier] ?? TIER_COLORS.Bronze;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Leaderboard</h1>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          Points are earned by depositing, swapping, staking, and referring. Updates live from chain.
        </p>
      </div>

      {/* My stats */}
      {address && (
        <div style={{
          background: tierStyle.bg,
          border: `1px solid ${tierStyle.border}`,
          borderRadius: 16, padding: '20px 24px', marginBottom: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>Your Rank</div>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>
              {myEntry ? `#${myEntry.rank + 1}` : myRawPoints > 0 ? '—' : 'Unranked'}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>Your Points</div>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>{myRawPoints.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>Tier</div>
            <div style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 20,
              background: tierStyle.bg, border: `1px solid ${tierStyle.border}`,
              color: tierStyle.color, fontWeight: 700, fontSize: 14,
            }}>{myTier}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>Next Tier</div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
              {myTier === 'Bronze'   ? `${500 - myRawPoints} pts to Silver`
               : myTier === 'Silver'  ? `${2000 - myRawPoints} pts to Gold`
               : myTier === 'Gold'    ? `${5000 - myRawPoints} pts to Platinum`
               : myTier === 'Platinum'? `${10000 - myRawPoints} pts to Champion`
               : '🏆 Max tier reached'}
            </div>
          </div>
        </div>
      )}

      {/* Tier guide */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28,
      }}>
        {Object.entries(TIER_COLORS).reverse().map(([tier, style]) => (
          <div key={tier} style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: style.bg, border: `1px solid ${style.border}`, color: style.color,
          }}>
            {tier === 'Bronze' ? '0' : tier === 'Silver' ? '500' : tier === 'Gold' ? '2k' : tier === 'Platinum' ? '5k' : '10k'}+ · {tier}
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, overflow: 'hidden',
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '60px 1fr 120px 100px',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <span>Rank</span>
          <span>Address</span>
          <span style={{ textAlign: 'center' }}>Tier</span>
          <span style={{ textAlign: 'right' }}>Points</span>
        </div>

        {isLoading && (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#475569' }}>
            Loading from chain…
          </div>
        )}

        {!isLoading && entries.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏁</div>
            <div style={{ color: '#94a3b8', fontSize: 15, marginBottom: 6 }}>No participants yet</div>
            <div style={{ color: '#475569', fontSize: 13 }}>
              Deposit, swap, or stake to earn points and appear here.
            </div>
          </div>
        )}

        {entries.map((e, i) => {
          const isMe = address && e.address.toLowerCase() === address.toLowerCase();
          const ts = TIER_COLORS[e.tier] ?? TIER_COLORS.Bronze;
          return (
            <div
              key={e.address}
              style={{
                display: 'grid', gridTemplateColumns: '60px 1fr 120px 100px',
                padding: '14px 20px', alignItems: 'center',
                borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                background: isMe ? 'rgba(99,102,241,0.08)' : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              {/* Rank */}
              <span style={{ fontSize: 15, fontWeight: 700, color: i < 3 ? '#fbbf24' : '#64748b' }}>
                {RANK_MEDAL[i] ?? `#${i + 1}`}
              </span>

              {/* Address */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: 14,
                  color: isMe ? '#a5b4fc' : '#e2e8f0',
                  fontWeight: isMe ? 700 : 400,
                }}>
                  {shortAddr(e.address)}
                </span>
                {isMe && (
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 10,
                    background: 'rgba(99,102,241,0.25)', color: '#a5b4fc',
                    fontWeight: 700, letterSpacing: '0.05em',
                  }}>YOU</span>
                )}
              </div>

              {/* Tier */}
              <div style={{ textAlign: 'center' }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color,
                }}>
                  {e.tier}
                </span>
              </div>

              {/* Points */}
              <span style={{ textAlign: 'right', fontWeight: 700, color: '#fff', fontSize: 15 }}>
                {e.points.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>

      {total > 0 && (
        <div style={{ textAlign: 'center', marginTop: 16, color: '#475569', fontSize: 13 }}>
          {entries.length} of {total} participants · Updates every 30s
          <button
            onClick={() => refetch()}
            style={{
              marginLeft: 12, padding: '3px 10px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', fontSize: 12,
            }}
          >Refresh</button>
        </div>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <ClientOnly>
      <LeaderboardContent />
    </ClientOnly>
  );
}
