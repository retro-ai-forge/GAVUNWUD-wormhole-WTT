import "dotenv/config";
import {
  wormhole,
  Wormhole,
  signSendWait,
  toNative,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { getSigner } from "./helper.js";

// WUD token contract on Ethereum
const WUD_TOKEN_ADDRESS = "0x5FDcD48F09FB67de3D202cd854B372AEC1100ED5";

async function attestToken() {
  // Initialize Wormhole for Mainnet with EVM platform
  const wh = await wormhole("Mainnet", [evm]);

  // Get chain contexts
  const sourceChain = wh.getChain("Ethereum");
  const destinationChain = wh.getChain("Base");

  // Build token ID
  const tokenId = Wormhole.tokenId("Ethereum", WUD_TOKEN_ADDRESS);

  // Step 1: Check if the token is already attested on Base
  console.log("Checking if WUD token is already attested on Base...");
  try {
    const wrappedAsset = await wh.getWrappedAsset(destinationChain, tokenId);
    console.log(`WUD token is already wrapped on Base at: ${wrappedAsset}`);
    return;
  } catch {
    console.log("WUD token not yet attested on Base. Proceeding with attestation...");
  }

  // Step 2: Create attestation on Ethereum (source chain)
  console.log("\n--- Step 2: Creating attestation on Ethereum ---");
  const { signer: sourceSigner } = await getSigner(sourceChain);

  const sourceTb = await sourceChain.getTokenBridge();
  const token = toNative("Ethereum", WUD_TOKEN_ADDRESS);
  const payer = toNative("Ethereum", sourceSigner.address());

  console.log(`Attesting token ${WUD_TOKEN_ADDRESS} from address ${sourceSigner.address()}...`);
  const attestTxs = sourceTb.createAttestation(token, payer);
  const sourceTxIds = await signSendWait(sourceChain, attestTxs, sourceSigner);

  const sourceTxId = sourceTxIds[sourceTxIds.length - 1]!.txid;
  console.log(`Attestation tx sent: ${sourceTxId}`);

  // Step 3: Get the Wormhole message from the source transaction
  console.log("\n--- Step 3: Parsing transaction for Wormhole message ---");
  const messages = await sourceChain.parseTransaction(sourceTxId);
  console.log(`Parsed messages:`, messages);

  if (!messages || messages.length === 0) {
    throw new Error("No Wormhole messages found in attestation transaction");
  }

  // Step 4: Fetch the signed VAA
  console.log("\n--- Step 4: Fetching signed VAA (this may take several minutes) ---");
  const timeout = 25 * 60 * 1000; // 25 minutes
  const vaa = await wh.getVaa(
    messages[0]!,
    "TokenBridge:AttestMeta",
    timeout
  );

  if (!vaa) {
    throw new Error("Failed to fetch VAA - timed out");
  }
  console.log("VAA fetched successfully!");

  // Step 5: Submit attestation on Base (destination chain)
  console.log("\n--- Step 5: Submitting attestation on Base ---");
  const { signer: destSigner } = await getSigner(destinationChain);

  const destTb = await destinationChain.getTokenBridge();
  const destPayer = toNative("Base", destSigner.address());

  const submitTxs = destTb.submitAttestation(vaa, destPayer);
  const destTxIds = await signSendWait(destinationChain, submitTxs, destSigner);
  console.log(`Attestation submitted on Base: ${destTxIds[destTxIds.length - 1]!.txid}`);

  // Step 6: Poll for the wrapped token to appear
  console.log("\n--- Step 6: Waiting for wrapped token to appear on Base ---");
  const maxAttempts = 50;
  const pollInterval = 6000; // 6 seconds
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const wrappedAsset = await wh.getWrappedAsset(destinationChain, tokenId);
      console.log(`\nWrapped WUD token on Base: ${wrappedAsset}`);
      console.log("\nAttestation complete! You can now transfer WUD from Ethereum to Base.");
      return;
    } catch {
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error("Timed out waiting for wrapped token to appear on Base");
}

attestToken().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
