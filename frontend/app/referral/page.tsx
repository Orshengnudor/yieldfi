"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import Navigation from "../components/Navigation";
import ClientOnly from "../components/ClientOnly";

const REFERRAL_ABI = [/* ABI for createReferralCode, getReferralCode, getReferrer, totalEarned */] as const;
// Replace with your deployed contract address (e.g. from environment or hardcode for local dev)
const REFERRAL_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"; // TODO: set real address

export default function ReferralPage() {
    const { address, isConnected } = useAccount();
    const [referralCode, setReferralCode] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // Read user's existing referral code
    const { data: existingCode } = useReadContract({
        address: REFERRAL_CONTRACT_ADDRESS,
        abi: REFERRAL_ABI,
        functionName: "getReferralCode",
        args: address ? [address] : undefined,
    });

    const { writeContract: createCode } = useWriteContract();

    const handleCreateCode = async () => {
        if (!referralCode) return;
        setIsCreating(true);
        createCode({
            address: REFERRAL_CONTRACT_ADDRESS,
            abi: REFERRAL_ABI,
            functionName: "createReferralCode",
            args: [referralCode],
        });
        setIsCreating(false);
    };

    const referralLink = existingCode 
        ? `${window.location.origin}/?ref=${existingCode}` 
        : "";

    return (
        <>
            <Navigation />
            <main className="flex min-h-screen flex-col items-center p-6 md:p-24">
                <div className="max-w-2xl w-full">
                    <h1 className="text-3xl font-bold mb-8 text-center">Referral Program</h1>
                    <p className="text-center mb-8 text-gray-600 dark:text-gray-400">
                        Earn 20% of swap fees from everyone you invite to YieldFi
                    </p>

                    <ClientOnly>
                        {!isConnected ? (
                            <div className="text-center p-8 bg-yellow-50 rounded-xl">
                                <p>Connect your wallet to start referring</p>
                            </div>
                        ) : existingCode ? (
                            <div className="space-y-6">
                                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
                                    <h2 className="text-xl font-semibold mb-4">Your Referral Link</h2>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={referralLink} 
                                            readOnly 
                                            className="flex-1 p-2 border rounded bg-gray-50 dark:bg-gray-700"
                                        />
                                        <button 
                                            onClick={() => navigator.clipboard.writeText(referralLink)}
                                            className="bg-blue-600 text-white px-4 rounded hover:bg-blue-700"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-4">
                                        Share this link with friends. When they swap, you earn 20% of their swap fees.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
                                <h2 className="text-xl font-semibold mb-4">Create Your Referral Code</h2>
                                <input
                                    type="text"
                                    placeholder="Enter unique code (e.g., ALICE123)"
                                    value={referralCode}
                                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                                    className="w-full p-2 border rounded dark:bg-gray-700 mb-4"
                                />
                                <button
                                    onClick={handleCreateCode}
                                    disabled={isCreating || !referralCode}
                                    className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                    {isCreating ? "Creating..." : "Create Referral Code"}
                                </button>
                            </div>
                        )}
                    </ClientOnly>
                </div>
            </main>
        </>
    );
}