'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'pending';

export interface TxToastData {
  id: string;
  type: ToastType;
  message: string;
  txHash?: string;
}

// Global toast queue
type ToastListener = (toasts: TxToastData[]) => void;
const listeners: ToastListener[] = [];
let toasts: TxToastData[] = [];

function notifyListeners() {
  listeners.forEach(l => l([...toasts]));
}

export function showToast(data: Omit<TxToastData, 'id'>) {
  const id = Date.now().toString();
  toasts = [...toasts, { ...data, id }];
  notifyListeners();

  if (data.type !== 'pending') {
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      notifyListeners();
    }, 6000);
  }

  return id;
}

export function updateToast(id: string, data: Partial<TxToastData>) {
  toasts = toasts.map(t => (t.id === id ? { ...t, ...data } : t));
  notifyListeners();

  if (data.type && data.type !== 'pending') {
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      notifyListeners();
    }, 6000);
  }
}

export function dismissToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  notifyListeners();
}

const ARCSCAN = 'https://testnet.arcscan.app/tx';

const icons: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  pending: '◌',
};

const colors: Record<ToastType, string> = {
  success: '#10b981',
  error: '#ef4444',
  pending: '#6366f1',
};

function Toast({ toast, onDismiss }: { toast: TxToastData; onDismiss: () => void }) {
  const color = colors[toast.type];

  return (
    <div
      className="animate-fade-in-up"
      style={{
        background: 'rgba(10,15,30,0.95)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${color}40`,
        borderRadius: '0.875rem',
        padding: '0.875rem 1rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        minWidth: '280px',
        maxWidth: '360px',
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${color}20`,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: `${color}20`,
          border: `1px solid ${color}50`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color,
          fontSize: '0.875rem',
          fontWeight: 'bold',
          animation: toast.type === 'pending' ? 'spin 1s linear infinite' : undefined,
        }}
      >
        {icons[toast.type]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 500 }}>
          {toast.message}
        </p>
        {toast.txHash && (
          <a
            href={`${ARCSCAN}/${toast.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--accent-purple)',
              fontSize: '0.75rem',
              textDecoration: 'none',
              display: 'block',
              marginTop: '0.25rem',
            }}
          >
            View on ArcScan →
          </a>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        style={{
          color: 'var(--text-muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function TxToastContainer() {
  const [activeToasts, setActiveToasts] = useState<TxToastData[]>([]);

  useEffect(() => {
    const listener: ToastListener = (t) => setActiveToasts(t);
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  if (activeToasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        zIndex: 9999,
      }}
    >
      {activeToasts.map(toast => (
        <Toast
          key={toast.id}
          toast={toast}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}
