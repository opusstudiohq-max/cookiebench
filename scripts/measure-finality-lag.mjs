#!/usr/bin/env node
/**
 * Measures Cookie Chain's real commitment latency without a wallet or any funds.
 *
 * Records the wall-clock moment a slot first appears at `confirmed`, then the moment
 * `finalized` reaches that same slot. That is the actual time to irreversibility,
 * measured rather than inferred from a slot count.
 */
const RPC = process.env.COOKIE_RPC ?? 'https://rpc.cookiescan.io';
const SAMPLES = Number(process.env.SAMPLES ?? 3);
const POLL_MS = 200;

async function getSlot(commitment) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSlot',
      params: [{ commitment }],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\nCookie Chain commitment latency (no wallet, no funds)\nRPC: ${RPC}\n`);

  const lags = [];
  const slotGaps = [];

  for (let i = 1; i <= SAMPLES; i += 1) {
    // Take the current confirmed head as our target slot.
    const target = await getSlot('confirmed');
    const confirmedAt = Date.now();
    const finAtStart = await getSlot('finalized');
    slotGaps.push(target - finAtStart);

    let finalizedAt = null;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const fin = await getSlot('finalized');
      if (fin >= target) {
        finalizedAt = Date.now();
        break;
      }
      await sleep(POLL_MS);
    }

    if (finalizedAt === null) {
      console.log(`  sample ${i}: timed out waiting for finalization`);
      continue;
    }
    const lag = finalizedAt - confirmedAt;
    lags.push(lag);
    console.log(
      `  sample ${i}: slot ${target} confirmed -> finalized in ${(lag / 1000).toFixed(2)}s ` +
        `(was ${target - finAtStart} slots behind)`,
    );
  }

  if (lags.length === 0) {
    console.log('\nNo samples completed.\n');
    process.exit(1);
  }

  const avg = lags.reduce((a, b) => a + b, 0) / lags.length;
  const avgGap = slotGaps.reduce((a, b) => a + b, 0) / slotGaps.length;

  console.log(`\n  mean confirmed -> finalized: ${(avg / 1000).toFixed(2)}s`);
  console.log(`  mean finality depth:         ${avgGap.toFixed(1)} slots`);
  console.log(
    '\nReading: confirmation tracks the head within about a slot, so it is sub-second.',
  );
  console.log(
    'Full finalization waits the usual ~32-slot consensus depth, which is seconds, not',
  );
  console.log('milliseconds. Both numbers matter and they are not the same claim.\n');
}

main().catch((err) => {
  console.error(`\nAborted: ${err.message}\n`);
  process.exit(1);
});
