import "dotenv/config";
import {
  Wormhole,
  type Chain,
  type ChainAddress,
  type ChainContext,
  type Network,
  type Signer,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";

export interface SignerStuff<N extends Network, C extends Chain> {
  chain: ChainContext<N, C>;
  signer: Signer<N, C>;
  address: ChainAddress<C>;
}

export async function getSigner<N extends Network, C extends Chain>(
  chain: ChainContext<N, C>
): Promise<SignerStuff<N, C>> {
  const platform = chain.platform.utils()._platform;

  let signer: Signer<N, C>;
  switch (platform) {
    case "Evm": {
      const key =
        chain.chain === "Ethereum"
          ? process.env.ETH_PRIVATE_KEY
          : process.env.BASE_PRIVATE_KEY;
      if (!key) throw new Error(`Missing private key env var for ${chain.chain}`);
      signer = await (
        await evm()
      ).getSigner(await chain.getRpc(), key);
      break;
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  return {
    chain,
    signer: signer as Signer<N, C>,
    address: Wormhole.chainAddress(chain.chain, signer.address()),
  };
}
