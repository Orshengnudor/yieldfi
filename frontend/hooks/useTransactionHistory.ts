'use client';

import { useEffect, useState, useCallback } from 'react';

export interface TxRecord {
  hash: string;
  type: string;
  amount: string;
  token: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: number;
  from?: string;
  to?: string;
  chainId?: number;
  extra?: Record<string, unknown>;
}

const MAX_TX = 20;
const STORAGE_KEY = (address: string) => `yieldfi_tx_${address.toLowerCase()}`;

export function useTransactionHistory(address?: string) {
  const [history, setHistory] = useState<TxRecord[]>([]);

  const load = useCallback(() => {
    if (!address || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY(address));
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      setHistory([]);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const addTx = useCallback(
    (tx: Omit<TxRecord, 'timestamp'>) => {
      if (!address || typeof window === 'undefined') return;
      setHistory(prev => {
        const next = [{ ...tx, timestamp: Date.now() }, ...prev].slice(0, MAX_TX);
        localStorage.setItem(STORAGE_KEY(address), JSON.stringify(next));
        return next;
      });
    },
    [address],
  );

  const updateTx = useCallback(
    (hash: string, updates: Partial<TxRecord>) => {
      if (!address || typeof window === 'undefined') return;
      setHistory(prev => {
        const next = prev.map(tx => (tx.hash === hash ? { ...tx, ...updates } : tx));
        localStorage.setItem(STORAGE_KEY(address), JSON.stringify(next));
        return next;
      });
    },
    [address],
  );

  const clearHistory = useCallback(() => {
    if (!address || typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY(address));
    setHistory([]);
  }, [address]);

  return { history, addTx, updateTx, clearHistory, reload: load };
}
