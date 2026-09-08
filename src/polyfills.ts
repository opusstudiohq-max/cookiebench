import { Buffer } from 'buffer';

// @solana/web3.js assumes a Node-style Buffer global. Vite does not provide one.
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
