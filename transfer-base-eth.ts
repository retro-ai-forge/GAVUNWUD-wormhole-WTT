import "dotenv/config";
import {
  wormhole,
  Wormhole,
  amount,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getSigner } from "./helper.js";
import { ethers } from "ethers";

const WUD_TOKEN_ADDRESS = "0x5FDcD48F09FB67de3D202cd854B372AEC1100ED5";
const WRAPPED_WUD_ADDRESS = "0xfd4bf08b1583f1cfd2f9a3eadc696ec5e6c55239";
const WUD_DECIMALS = 10;

// Amount to transfer back — change this
const TRANSFER_AMOUNT = "1"; // 1 WUD

async function transferBack() {
  const wh = await wormhole("Mainnet", [evm]);

  const sourceChain = wh.getChain("Base");
  const destinationChain = wh.getChain("Ethereum");

  const { signer: sourceSigner, address: sourceAddress } = await getSigner(sourceChain);
  const { signer: destSigner, address: destAddress } = await getSigner(destinationChain);

  // Check wrapped WUD balance on Base
  const sourceRpc = await sourceChain.getRpc();
  const wrappedWud = new ethers.Contract(
    WRAPPED_WUD_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    sourceRpc
  );
  const balance = await wrappedWud.balanceOf(sourceSigner.address());
  console.log(`Wrapped WUD balance on Base: ${ethers.formatUnits(balance, WUD_DECIMALS)} WUD`);

  if (balance === 0n) {
    throw new Error("No wrapped WUD tokens to transfer back");
  }

  const rawAmount = amount.units(amount.parse(TRANSFER_AMOUNT, WUD_DECIMALS));
  console.log(`Transferring ${TRANSFER_AMOUNT} WUD back to Ethereum (${rawAmount} raw units)`);
  console.log(`From: ${sourceSigner.address()} (Base)`);
  console.log(`To:   ${destSigner.address()} (Ethereum)`);

  // Use the wrapped token address on Base as the source token
  const tokenId = Wormhole.tokenId("Base", WRAPPED_WUD_ADDRESS);

  console.log("\n--- Initiating transfer back (Base -> Ethereum) ---");
  const xfer = await wh.tokenTransfer(
    tokenId,
    rawAmount,
    sourceAddress,
    destAddress,
    "TokenBridge",
  );

  // Step 1: Burn wrapped WUD on Base
  console.log("\nStep 1: Sending transfer tx on Base...");
  const srcTxIds = await xfer.initiateTransfer(sourceSigner);
  console.log(`Transfer initiated: ${srcTxIds[srcTxIds.length - 1]!.txid}`);

  // Step 2: Wait for VAA
  console.log("\nStep 2: Waiting for Wormhole attestation...");
  await xfer.fetchAttestation(25 * 60 * 1000);
  console.log("Attestation received!");

  // Step 3: Redeem native WUD on Ethereum
  console.log("\nStep 3: Completing transfer on Ethereum...");
  const destTxIds = await xfer.completeTransfer(destSigner);
  console.log(`Transfer completed on Ethereum: ${destTxIds[destTxIds.length - 1]!.txid}`);

  // Verify
  const destRpc = await destinationChain.getRpc();
  const wudContract = new ethers.Contract(
    WUD_TOKEN_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    destRpc
  );
  const destBalance = await wudContract.balanceOf(destSigner.address());
  console.log(`\nWUD balance on Ethereum: ${ethers.formatUnits(destBalance, WUD_DECIMALS)} WUD`);
  console.log("Transfer complete!");
}

transferBack().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
