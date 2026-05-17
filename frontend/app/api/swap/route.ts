import { NextRequest, NextResponse } from "next/server";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { parseUnits } from "viem";

const KIT_KEY = process.env.KIT_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Contract addresses (update after deployment)
const FEE_DISTRIBUTOR_ADDRESS = "0xE5274C3CD0b383f6844B4dB96187Ae341F8F3B54";
const REFERRAL_CONTRACT_ADDRESS = "0xYOUR_REFERRAL_CONTRACT_ADDRESS"; // Replace after deploying Referral.sol
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

// Minimal ABI for Referral contract (only what we need)
const REFERRAL_ABI = [
  {
    type: "function",
    name: "getReferrer",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
];

export async function POST(request: NextRequest) {
  try {
    const { tokenIn, tokenOut, amountIn, walletAddress, referralCode } = await request.json();

    if (!KIT_KEY || !PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Missing KIT_KEY or PRIVATE_KEY in environment" },
        { status: 500 }
      );
    }

    const kit = new AppKit();
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: PRIVATE_KEY as `0x${string}`,
    });

    console.log(`Swapping ${amountIn} ${tokenIn} → ${tokenOut} on Arc Testnet`);

    // 1. Perform the swap with custom fee (0.3%) sent to FeeDistributor
    const swapResult = await kit.swap({
      from: { adapter, chain: "Arc_Testnet" },
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      amountIn: amountIn,
      config: {
        kitKey: KIT_KEY,
        customFee: {
          percentageBps: 30, // 0.3%
          recipientAddress: FEE_DISTRIBUTOR_ADDRESS,
        },
      },
    });

    // 2. Handle referral reward (20% of the fee)
    // Get referrer (if any) from the referral contract
    let referrer: string | null = null;
    if (REFERRAL_CONTRACT_ADDRESS !== "0xYOUR_REFERRAL_CONTRACT_ADDRESS") {
      try {
        const response = await fetch(
          `https://rpc.testnet.arc.network/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "eth_call",
              params: [
                {
                  to: REFERRAL_CONTRACT_ADDRESS,
                  data: `0x4a9fefc7${walletAddress.slice(2).padStart(64, "0")}`, // getReferrer(address)
                },
                "latest",
              ],
              id: 1,
            }),
          }
        );
        const json = await response.json();
        if (json.result && json.result !== "0x0000000000000000000000000000000000000000") {
          referrer = `0x${json.result.slice(-40)}`;
          console.log(`Referrer found: ${referrer}`);
        }
      } catch (err) {
        console.warn("Failed to fetch referrer:", err);
      }
    }

    // If a referrer exists, we need to split the fee.
    // Since the custom fee already sent the full 0.3% to FeeDistributor,
    // we will send an additional transaction to transfer 20% of the fee
    // from the FeeDistributor to the referrer's pending rewards.
    // For simplicity, we'll just log that a referral reward should be processed.
    // In a production setup, you would call a function on the FeeDistributor
    // to allocate the referrer's share.

    if (referrer) {
      const amountInParsed = parseUnits(amountIn, 6);
      const totalFee = (amountInParsed * BigInt(30)) / BigInt(10000); // 0.3% of input
      const referrerReward = (totalFee * BigInt(20)) / BigInt(100); // 20% of fee

      console.log(`Referrer reward: ${referrerReward} USDC to ${referrer}`);

      // TODO: Call FeeDistributor's `addReferralReward` function (if implemented)
      // or simply rely on the contract to handle it off-chain.
      // For now, we'll just note it.
    }

    return NextResponse.json({
      success: true,
      txHash: swapResult.txHash,
      explorerUrl: swapResult.explorerUrl,
      amountOut: swapResult.amountOut,
      fees: swapResult.fees,
      referrer: referrer,
    });
  } catch (error: any) {
    console.error("Swap error:", error);
    return NextResponse.json(
      { error: error.message || "Swap failed" },
      { status: 500 }
    );
  }
}