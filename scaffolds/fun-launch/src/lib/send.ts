import type { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';

type SendFn = (
  tx: Transaction,
  connection: Connection,
  options?: { signers?: Keypair[] }
) => Promise<string>;

class SimulationError extends Error {}

export interface SendOptions {
  connection: Connection;
  wallet: PublicKey;
  tx: Transaction;
  /** Extra keypairs that must co-sign (new config, mint, position NFTs...). */
  signers: Keypair[];
  sendTransaction: SendFn;
  /** Refuse early (with a clear message) when the wallet holds less than this many lamports. */
  minLamports?: number;
}

/**
 * Sends a transaction through the wallet, but first:
 *  1. checks the SOL balance (optional), and
 *  2. simulates it on our own RPC, so a real program error is shown instead of the wallet's
 *     generic "Unexpected error".
 * Returns the confirmed signature.
 */
export async function sendWithPreflight(opts: SendOptions): Promise<string> {
  const { connection, wallet, tx, signers, sendTransaction, minLamports = 0 } = opts;

  if (minLamports > 0) {
    const balance = await connection.getBalance(wallet);
    if (balance < minLamports) {
      throw new Error(
        `Not enough SOL in this wallet: ${(balance / 1e9).toFixed(4)} SOL, and at least ${(minLamports / 1e9).toFixed(3)} SOL is needed. On devnet, get free SOL from a faucet.`
      );
    }
  }

  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = wallet;
  tx.recentBlockhash = latest.blockhash;

  try {
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      const tail = (sim.value.logs ?? []).slice(-3).join(' | ');
      throw new SimulationError(`The transaction would fail: ${JSON.stringify(sim.value.err)}. ${tail}`);
    }
  } catch (e) {
    // A failed simulation is a real answer. An RPC hiccup is not: let the wallet try anyway.
    if (e instanceof SimulationError) throw e;
  }

  const signature = await sendTransaction(tx, connection, { signers });
  const status = await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    'confirmed'
  );
  if (status.value.err) throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
  return signature;
}

/** Turns wallet and RPC errors into messages a person can act on. */
export function explainError(e: unknown): string {
  const err = e as { message?: string; error?: { message?: string } } | null;
  const inner = err?.error?.message;
  const msg = inner || err?.message || 'The transaction failed.';
  if (/reject|denied|declined|cancel/i.test(msg)) return 'You rejected the request in your wallet.';
  if (/^unexpected error$/i.test(msg.trim())) {
    return 'The wallet could not process the transaction (it only said "Unexpected error"). Check that Phantom is set to Solana Devnet (Settings, Developer Settings, Testnet Mode, Solana Devnet), that this wallet has devnet SOL, and then try again.';
  }
  return msg;
}
