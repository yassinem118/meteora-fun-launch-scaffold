# Fun Launch

**A launchpad on Meteora Dynamic Bonding Curve where every launch type is a different price-discovery mechanism: memes, steady growth, anchored utility, and price bands for newly tokenized assets.**

Pick a curve, tune the fees, choose what the token trades against, launch a pool, trade it, and migrate it to Meteora DAMM v2 with the liquidity locked. Everything runs on the official DBC SDK and has been exercised end to end on Solana devnet.

> Built for the Meteora DBC track of the Superteam hackathon, on top of the `meteora-invent` fun-launch scaffold.

## Links

| | |
|---|---|
| Live demo | https://meteora-fun-launch-scaffold.vercel.app/ |
| Demo video (3 min) | [Watch on Loom](https://www.loom.com/share/453e2409397e47ffb306585581996e57) |
| Source code | https://github.com/yassinem118/meteora-fun-launch-scaffold/tree/main/scaffolds/fun-launch |
| Devnet proofs | [see below](#devnet-proof) |
| Developer API | `GET /api/presets`, `GET /api/curve` ([docs](#developer-api)) |

## The idea

A token that has just been created, or tokenized from a thinly traded asset, has no reliable reference price. A plain curve rewards snipers and gives the first buyers a different deal from everyone else. Fun Launch explores two mechanisms on top of DBC:

1. **Price bands (the RWA / Stock Steps curve).** Liquidity is deep inside a few price bands and almost empty between them, so price discovery happens in steps instead of one smooth slide.
2. **Opening-fee decay.** The trading fee starts high and falls to a steady value over a configurable time, which taxes first-block snipers and protects ordinary buyers.

Both are plain DBC configuration: no custom program, nothing off-chain. The same engine also produces the other curve shapes, and the quote token can be SOL or any SPL mint, so the same launch flow can be paired against a stablecoin or a tokenized stock.

## What it does

- **Four curve presets**, each a real DBC config built with `buildCurveWithLiquidityWeights` (16 liquidity-weighted segments).
- **Live curve preview** computed from the exact config that is sent on-chain (price versus supply sold), not a simulation.
- **Fee schedule**: a steady fee plus an optional linear opening-fee decay (`FeeSchedulerLinear`, 10 steps).
- **Custom quote token**: SOL or any SPL mint; decimals are read from the mint and the whole curve follows.
- **Two-transaction launch**: `createConfig`, then `createPool`, with a balance check and an RPC simulation before the wallet is asked to sign.
- **Trade page** (`/trade?mint=...`): live price, progress to graduation, buy and sell through `swapQuote2` / `swap2`. A **Max** button fills your balance, and buys use `PartialFill` so the buy that crosses the threshold fills what it can and refunds the rest.
- **Manual migration**: when the curve is complete, a **Migrate to DAMM v2** button builds the SDK's `migrateToDammV2` transaction. Afterwards the page links to the DAMM v2 pool.
- **Shareable configs**: any tuned config is a URL (`/?p=rwa-steps&i=1&m=10&f=0.25&s=3&t=600`).
- **Preset advisor**: transparent keyword rules (no model) that suggest a preset for a described token.
- **Developer API** so terminals and other launchpads can reuse the curves and fee schedules.

## The presets

Defaults are 1 to 10 SOL market cap, 1,000,000,000 supply, 6 decimals. Graduation thresholds are computed by the SDK.

| Preset | Shape | Fee | Graduates at |
|---|---|---|---|
| Meme Launch | Most supply sells cheaply, then the price shoots up near graduation | 5% decaying to 1% over about 2 min | 1.34 SOL |
| Steady Growth | Even liquidity across the curve | 0.5% flat | 2.38 SOL |
| RWA / Stock Steps | Deep liquidity inside price bands, near-empty segments between them | 3% decaying to 0.25% over about 10 min | 2.70 SOL |
| Flat Band | Liquidity concentrated near the start price, then a sharp rise | 0.5% flat | 1.25 SOL |

## How it uses the Meteora stack

| Area | What is used |
|---|---|
| Curve construction | `buildCurveWithLiquidityWeights`, `validateCurve`, `getPriceFromSqrtPrice`, `getDeltaAmountBaseUnsigned` |
| Config and pool | `client.partner.createConfig`, `client.creator.createPool`, `deriveDbcPoolAddress` |
| Fees | `BaseFeeMode.FeeSchedulerLinear`, dynamic fee enabled, quote-token fee collection |
| Trading | `client.pool.swapQuote2`, `client.pool.swap2` with `SwapMode.PartialFill` and `SwapMode.ExactIn` |
| Pool state | `client.state.getPoolByBaseMint`, `client.state.getPoolConfig`, `migrationProgress` |
| Migration to DAMM v2 | `client.migration.migrateToDammV2`, `DAMM_V2_MIGRATION_FEE_ADDRESS`, `deriveDammV2PoolAddress` |

Migration settings in every preset: DAMM v2 (`MET_DAMM_V2`) with the fixed 200 bps migration fee option, and **100% of the migrated liquidity permanently locked**. The token uses an immutable authority.

DLMM is not used in this submission (see [roadmap](#limitations-and-roadmap)).

## Devnet proof

Token **Atlas Smart Logistics Token (aLOG)**, Steady Growth preset, launched, bought to 100% and migrated from the UI.

| What | Link |
|---|---|
| Token mint | [F3qPdiLrkudsnHr4LNE4udp17g9drA3H15PVcctQY2Ma](https://solscan.io/token/F3qPdiLrkudsnHr4LNE4udp17g9drA3H15PVcctQY2Ma?cluster=devnet) |
| DBC pool | [FxGKhZD1Cgx2vYM5w3fZbCbnrCVjeLPuYXgMBBN1M78H](https://solscan.io/account/FxGKhZD1Cgx2vYM5w3fZbCbnrCVjeLPuYXgMBBN1M78H?cluster=devnet) |
| Launch transaction (`createPool`) | [3y9fJwTp...hvALT5i](https://solscan.io/tx/3y9fJwTp6ZbcfNj2wzUd9eqGLbmV3kTwkGPkrGE6r5z8gakUtBueDLQ5LgkLHJEbjRKAjod1VDjDPDbZtvhALT5i?cluster=devnet) |
| Buy transaction (curve completed) | [4eSau5My...mqV1K](https://solscan.io/tx/4eSau5MyPsQA5Vovb3kS4F3c5cXFXMS9KFyVsRV6U4ebKKFy7jGLvPo9jGad2PsZq8kSJsmFP8HmL3fEYcVmqV1K?cluster=devnet) |
| Migration transaction (`migrateToDammV2`) | [TkWv4g3r...NM9](https://solscan.io/tx/TkWv4g3rhQtzTnr29MQt1X69G4NxC3AuzSmPqURHiKycTHFjRzLYXErmkzgg7onRoLHJHpEJ3HJgqGQDpLEr9NM?cluster=devnet) |
| DAMM v2 pool | [FhQ3txumB448CDcVYrw8KkRf4q9KXagZLGvFX3vDfQ1P](https://solscan.io/account/FhQ3txumB448CDcVYrw8KkRf4q9KXagZLGvFX3vDfQ1P?cluster=devnet) |
| Wallet used | [H6hAM6SbHF3jzxGTQNQeE1GUdVCRFtGLruxkDsfW7mat](https://solscan.io/account/H6hAM6SbHF3jzxGTQNQeE1GUdVCRFtGLruxkDsfW7mat?cluster=devnet) |

All links open Solscan on devnet. The same flow was also run with the RWA / Stock Steps preset (token "Tesla Tokenized Stock").

## Try it in three minutes

1. Install Phantom and switch it to **Devnet** (Settings, Developer Settings, Testnet Mode). Get devnet SOL from a faucet.
2. Open the live demo, choose **Steady Growth** (it graduates at about 2.4 SOL, the cheapest to complete), enter a name and a symbol, and press **Launch token**. Approve the two transactions.
3. Press **Open the trade page**, press **Max** on a buy, and confirm. The curve completes.
4. Press **Migrate to DAMM v2** and confirm. The page links to the new DAMM v2 pool.

A full run costs a few hundredths of a SOL in rent (the config transaction took about 0.006 SOL and the pool transaction about 0.02 SOL in our runs), plus the amount you buy with.

## Developer API

CORS is open. Prices and market caps are in units of the quote token.

```bash
# every preset with its fee schedule and graduation threshold
curl "$APP/api/presets"

# exact curve for any config (same query format as the shareable links)
curl "$APP/api/curve?p=rwa-steps&i=1&m=10&f=0.25&s=3&t=600&d=9"
```

`/api/curve` parameters: `p` preset, `i` initial market cap, `m` migration market cap, `f` steady fee in percent, `s` opening fee in percent, `t` decay time in seconds, `d` quote token decimals. The response contains the fee schedule, the graduation threshold and about 100 points of price and market cap versus supply sold.

`src/lib/dbc.ts` has no framework dependency and can be reused directly: `buildConfig`, `summarizeCurve`, `buildConfigTx`, `buildPoolTx`, `buildMigrateTx`, `getMigrationStatus`.

## Architecture

```
src/
  lib/
    dbc.ts          presets, config builder, curve sampling, launch and migration transactions
    send.ts         balance check, RPC simulation, readable wallet errors
    share.ts        config <-> URL
    theme.ts        one colour world per preset
  components/       CurveVisualizer, PresetMarketplace, PresetAdvisor, Shell
  pages/
    index.tsx       choose, tune and launch
    trade.tsx       trade, graduation progress, migration
    api/            curve, presets, metadata
```

Flow: the UI builds a `ConfigParameters` object with `dbc.ts`, previews the curve from that same object, then sends `createConfig` and `createPool` through the wallet. The trade page reads the pool and config back from chain and quotes with the SDK's own swap math.

## Design notes

Things that only show up when you run it against the real program:

- **The program rejects empty segments.** A liquidity weight of 0 makes the curve invalid, so the price bands use a tiny weight (0.05 against 5) and the price jumps almost straight over them.
- **Config and pool do not fit in one transaction.** Together they exceed Solana's 1232-byte limit (the config alone is about 980 bytes), so the launch is split in two.
- **The last buy can overshoot the threshold.** Buys use `PartialFill`, and the UI tells you how much of the amount will not be used.
- **Migration is not automatic for small pools.** Per Meteora's docs, the mainnet keepers only migrate pools whose threshold is at least 10 SOL (or 750 USDC), and they do not run on devnet. The presets graduate well below that, so the app ships a manual migration button. For auto-migration on mainnet, raise the migration market cap (for example 5 to 50 SOL gives a threshold near 12 SOL).
- **`migration_progress = 2` is the normal "ready" state**, not an error, even though its name suggests vesting.
- **Wallet errors are opaque.** Before asking the wallet to sign, the app checks the balance and simulates the transaction on the RPC, so a real program error is shown instead of "Unexpected error".

## Run locally

```bash
git clone https://github.com/yassinem118/meteora-fun-launch-scaffold
cd meteora-fun-launch-scaffold
pnpm install
cd scaffolds/fun-launch
pnpm dev        # http://localhost:3000, wallet adapter on devnet
```

The token metadata `uri` points to `/api/metadata`, which wallets and explorers can only read once the app is deployed on a public URL.

Stack: Next.js, React, TypeScript, `@meteora-ag/dynamic-bonding-curve-sdk`, Solana wallet adapter, Recharts.

## Verification

- Every preset passes the SDK's curve validation, and the fee schedules pass its fee validators.
- The `createConfig` transaction of every preset fits Solana's size limit.
- The code type-checks under the strict TypeScript configuration of the scaffold.
- Launch, buy, curve completion and migration were run from the UI on devnet (see [proof](#devnet-proof)).
- There is no automated test suite yet.

## Limitations and roadmap

Honest status: this is a devnet prototype.

- Not audited and not live on mainnet, so there is no mainnet volume or user base yet.
- The migration is manual (button), and the app does not run a keeper.
- DLMM is not integrated. Planned: conviction pools on DLMM that receive the migrated liquidity.
- The presets are fixed in code and shared through links. A paid or on-chain preset marketplace is not built.
- The preset advisor is a rule set, not a model.
- Stock pairs are supported through the custom quote mint, but have not been run against a real tokenized-stock mint.
- Fee decay is slot-based, so durations in seconds are approximate.

Next steps: mainnet launch with keeper-sized presets (10 SOL or more), exponential fee scheduler mode, a real tokenized-stock pair, DLMM conviction pools, and an automated test suite.

## Judging criteria

| Criterion | Where to look |
|---|---|
| Depth of Meteora integration | [How it uses the Meteora stack](#how-it-uses-the-meteora-stack): DBC config, pool, fee scheduler, swaps, state reads and the DAMM v2 migration with locked liquidity |
| Technical execution | [Design notes](#design-notes) and [Verification](#verification) |
| Originality and taste | Price-band curve and opening-fee decay as launch mechanics for thin or newly tokenized markets |
| Impact potential | The same engine and API serve memes, utility tokens and tokenized assets through the quote-token choice |
| Traction | Devnet only so far; see [limitations](#limitations-and-roadmap) |

## License

Built on the MIT-licensed `meteora-invent` scaffold. See the license file in the repository root.
