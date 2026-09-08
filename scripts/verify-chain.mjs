#!/usr/bin/env node
/**
 * Independently verifies the Cookie Chain facts CookieBench relies on.
 *
 * Run with `npm run verify:chain`. No dependencies, no wallet, no keys — it only
 * makes public JSON-RPC reads, so anyone can reproduce the claims in the README.
 */

const RPC = process.env.COOKIE_RPC ?? 'https://rpc.cookiescan.io';

const GENESIS_PROGRAMS = {
  'SPL Token': 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'Token-2022': 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  'Associated Token Account': 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'Token Metadata': 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  'Memo (used by CookieBench)': 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
};

let failures = 0;

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

function ok(label, value) {
  console.log(`  ✓ ${label.padEnd(34)} ${value}`);
}

function bad(label, reason) {
  failures += 1;
  console.log(`  ✗ ${label.padEnd(34)} ${reason}`);
}

async function main() {
  console.log(`\nCookieBench — chain verification\nRPC: ${RPC}\n`);

  console.log('Liveness');
  ok('getHealth', await rpc('getHealth'));
  const version = await rpc('getVersion');
  ok('Agave / solana-core', version['solana-core']);
  ok('genesis hash', await rpc('getGenesisHash'));

  console.log('\nChain state');
  const epoch = await rpc('getEpochInfo');
  ok('absolute slot', epoch.absoluteSlot.toLocaleString('en-US'));
  ok('block height', epoch.blockHeight.toLocaleString('en-US'));
  ok('epoch', `${epoch.epoch} (${epoch.slotIndex}/${epoch.slotsInEpoch} slots)`);
  if (typeof epoch.transactionCount === 'number') {
    ok('total transactions', epoch.transactionCount.toLocaleString('en-US'));
  }

  const nodes = await rpc('getClusterNodes');
  ok('validators reachable', String(nodes.length));

  const supply = await rpc('getSupply', [{ excludeNonCirculatingAccountsList: true }]);
  ok('COOK total supply', `${Math.round(supply.value.total / 1e9).toLocaleString('en-US')} COOK`);

  console.log('\nGenesis programs (executable accounts)');
  for (const [name, id] of Object.entries(GENESIS_PROGRAMS)) {
    const info = await rpc('getAccountInfo', [id, { encoding: 'base64' }]);
    if (info?.value?.executable) ok(name, id);
    else bad(name, `not executable at ${id}`);
  }

  console.log('\nMeasured slot cadence (the "~1s block time" claim)');
  const t0 = Date.now();
  const s0 = await rpc('getSlot');
  await new Promise((r) => setTimeout(r, 6000));
  const s1 = await rpc('getSlot');
  const elapsed = Date.now() - t0;
  const slots = s1 - s0;
  if (slots > 0) {
    ok('slots advanced', `${slots} in ${(elapsed / 1000).toFixed(1)}s`);
    ok('measured slot time', `${Math.round(elapsed / slots)} ms`);
  } else {
    bad('slot advance', 'chain did not advance during the sample window');
  }

  console.log('\nMemo indexing (backs the public scoreboard)');
  const sigs = await rpc('getSignaturesForAddress', [
    GENESIS_PROGRAMS['Memo (used by CookieBench)'],
    { limit: 1000 },
  ]);
  ok('memo transactions indexed', String(sigs.length));
  const scored = sigs.filter((s) => (s.memo ?? '').includes('cookiebench:v1 score'));
  ok('cookiebench scorecards found', String(scored.length));

  console.log(
    failures === 0
      ? '\nAll checks passed.\n'
      : `\n${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nVerification aborted: ${err.message}\n`);
  process.exit(1);
});
