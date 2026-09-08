import { getWallets } from '@wallet-standard/app';
import type { Transaction } from '@solana/web3.js';

/**
 * Minimal Wallet Standard client.
 *
 * Nightly implements the Solana Wallet Standard (docs.nightly.app), so detection
 * goes through the standard registry rather than a Nightly-specific global. That
 * keeps Nightly first-class — as the bounty requires — without locking other
 * Solana-compatible wallets out.
 *
 * Nightly exposes signing under `standard:signTransaction`, while the Wallet
 * Standard Solana spec uses `solana:signTransaction`. Both are probed.
 */

const CONNECT = 'standard:connect';
const DISCONNECT = 'standard:disconnect';
const SIGN_TX = ['solana:signTransaction', 'standard:signTransaction'] as const;
const SIGN_AND_SEND = ['solana:signAndSendTransaction', 'standard:signAndSendTransaction'] as const;

export interface StandardAccount {
  address: string;
  publicKey: Uint8Array;
}

interface FeatureMap {
  [name: string]: unknown;
}

export interface DetectedWallet {
  name: string;
  icon?: string;
  raw: {
    name: string;
    icon?: string;
    chains: readonly string[];
    features: FeatureMap;
    accounts: readonly StandardAccount[];
  };
}

function pickFeature(features: FeatureMap, names: readonly string[]): any | null {
  for (const n of names) {
    if (features[n]) return features[n];
  }
  return null;
}

/** Solana-capable wallets currently registered in the page. */
export function detectWallets(): DetectedWallet[] {
  const { get } = getWallets();
  return get()
    .filter((w: any) => {
      const chains: readonly string[] = w.chains ?? [];
      const hasSolanaChain = chains.some((c) => c.startsWith('solana:'));
      const hasSolanaSigning = Boolean(pickFeature(w.features ?? {}, SIGN_TX));
      return (hasSolanaChain || hasSolanaSigning) && Boolean(w.features?.[CONNECT]);
    })
    .map((w: any) => ({ name: w.name, icon: w.icon, raw: w }));
}

/** Nightly first, then everything else, so the recommended wallet leads the list. */
export function sortWallets(wallets: DetectedWallet[]): DetectedWallet[] {
  return [...wallets].sort((a, b) => {
    const an = a.name.toLowerCase().includes('nightly') ? 0 : 1;
    const bn = b.name.toLowerCase().includes('nightly') ? 0 : 1;
    return an - bn || a.name.localeCompare(b.name);
  });
}

export async function connectWallet(wallet: DetectedWallet): Promise<StandardAccount> {
  const feature: any = wallet.raw.features[CONNECT];
  if (!feature?.connect) throw new Error(`${wallet.name} does not support standard:connect`);
  const res = await feature.connect();
  const account: StandardAccount | undefined = res?.accounts?.[0] ?? wallet.raw.accounts?.[0];
  if (!account) throw new Error(`${wallet.name} returned no accounts. Unlock the wallet and retry.`);
  return account;
}

export async function disconnectWallet(wallet: DetectedWallet): Promise<void> {
  const feature: any = wallet.raw.features[DISCONNECT];
  if (feature?.disconnect) await feature.disconnect();
}

export function canSignOnly(wallet: DetectedWallet): boolean {
  return Boolean(pickFeature(wallet.raw.features, SIGN_TX));
}

/**
 * Sign without broadcasting.
 *
 * CookieBench never uses signAndSendTransaction for a measured run: that hands
 * submission to the wallet's own RPC, so the clock would start at an unknown
 * moment against an unknown endpoint. Signing locally and broadcasting through
 * our own Connection is what makes the timing attributable to Cookie Chain.
 */
export async function signTransaction(
  wallet: DetectedWallet,
  account: StandardAccount,
  tx: Transaction,
): Promise<Uint8Array> {
  const feature: any = pickFeature(wallet.raw.features, SIGN_TX);
  if (!feature?.signTransaction) {
    throw new Error(
      `${wallet.name} cannot sign without sending, so a measured run is not possible with it.`,
    );
  }
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const result = await feature.signTransaction({
    account,
    transaction: new Uint8Array(serialized),
  });
  const signed = Array.isArray(result) ? result[0] : result;
  const bytes: Uint8Array | undefined = signed?.signedTransaction ?? signed?.signedTransactionBytes;
  if (!bytes) throw new Error('Wallet returned no signed transaction bytes.');
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

export const hasSignAndSend = (wallet: DetectedWallet): boolean =>
  Boolean(pickFeature(wallet.raw.features, SIGN_AND_SEND));

/** Re-render when a wallet registers late (extensions inject asynchronously). */
export function onWalletsChanged(cb: () => void): () => void {
  const { on } = getWallets();
  const offRegister = on('register', cb);
  const offUnregister = on('unregister', cb);
  return () => {
    offRegister();
    offUnregister();
  };
}
