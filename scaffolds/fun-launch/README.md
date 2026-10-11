# Fun Launch: DBC presets for memes, utility and tokenized stocks

A launchpad built on **Meteora Dynamic Bonding Curve (DBC)**. Pick a curve preset, tune it,
preview the exact curve, and launch a pool on-chain. Pools graduate to **Meteora DAMM v2**
with the liquidity permanently locked.

## What it does

- **4 curve presets**, each a real DBC config built with `buildCurveWithLiquidityWeights`
  (16 liquidity-weighted segments): Meme Launch, Steady Growth, RWA / Stock Steps, Flat Band.
- **RWA / Stock Steps**: deep liquidity inside price bands with near-empty segments between them,
  so price discovery happens in steps. Meant for thinly traded or newly tokenized assets.
- **Anti-sniper fee decay**: the trading fee starts high and decays linearly to its steady value
  (`FeeSchedulerLinear`, 10 steps). Defaults: Meme 5% to 1% over ~2 min, RWA Steps 3% to 0.25% over ~10 min.
- **Custom quote token**: pair against SOL or any SPL mint (stablecoin, tokenized stock).
  Decimals are read from the mint; curve, chart and prices follow.
- **Chart computed from the real config** (price vs. supply sold), the same data sent on-chain.
- **Launch in 2 transactions**: `createConfig`, then `createPool` (config + pool together exceed
  Solana's 1232-byte limit).
- **Trade page (`/trade?mint=...`)**: live price, graduation progress, buy/sell with `swapQuote2` and `swap2`.
  Buys use `PartialFill`, so a last buy that crosses the threshold fills what it can and refunds the rest.
  A **Max** button fills your full balance (keeping 0.01 SOL aside when the quote is SOL).
- **Manual migration**: when the curve is complete, the trade page shows a **Migrate to DAMM v2** button
  that builds the SDK's `migrateToDammV2` transaction (the DAMM v2 config key comes from the pool's
  migration fee option).
- **Shareable configs**: every tuned config is a URL (`/?p=rwa-steps&i=1&m=10&f=0.25&s=3&t=600`).
- **Preset advisor**: transparent keyword rules (no model) that suggest a preset.

## Developer API (plug-and-play for terminals and other launchpads)

- `GET /api/presets`: all presets with fee schedule and graduation threshold.
- `GET /api/curve?p=<preset>&i=&m=&f=&s=&t=&d=`: exact curve points (price and market cap vs. supply),
  fee schedule and graduation threshold. `d` is the quote token's decimals. CORS is open.
- `src/lib/dbc.ts` is framework-free and reusable: `buildConfig`, `summarizeCurve`,
  `buildConfigTx`, `buildPoolTx`.

## Run it

```bash
pnpm install
pnpm dev   # http://localhost:3000, wallet adapter on devnet
```

The token metadata `uri` points to `/api/metadata`, which only resolves once the app is deployed
on a public URL.

## Verification status

Checked offline with the official SDK (v1.5.13):
- all presets pass the SDK's curve validation and build `createConfig` transactions that fit
  Solana's size limit; fee schedules are accepted by the SDK's validators;
- the code typechecks against the dependency versions in `package.json`.

**Add your own results here before submitting:**
- Devnet launch transaction: `<Solscan link>`
- Devnet pool: `<Solscan link>`
- Devnet swap via `/trade`: `<Solscan link>`

## Known limitations

- Migration to DAMM v2 is configured (fees, 100% permanently locked LP). Meteora's keepers only run on mainnet and, per the docs, only migrate pools whose threshold is at least 10 SOL (or 750 USDC). The presets here graduate at about 1.3 to 3.9 SOL, so they need the manual **Migrate** button, on devnet and on mainnet. For auto-migration on mainnet, raise the migration market cap (for example 5 to 50 SOL gives a threshold near 12 SOL).
- The manual migration button is implemented but its on-chain result is not recorded here yet: `<Solscan link>`.
- Fee decay is slot-based, so durations in seconds are approximate.
- Presets are fixed in code and shared via links; there is no on-chain or paid preset marketplace.
- No DLMM integration.
- Not audited. Not live on mainnet.
