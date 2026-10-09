import "dotenv/config";
import {
  wormhole,
  Wormhole,
  signSendWait,
  toNative,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getSigner } from "./helper.js";

// The attestation tx that already succeeded on Ethereum
const SOURCE_TX_HASH = "0x0de0596502ed6423d88349548c3091cfa7818b16c8864295aa07fc3c623267d1";

async function resumeAttestation() {
  const wh = await wormhole("Mainnet", [evm]);

  const sourceChain = wh.getChain("Ethereum");
  const destinationChain = wh.getChain("Base");

  // Parse the existing attestation tx to get the Wormhole message
  console.log("Parsing source transaction...");
  const messages = await sourceChain.parseTransaction(SOURCE_TX_HASH);
  console.log("Parsed messages:", messages);

  if (!messages || messages.length === 0) {
    throw new Error("No Wormhole messages found");
  }

  // Fetch the VAA (should be available immediately since guardians already signed it)
  console.log("\nFetching signed VAA...");
  const timeout = 60 * 1000; // 1 minute should be enough since it's already signed
  const vaa = await wh.getVaa(
    messages[0]!,
    "TokenBridge:AttestMeta",
    timeout
  );

  if (!vaa) {
    throw new Error("Failed to fetch VAA");
  }
  console.log("VAA fetched successfully!");

  // Submit attestation on Base
  console.log("\nSubmitting attestation on Base...");
  const { signer: destSigner } = await getSigner(destinationChain);
  const destTb = await destinationChain.getTokenBridge();
  const destPayer = toNative("Base", destSigner.address());

  const submitTxs = destTb.submitAttestation(vaa, destPayer);
  const destTxIds = await signSendWait(destinationChain, submitTxs, destSigner);
  console.log(`Attestation submitted on Base: ${destTxIds[destTxIds.length - 1]!.txid}`);

  // Poll for wrapped token
  console.log("\nWaiting for wrapped token to appear on Base...");
  const tokenId = Wormhole.tokenId("Ethereum", "0x5FDcD48F09FB67de3D202cd854B372AEC1100ED5");
  for (let i = 0; i < 50; i++) {
    try {
      const wrappedAsset = await wh.getWrappedAsset(destinationChain, tokenId);
      console.log(`\nWrapped WUD token on Base: ${wrappedAsset}`);
      console.log("\nAttestation complete!");
      return;
    } catch {
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, 6000));
    }
  }

  throw new Error("Timed out waiting for wrapped token");
}

resumeAttestation().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
