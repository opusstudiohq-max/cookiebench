#!/usr/bin/env node
/**
 * Validates the exact Memo transaction CookieBench builds, without spending anything.
 *
 * The app's write path needs a funded wallet to run for real, so this script proves
 * the part that does not need funds: that the instruction CookieBench encodes is
 * well-formed and that the Memo program actually executes it on Cookie Chain.
 *
 * It does that with `simulateTransaction` and `sigVerify: false`, using an existing
 * funded account as fee payer. Nothing is signed, nothing is broadcast, no balance
 * changes. Run with `npm run verify:memo`.
 */
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

const RPC = process.env.COOKIE_RPC ?? 'https://rpc.cookiescan.io';
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Cookie Jar community vault — a known funded account, used read-only as a stand-in
// fee payer so simulation has a fundable payer. It is never signed for or debited.
const FEE_PAYER = new PublicKey('568tU9FMksJDxjkLBjWisSA4J4C5uPH87NCCkyREwrxe');

// Mirrors src/lib/bench.ts exactly.
const buildMemoTx = (payer, text) =>
  new Transaction().add(
    new TransactionInstruction({
      keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(text, 'utf8'),
    }),
  );

const CASES = [
  ['probe', 'cookiebench:v1 probe n=1'],
  ['scorecard', 'cookiebench:v1 score runs=5 p50=412 p95=530 best=388 fee=5000'],
];

let failures = 0;

async function main() {
  console.log(`\nCookieBench — memo transaction verification\nRPC: ${RPC}\n`);
  const connection = new Connection(RPC, 'confirmed');

  const balance = await connection.getBalance(FEE_PAYER, 'confirmed');
  console.log(`Fee payer ${FEE_PAYER.toBase58()}`);
  console.log(`  balance ${(balance / 1e9).toLocaleString('en-US')} COOK (read-only)\n`);

  for (const [label, memo] of CASES) {
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    const tx = buildMemoTx(FEE_PAYER, memo);
    tx.recentBlockhash = blockhash;
    tx.feePayer = FEE_PAYER;

    // Round-trip through the wire format the wallet would sign.
    const wire = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const rebuilt = Transaction.from(wire);

    const sim = await connection.simulateTransaction(rebuilt, undefined, false);
    const logs = sim.value.logs ?? [];
    const executed = logs.some((l) => l.includes(MEMO_PROGRAM_ID.toBase58()) && l.includes('success'));
    const echoed = logs.some((l) => l.includes(memo));

    console.log(`${label}: "${memo}"`);
    console.log(`  serialized        ${wire.length} bytes`);
    console.log(`  simulation error  ${sim.value.err === null ? 'none' : JSON.stringify(sim.value.err)}`);
    console.log(`  memo program ran  ${executed ? 'yes' : 'no'}`);
    console.log(`  memo text echoed  ${echoed ? 'yes' : 'no'}`);
    for (const l of logs) console.log(`    | ${l}`);

    if (sim.value.err !== null || !executed || !echoed) {
      failures += 1;
      console.log('  RESULT: FAIL\n');
    } else {
      console.log('  RESULT: pass\n');
    }
  }

  console.log(
    failures === 0
      ? 'Both transaction shapes execute cleanly against Cookie Chain.\n'
      : `${failures} case(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nVerification aborted: ${err.message}\n`);
  process.exit(1);
});
