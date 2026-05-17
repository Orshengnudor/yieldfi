"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useVault } from "@/hooks/useVault";
import Navigation from "../components/Navigation";
import ClientOnly from "../components/ClientOnly";

export default function DepositPage() {
  const { isConnected, address } = useAccount();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const vault = useVault();

  const handleApprove = async () => {
    if (!depositAmount) return;
    vault.approveUSDC(depositAmount);
  };

  const handleDeposit = async () => {
    if (!depositAmount || !address) return;
    vault.depositUSDC(depositAmount, address);
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || !address) return;
    vault.withdrawUSDC(withdrawAmount, address, address);
  };

  const needsApproval = vault.allowance && depositAmount
    ? parseFloat(depositAmount) > parseFloat(vault.formatUSDC(vault.allowance as bigint))
    : false;

  return (
    <>
      <Navigation />
      <main className="flex min-h-screen flex-col items-center p-6 md:p-24">
        <div className="z-10 max-w-5xl w-full">
          <h1 className="text-4xl font-bold mb-2 text-center">YieldFi Vault</h1>
          <p className="text-center mb-8 text-gray-600 dark:text-gray-400">
            Deposit USDC and earn yield on Arc testnet
          </p>

          <ClientOnly>
            {!isConnected ? (
              <div className="text-center p-8 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <p>Please connect your wallet to deposit</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Vault Stats Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
                  <h2 className="text-xl font-semibold mb-4">Vault Stats</h2>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total Assets (USDC):</span>
                      <span className="font-mono">{vault.formatUSDC(vault.totalAssets as bigint)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your yUSDC balance:</span>
                      <span className="font-mono">{vault.formatShares(vault.userShares as bigint)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your USDC value:</span>
                      <span className="font-mono">{vault.formatUSDC(vault.userAssets as bigint)}</span>
                    </div>
                  </div>
                </div>

                {/* Deposit Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
                  <h2 className="text-xl font-semibold mb-4">Deposit USDC</h2>
                  <input
                    type="number"
                    placeholder="Amount in USDC"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full p-2 border rounded dark:bg-gray-700 mb-4"
                  />
                  {needsApproval ? (
                    <button
                      onClick={handleApprove}
                      disabled={vault.isApproving}
                      className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {vault.isApproving ? "Approving..." : "Approve USDC"}
                    </button>
                  ) : (
                    <button
                      onClick={handleDeposit}
                      disabled={vault.isDepositing || !depositAmount}
                      className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {vault.isDepositing ? "Depositing..." : "Deposit"}
                    </button>
                  )}
                </div>

                {/* Withdraw Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md md:col-span-2">
                  <h2 className="text-xl font-semibold mb-4">Withdraw USDC</h2>
                  <input
                    type="number"
                    placeholder="Amount in USDC"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full p-2 border rounded dark:bg-gray-700 mb-4"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={vault.isWithdrawing || !withdrawAmount}
                    className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {vault.isWithdrawing ? "Withdrawing..." : "Withdraw"}
                  </button>
                </div>
              </div>
            )}
          </ClientOnly>
        </div>
      </main>
    </>
  );
}