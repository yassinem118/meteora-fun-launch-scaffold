import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  DynamicBondingCurveClient,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  Rounding,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithLiquidityWeights,
  getDeltaAmountBaseUnsigned,
  getPriceFromSqrtPrice,
  type ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

/** Wrapped SOL, the default quote token. */
export const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/**
 * The asset the token is paired against. SOL by default, but any SPL mint works
 * (a stablecoin, or a tokenized stock for stock-pairs). Decimals come from the mint.
 */
export interface QuoteToken {
  mint: PublicKey;
  decimals: number;
  symbol: string;
}

export const SOL_QUOTE: QuoteToken = { mint: SOL_MINT, decimals: 9, symbol: 'SOL' };

export type PresetId = 'meme' | 'steady' | 'rwa-steps' | 'flat';

export interface Preset {
  id: PresetId;
  title: string;
  tag: string;
  description: string;
  /**
   * 16 liquidity weights, one per curve segment. The program requires liquidity > 0 on every
   * segment, so use a tiny weight (not 0) for gaps: price then jumps almost straight over them.
   */
  liquidityWeights: number[];
  /** Market caps are expressed in units of the quote token. */
  initialMarketCap: number;
  migrationMarketCap: number;
  /** Steady-state trading fee in bps (the fee after any anti-sniper decay has finished). */
  feeBps: number;
  /**
   * Optional anti-sniper schedule: the fee starts at `startBps` and decays linearly to `feeBps`
   * over `seconds`. Protects thinly traded / newly tokenized launches from first-block snipers.
   */
  antiSnipe?: { startBps: number; seconds: number };
}

/** Solana produces ~2.5 slots per second; the pool uses slot-based activation. */
export const SLOTS_PER_SECOND = 2.5;
const FEE_DECAY_PERIODS = 10;

// Weights are relative: only the ratios matter. Each preset becomes a REAL DBC config.
export const PRESETS: Preset[] = [
  {
    id: 'meme',
    title: 'Meme Launch',
    tag: 'Popular',
    description: 'Most supply sells cheaply up front, then price shoots up as the curve nears graduation.',
    liquidityWeights: [100, 70, 50, 36, 26, 19, 14, 10, 8, 6, 4, 3, 2, 2, 1, 1],
    initialMarketCap: 1,
    migrationMarketCap: 10,
    feeBps: 100,
    antiSnipe: { startBps: 500, seconds: 120 },
  },
  {
    id: 'steady',
    title: 'Steady Growth',
    tag: 'Low risk',
    description: 'Even liquidity across the whole curve for smoother, more predictable price discovery.',
    liquidityWeights: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    initialMarketCap: 1,
    migrationMarketCap: 10,
    feeBps: 50,
  },
  {
    id: 'rwa-steps',
    title: 'RWA / Stock Steps',
    tag: 'Price bands',
    description:
      'Deep liquidity inside price bands and near-zero liquidity between them, so price discovery happens in steps (useful for thinly traded or newly tokenized assets).',
    liquidityWeights: [0.05, 0.05, 5, 5, 5, 0.05, 0.05, 5, 5, 5, 0.05, 0.05, 5, 5, 5, 5],
    initialMarketCap: 1,
    migrationMarketCap: 10,
    feeBps: 25,
    antiSnipe: { startBps: 300, seconds: 600 },
  },
  {
    id: 'flat',
    title: 'Flat Band',
    tag: 'Fixed-ish price',
    description: 'Concentrated liquidity near the start price, then a sharp rise to graduation.',
    liquidityWeights: [40, 40, 20, 10, 5, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    initialMarketCap: 1,
    migrationMarketCap: 10,
    feeBps: 50,
  },
];

export const getPreset = (id: PresetId): Preset => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset: ${id}`);
  return p;
};

export interface LaunchOverrides {
  initialMarketCap?: number;
  migrationMarketCap?: number;
  feeBps?: number;
  liquidityWeights?: number[];
  /** Starting fee (bps) of the anti-sniper decay. Set equal to feeBps (or 0 seconds) to disable. */
  antiSnipeStartBps?: number;
  antiSnipeSeconds?: number;
}

/** Resolves the effective fee schedule for a preset + overrides. */
export function resolveFeeSchedule(presetId: PresetId, overrides: LaunchOverrides = {}) {
  const p = getPreset(presetId);
  const endBps = overrides.feeBps ?? p.feeBps;
  const startBps = overrides.antiSnipeStartBps ?? p.antiSnipe?.startBps ?? endBps;
  const seconds = overrides.antiSnipeSeconds ?? p.antiSnipe?.seconds ?? 0;
  const decaying = startBps > endBps && seconds > 0;
  // Total duration must be a multiple of the number of periods.
  const slotsPerPeriod = Math.max(1, Math.round((seconds * SLOTS_PER_SECOND) / FEE_DECAY_PERIODS));
  return {
    decaying,
    startBps: decaying ? startBps : endBps,
    endBps,
    periods: decaying ? FEE_DECAY_PERIODS : 0,
    totalSlots: decaying ? slotsPerPeriod * FEE_DECAY_PERIODS : 0,
  };
}

export const TOTAL_SUPPLY = 1_000_000_000;
const BASE_DECIMALS = TokenDecimal.SIX;

/** Builds the on-chain config parameters with the official SDK builder. */
export function buildConfig(
  presetId: PresetId,
  overrides: LaunchOverrides = {},
  quoteDecimals: number = SOL_QUOTE.decimals
): ConfigParameters {
  const p = getPreset(presetId);
  const fee = resolveFeeSchedule(presetId, overrides);
  const weights = overrides.liquidityWeights ?? p.liquidityWeights;
  if (weights.length !== 16) throw new Error('liquidityWeights must contain exactly 16 values');
  if (weights.some((w) => !(w > 0))) throw new Error('Every liquidity weight must be > 0 (the program rejects empty segments)');

  return buildCurveWithLiquidityWeights({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: BASE_DECIMALS,
      tokenQuoteDecimal: quoteDecimals,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: TOTAL_SUPPLY,
      leftover: 10_000_000,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: fee.startBps,
          endingFeeBps: fee.endBps,
          numberOfPeriod: fee.periods,
          totalDuration: fee.totalSlots,
        },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps200,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Enabled,
        poolFeeBps: 100,
      },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 100,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Slot,
    initialMarketCap: overrides.initialMarketCap ?? p.initialMarketCap,
    migrationMarketCap: overrides.migrationMarketCap ?? p.migrationMarketCap,
    liquidityWeights: weights,
  });
}

export interface CurvePoint {
  /** Percent of the sellable curve supply that has been bought (0-100). */
  supplyPct: number;
  /** Price of one token, in units of the quote token. */
  priceQuote: number;
}

export interface CurveSummary {
  points: CurvePoint[];
  startPrice: number;
  endPrice: number;
  /** Quote tokens that must be raised for the pool to graduate to DAMM v2. */
  graduationQuote: number;
}

/**
 * Samples price vs. supply from the REAL config curve (the same data the program uses).
 * Inside a segment liquidity is constant, so we interpolate sqrt price linearly and
 * compute the base amount sold with the SDK's own delta function.
 */
export function summarizeCurve(
  config: ConfigParameters,
  quoteDecimals: number = SOL_QUOTE.decimals,
  samplesPerSegment = 6
): CurveSummary {
  const segments = config.curve.filter((c) => !c.sqrtPrice.isZero());
  const raw: { base: BN; price: number }[] = [];
  let lower = config.sqrtStartPrice as BN;
  let cumBase = new BN(0);

  raw.push({ base: cumBase, price: priceOf(lower, quoteDecimals) });
  for (const seg of segments) {
    const upper = seg.sqrtPrice as BN;
    const range = upper.sub(lower);
    for (let i = 1; i <= samplesPerSegment; i++) {
      const sp = lower.add(range.muln(i).divn(samplesPerSegment));
      const base = getDeltaAmountBaseUnsigned(lower, sp, seg.liquidity, Rounding.Up);
      raw.push({ base: cumBase.add(base), price: priceOf(sp, quoteDecimals) });
    }
    cumBase = cumBase.add(getDeltaAmountBaseUnsigned(lower, upper, seg.liquidity, Rounding.Up));
    lower = upper;
  }

  const total = Math.max(Number(cumBase.toString()), 1);
  const points = raw.map((r) => ({
    supplyPct: (Number(r.base.toString()) / total) * 100,
    priceQuote: r.price,
  }));

  return {
    points,
    startPrice: points[0].priceQuote,
    endPrice: points[points.length - 1].priceQuote,
    graduationQuote: Number(config.migrationQuoteThreshold.toString()) / 10 ** quoteDecimals,
  };
}

function priceOf(sqrtPrice: BN, quoteDecimals: number): number {
  return getPriceFromSqrtPrice(sqrtPrice, BASE_DECIMALS, quoteDecimals).toNumber();
}

export interface ConfigTxInput {
  connection: Connection;
  wallet: PublicKey;
  presetId: PresetId;
  overrides?: LaunchOverrides;
  quote?: QuoteToken;
}

export interface BuiltTx {
  /** Unsigned by the wallet. Pass `signers` to wallet.sendTransaction(tx, connection, { signers }). */
  transaction: Transaction;
  signers: Keypair[];
}

/**
 * Step 1/2: create the DBC config account (curve, fees, migration to DAMM v2).
 * The config + pool cannot share one transaction: together they exceed Solana's 1232-byte
 * limit (config alone is ~980 bytes), so the launch is split in two transactions.
 * The wallet is the fee claimer and the leftover receiver.
 */
export async function buildConfigTx(
  input: ConfigTxInput
): Promise<BuiltTx & { config: PublicKey }> {
  const { connection, wallet, presetId, overrides, quote = SOL_QUOTE } = input;
  const configParams = buildConfig(presetId, overrides, quote.decimals);
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const configKeypair = Keypair.generate();

  const transaction = await client.partner.createConfig({
    ...configParams,
    config: configKeypair.publicKey,
    feeClaimer: wallet,
    leftoverReceiver: wallet,
    quoteMint: quote.mint,
    payer: wallet,
  });

  return { transaction, signers: [configKeypair], config: configKeypair.publicKey };
}

export interface PoolTxInput {
  connection: Connection;
  wallet: PublicKey;
  /** The config created in step 1. It must already be confirmed on-chain. */
  config: PublicKey;
  name: string;
  symbol: string;
  /** Metadata JSON URI. */
  uri: string;
}

/** Step 2/2: create the token mint and the virtual pool from the confirmed config. */
export async function buildPoolTx(
  input: PoolTxInput
): Promise<BuiltTx & { baseMint: PublicKey }> {
  const { connection, wallet, config, name, symbol, uri } = input;
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const mintKeypair = Keypair.generate();

  const transaction = await client.creator.createPool({
    config,
    baseMint: mintKeypair.publicKey,
    name,
    symbol,
    uri,
    payer: wallet,
    poolCreator: wallet,
  });

  return { transaction, signers: [mintKeypair], baseMint: mintKeypair.publicKey };
}
