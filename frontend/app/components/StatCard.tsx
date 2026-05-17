'use client';

import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | ReactNode;
  subValue?: string;
  icon?: ReactNode;
  trend?: { value: string; positive: boolean };
  loading?: boolean;
  accentColor?: 'purple' | 'blue' | 'cyan' | 'green';
  className?: string;
}

const accentMap = {
  purple: 'rgba(99,102,241,0.2)',
  blue: 'rgba(59,130,246,0.2)',
  cyan: 'rgba(6,182,212,0.2)',
  green: 'rgba(16,185,129,0.2)',
};

const borderMap = {
  purple: 'rgba(99,102,241,0.3)',
  blue: 'rgba(59,130,246,0.3)',
  cyan: 'rgba(6,182,212,0.3)',
  green: 'rgba(16,185,129,0.3)',
};

export default function StatCard({
  label,
  value,
  subValue,
  icon,
  trend,
  loading = false,
  accentColor,
  className = '',
}: StatCardProps) {
  const accent = accentColor ? accentMap[accentColor] : undefined;
  const border = accentColor ? borderMap[accentColor] : undefined;

  return (
    <div
      className={`glass-card p-5 flex flex-col gap-3 ${className}`}
      style={accent ? { background: accent, borderColor: border } : {}}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
        {icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            {icon}
          </div>
        )}
      </div>

      {loading ? (
        <div className="skeleton h-8 w-32" />
      ) : (
        <div>
          <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {value}
          </div>
          {subValue && (
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {subValue}
            </div>
          )}
        </div>
      )}

      {trend && !loading && (
        <div className="flex items-center gap-1">
          <span
            className="text-xs font-semibold"
            style={{ color: trend.positive ? 'var(--success)' : 'var(--danger)' }}
          >
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            24h
          </span>
        </div>
      )}
    </div>
  );
}
