# WTT — Wormhole Token Transfer

WUD ERC-20 token bridge from Ethereum to Base using Wormhole's Wrapped Token Transfer (WTT) protocol.

## Addresses

| Item | Chain | Address |
|------|-------|---------|
| WUD Token (native) | Ethereum | `0x5FDcD48F09FB67de3D202cd854B372AEC1100ED5` |
| Wrapped WUD Token | Base | `0xfd4bf08b1583f1cfd2f9a3eadc696ec5e6c55239` |
| Wormhole Token Bridge | Ethereum | `0x3ee18B2214AFF97000D974cf647E7C347E8fa585` |
| Wormhole Token Bridge | Base | `0x8d2de8d2f73F1F4cAB472AC9A881C9b123C79627` |
| Wormhole Core Bridge | Base | `0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6` |

**WUD Token Details:**
- Name: GAVUN WUD
- Symbol: WUD
- Decimals: 10

## What We Did

### 1. Token Attestation (one-time registration)

Before tokens can be bridged, the source token must be "attested" — registered on the Wormhole Token Bridge so the destination chain knows about it. This is a one-time process per source token / destination chain pair.

Following the [Wormhole Attest Tokens Guide](https://wormhole.com/docs/products/token-transfers/wrapped-token-transfers/guides/attest-tokens/), we:

1. **Created an attestation on Ethereum** — called `createAttestation` on Ethereum's Token Bridge contract, which emits a Wormhole message containing the token's metadata (name, symbol, decimals).
   - Attestation tx: `0x0de0596502ed6423d88349548c3091cfa7818b16c8864295aa07fc3c623267d1`
   - Wormhole sequence: `693856`

2. **Waited for Wormhole guardian signing** — the Wormhole guardian network observed the attestation on Ethereum, waited for finality (~15 min), and produced a signed VAA (Verified Action Approval).

3. **Submitted the attestation on Base** — sent the signed VAA to Base's Token Bridge contract, which deployed the wrapped WUD token contract at `0xfd4bf08b1583f1cfd2f9a3eadc696ec5e6c55239`.
   - Submission tx: `0x34f9826dc7a1033db363d0262407dff75a905dee5fc74fc2899074abf574d982`

**Note:** The default Wormhole SDK gas estimation was too low for the Base submission (~489k vs the ~760k needed). We had to send the transaction manually with an adequate gas limit. See `submit-attest.ts`.

### 2. Token Transfer (bridging)

With the token attested, WUD can be bridged from Ethereum to Base using `transfer.ts`:

1. **Initiate transfer on Ethereum** — locks WUD tokens in the Ethereum Token Bridge contract
2. **Wait for VAA** — Wormhole guardians sign the transfer message (~15-20 min on Ethereum mainnet)
3. **Complete transfer on Base** — redeems the VAA on Base, minting wrapped WUD to the destination wallet

## Setup

```bash
npm install
```

Create a `.env` file:

```
ETH_PRIVATE_KEY=your_ethereum_private_key
BASE_PRIVATE_KEY=your_base_private_key
```

Both wallets need ETH for gas on their respective chains.

## Scripts

| Script | Purpose |
|--------|---------|
| `npx tsx attest.ts` | Full attestation flow (only needed once per token/chain pair) |
| `npx tsx submit-attest.ts` | Resume attestation — submits the VAA on Base with proper gas |
| `npx tsx transfer.ts` | Bridge WUD from Ethereum to Base |

Edit `TRANSFER_AMOUNT` in `transfer.ts` to set how many WUD to bridge.

## How It Works

```
Ethereum                    Wormhole Guardians              Base
─────────                   ──────────────────              ────
WUD locked in               Observe tx, wait for            Wrapped WUD minted
Token Bridge  ──────────►   finality, sign VAA  ──────────► from Token Bridge
                            (~15-20 min)
```

The wrapped WUD on Base is a 1:1 representation of the native WUD on Ethereum. It can be bridged back at any time by reversing the process.

## Reference

- [Wormhole Attest Tokens Guide](https://wormhole.com/docs/products/token-transfers/wrapped-token-transfers/guides/attest-tokens/)
- [Wormhole TypeScript SDK](https://www.npmjs.com/package/@wormhole-foundation/sdk)
- [Wormhole Explorer](https://wormholescan.io/)
