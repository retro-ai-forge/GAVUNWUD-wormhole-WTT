import "dotenv/config";
import {
  wormhole,
  Wormhole,
  signSendWait,
  toNative,
  amount,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getSigner } from "./helper.js";
import { ethers } from "ethers";

const WUD_TOKEN_ADDRESS = "0x5FDcD48F09FB67de3D202cd854B372AEC1100ED5";
const WUD_DECIMALS = 10;

// Amount to transfer — change this to however many WUD you want to bridge
const TRANSFER_AMOUNT = "140000000"; // 1 WUD

async function transferToken() {
  const wh = await wormhole("Mainnet", [evm]);

  const sourceChain = wh.getChain("Ethereum");
  const destinationChain = wh.getChain("Base");

  const { signer: sourceSigner, address: sourceAddress } = await getSigner(sourceChain);
  const { signer: destSigner, address: destAddress } = await getSigner(destinationChain);

  // Check WUD balance on Ethereum
  const sourceRpc = await sourceChain.getRpc();
  const wudContract = new ethers.Contract(
    WUD_TOKEN_ADDRESS,
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    sourceRpc
  );
  const balance = await wudContract.balanceOf(sourceSigner.address());
  console.log(`WUD balance on Ethereum: ${ethers.formatUnits(balance, WUD_DECIMALS)} WUD`);

  if (balance === 0n) {
    throw new Error("No WUD tokens to transfer");
  }

  // Convert amount to raw units
  const rawAmount = amount.units(amount.parse(TRANSFER_AMOUNT, WUD_DECIMALS));
  console.log(`Transferring ${TRANSFER_AMOUNT} WUD (${rawAmount} raw units)`);
  console.log(`From: ${sourceSigner.address()} (Ethereum)`);
  console.log(`To:   ${destSigner.address()} (Base)`);

  // Build the token transfer
  const tokenId = Wormhole.tokenId("Ethereum", WUD_TOKEN_ADDRESS);

  console.log("\n--- Initiating transfer (manual mode via Token Bridge) ---");
  const xfer = await wh.tokenTransfer(
    tokenId,
    rawAmount,
    sourceAddress,
    destAddress,
    "TokenBridge",
  );

  // Step 1: Initiate the transfer on Ethereum
  console.log("\nStep 1: Sending transfer tx on Ethereum...");
  const srcTxIds = await xfer.initiateTransfer(sourceSigner);
  console.log(`Transfer initiated: ${srcTxIds[srcTxIds.length - 1]!.txid}`);

  // Step 2: Wait for the attestation/VAA
  console.log("\nStep 2: Waiting for Wormhole attestation (this may take 15-20 min on Ethereum)...");
  const attestIds = await xfer.fetchAttestation(25 * 60 * 1000); // 25 min timeout
  console.log("Attestation received!");

  // Step 3: Complete the transfer on Base
  console.log("\nStep 3: Completing transfer on Base...");
  const destTxIds = await xfer.completeTransfer(destSigner);
  console.log(`Transfer completed on Base: ${destTxIds[destTxIds.length - 1]!.txid}`);

  // Verify
  const destRpc = await destinationChain.getRpc();
  const wrappedWud = new ethers.Contract(
    "0xfd4bf08b1583f1cfd2f9a3eadc696ec5e6c55239",
    ["function balanceOf(address) view returns (uint256)"],
    destRpc
  );
  const destBalance = await wrappedWud.balanceOf(destSigner.address());
  console.log(`\nWrapped WUD balance on Base: ${ethers.formatUnits(destBalance, WUD_DECIMALS)} WUD`);
  console.log("Transfer complete!");
}

transferToken().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
