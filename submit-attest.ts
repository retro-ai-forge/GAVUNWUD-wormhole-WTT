import "dotenv/config";
import {
  wormhole,
  Wormhole,
  toNative,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { ethers } from "ethers";

const SOURCE_TX_HASH = "0x0de0596502ed6423d88349548c3091cfa7818b16c8864295aa07fc3c623267d1";
const WUD_TOKEN_ADDRESS = "0x5FDcD48F09FB67de3D202cd854B372AEC1100ED5";

async function submitAttestation() {
  const wh = await wormhole("Mainnet", [evm]);
  const sourceChain = wh.getChain("Ethereum");
  const destinationChain = wh.getChain("Base");

  // Fetch the VAA
  console.log("Fetching VAA...");
  const messages = await sourceChain.parseTransaction(SOURCE_TX_HASH);
  const vaa = await wh.getVaa(messages[0]!, "TokenBridge:AttestMeta", 60000);
  if (!vaa) throw new Error("Failed to fetch VAA");
  console.log("VAA fetched!");

  // Build the transaction data from the SDK
  const destTb = await destinationChain.getTokenBridge();
  const payer = toNative("Base", "0x8E7Fc8bAcC499B513a07Fc361289C6Ca9e8dE976");

  const txGenerator = destTb.submitAttestation(vaa, payer);
  let txData: string = "";
  let txTo: string = "";
  for await (const tx of txGenerator) {
    txData = tx.transaction.data as string;
    txTo = tx.transaction.to as string;
  }

  // Send manually with proper gas limit
  console.log("\nSending transaction with adequate gas limit...");
  const rpc = await destinationChain.getRpc();
  const key = process.env.BASE_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(key, rpc);

  const gasEstimate = await rpc.estimateGas({
    to: txTo,
    data: txData,
    from: wallet.address,
  });
  console.log(`Gas estimate: ${gasEstimate}`);

  const tx = await wallet.sendTransaction({
    to: txTo,
    data: txData,
    gasLimit: gasEstimate * 130n / 100n, // 30% buffer
  });
  console.log(`Tx sent: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Tx confirmed! Status: ${receipt?.status}`);
  console.log(`Gas used: ${receipt?.gasUsed}`);

  // Verify the wrapped token
  console.log("\nVerifying wrapped token...");
  const tokenId = Wormhole.tokenId("Ethereum", WUD_TOKEN_ADDRESS);
  for (let i = 0; i < 20; i++) {
    try {
      const wrapped = await wh.getWrappedAsset(destinationChain, tokenId);
      console.log(`\nWrapped WUD token on Base: ${wrapped}`);
      console.log("Attestation complete!");
      return;
    } catch {
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

submitAttestation().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
