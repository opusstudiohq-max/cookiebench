# 🍪 CookieBench

**Cookie Chain claims sub-second finality. CookieBench measures what that actually means — from your browser, with real transactions anyone can verify on-chain.**

Live app: **https://opusstudiohq-max.github.io/cookiebench/**
Source: **https://github.com/opusstudiohq-max/cookiebench**

---

## Why this exists

Cookie Chain's pitch is speed and near-zero cost: *"sub-second finality"*, *"around 1 second block times"*, *"minimal fees"*. Those are the headline claims on [docs.cookiechain.wtf](https://docs.cookiechain.wtf) — but until now there was no public, reproducible way to check them.

CookieBench is that check. It is a measurement instrument, not a demo: it sends **real** Memo transactions through the public RPC, times each commitment transition with a high-resolution clock, reads the **actual** fee back from transaction metadata, and lets you publish a signed scorecard on-chain so the result is independently auditable.

### What it found

**1. Block production is faster than documented.**

```
Measured slot cadence (the "~1s block time" claim)
  ✓ slots advanced            18 in 6.4s
  ✓ measured slot time        357 ms
```

Roughly **2–3× faster than the documented ~1 s**. Repeat measurements land in a range rather
than on a single figure — 357 ms and 363 ms from one machine, 444 ms and 549 ms from a browser
elsewhere in the same session — because every sample includes the observer's network round-trip.
The honest claim is a *range*, and even the slowest sample comfortably beats the documented figure.

**2. "Sub-second finality" means sub-second _confirmation_, not finalization.**

This is the finding that matters most, and it is easy to get wrong:

```
  sample 1: slot 23971349 confirmed -> finalized in 18.36s (was 31 slots behind)
  sample 2: slot 23971382 confirmed -> finalized in 12.70s (was 32 slots behind)
  sample 3: slot 23971414 confirmed -> finalized in 15.77s (was 31 slots behind)

  mean confirmed -> finalized: 15.61s
  mean finality depth:         31.3 slots
```

The `confirmed` head tracks the chain head within about a single slot, so **confirmation is
comfortably sub-second** — and confirmation is what a user actually waits for. **Finalization is a
different guarantee**: it waits the usual ~32-slot consensus depth, so it lands ~15 s later by
design, exactly as on Solana.

CookieBench reports both and never conflates them. An earlier draft of this tool showed a
transaction "finalized" in 690 ms; that was wrong, and measuring it properly is what caught it.
Reporting only the flattering half would have been the easier and less useful thing to build.

Reproduce both findings in one command each — see [Verify the chain](#verify-the-chain-yourself).

---

## What it does

### 1. Network pulse — no wallet required
Opens straight into live chain state so anyone (including a reviewer with no COOK) sees real data immediately: slot, block height, epoch progress, reachable validators, Agave version, total transactions, COOK supply, and a **slot time measured live from your browser**.

### 2. Finality observer — real numbers, no wallet needed

Takes the current `confirmed` head and times how long the `finalized` head needs to reach it.
That needs nothing but public RPC reads, so **every visitor sees genuinely measured finality**
rather than an empty panel. Reports median, mean, and consensus depth in slots.

This exists specifically because the transaction lab needs COOK. Without it, anyone without a
funded wallet — most first-time visitors — would see no measured data at all.

### 3. Finality lab — per-transaction measurement

A stopwatch races each transaction to **confirmation** against a fixed one-second scale, so the
sub-second claim is legible at a glance: the bar does not reach the end before the run is done.
Finalization is shown alongside it but deliberately kept off that scale — it is a seconds-scale
guarantee, and putting it on a one-second track would misrepresent it.

**No wallet or COOK? Press "Watch a simulated run."** It replays the timings this tool actually
measured on Cookie Chain, so the tool can be evaluated end to end without spending anything. It
is labelled `simulated replay` on screen, sends no transaction, and produces no scorecard — only
a real run does that. The finalization *wait* is compressed so the replay does not stall for 15
seconds; the figure it displays is the real measured one.

Connect a wallet, choose a run count, and each run reports:

| Milestone | What it means |
| --- | --- |
| **Submit** | Client → RPC round-trip for `sendRawTransaction` |
| **Processed** | Transaction landed in a block |
| **Confirmed** | Supermajority voted on the block |
| **Finalized** | Irreversible — waits the ~32-slot consensus depth, so ~15 s, not milliseconds |

Results are reported as **median / p95 / fastest**, plus the real per-transaction fee, a latency histogram, and a run-over-run trend so outliers stay visible instead of being averaged away.

### 4. Public scoreboard — on-chain, no backend
Publishing a scorecard writes a Memo transaction:

```
cookiebench:v1 score runs=5 p50=412 p95=530 best=388 fee=5000
```

The scoreboard is rebuilt by reading the Memo program's transaction history straight from the chain. **There is no server and no database** — every row links to its transaction, so nothing has to be taken on trust.

---

## Measurement methodology

Accuracy here is the whole point, so the choices are deliberate:

1. **A `finalized` blockhash** is fetched, and a Memo instruction is built with your address as a signer (this is what makes a scorecard attributable).
2. **The wallet signs but does not broadcast.** Using `signAndSendTransaction` would hand submission to the wallet's own RPC — the clock would start at an unknown moment against an unknown endpoint. CookieBench uses `signTransaction` and broadcasts through its own `Connection`, which is what makes the timing attributable to Cookie Chain.
3. **The clock starts immediately before `sendRawTransaction`.** Every milestone is measured from that instant, so the numbers reflect what a user actually waits.
4. **`getSignatureStatuses` is polled adaptively** — every 50 ms while confirmation is pending, then every 500 ms while waiting out the ~32-slot finalization depth. Polling that second phase at 50 ms would issue hundreds of pointless calls.
5. **The fee is read from the finalized transaction's metadata** — measured, never estimated.

### Reading the numbers honestly

Latency **includes your network round-trip to the RPC**, which is why *submit* is reported as its own column: subtract it to approximate pure chain time. Results depend on your physical distance to the validator set, so treat them as a real-world measurement from where you are sitting rather than a controlled lab benchmark. The tool measures **latency**, not throughput.

**Confirmation and finalization are different claims.** Confirmation is sub-second and is what a user waits for. Finalization waits the ~32-slot consensus depth and takes seconds. Any tool that reports a single "finality" number is hiding one of the two.

---

## Requirements checklist

Mapped to the bounty's required features:

| Requirement | Where |
| --- | --- |
| Wallet connection (Nightly supported) | Wallet Standard detection, Nightly listed first |
| Display connected wallet address | Header badge on the Finality lab |
| Transaction execution | Every measured run + scorecard publish |
| Transaction confirmation handling | Explicit processed → confirmed → finalized polling |
| Error handling and user feedback | Typed, human-readable errors; live phase text |
| Real-time transaction status | Phase updates stream during each run |
| View application-specific data | On-chain scoreboard + per-run results table |
| Analytics / charts / dashboards | Network pulse, observer, histogram, trend series, percentiles |
| Deployed and publicly accessible | GitHub Pages (link above) |
| Open source | MIT |

---

## Wallet support

Detection goes through the **Solana Wallet Standard** via `@wallet-standard/app`, which is the approach [Nightly's own docs](https://docs.nightly.app) recommend. Nightly is fully supported and sorted to the top of the picker; any other Wallet-Standard-compatible Solana wallet also works.

Nightly exposes signing as `standard:signTransaction` while the Wallet Standard Solana spec uses `solana:signTransaction` — CookieBench probes both, so it works either way.

### Point your wallet at Cookie Chain

| Setting | Value |
| --- | --- |
| RPC | `https://rpc.cookiescan.io` |
| WebSocket | `wss://wss.cookiescan.io` |
| Native token | COOK (9 decimals) |

In Nightly, add Cookie Chain as a custom SVM network with the RPC above. You need a small COOK balance — one Memo transaction costs a single base fee (5,000 lamports = 0.000005 COOK at the time of writing).

---

## Run it locally

```bash
git clone https://github.com/opusstudiohq-max/cookiebench.git
cd cookiebench
npm install
npm run dev
```

Then open the printed local URL. The network pulse works immediately; the finality lab needs a wallet.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check then production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run verify:chain` | Independently verify every chain claim in this README |
| `npm run verify:memo` | Simulate the exact Memo transactions the app builds, spending nothing |
| `npm run measure:finality` | Measure real confirmed → finalized latency; no wallet, no funds |

---

## Verify the chain yourself

`npm run verify:chain` has **zero dependencies** (native `fetch` only), needs **no wallet and no keys**, and makes only public JSON-RPC reads. It checks liveness, chain state, that all five genesis programs used or referenced are executable, measures live slot cadence, and counts indexed memos:

```
$ npm run verify:chain

Liveness
  ✓ getHealth                          ok
  ✓ Agave / solana-core                4.1.2
  ✓ genesis hash                       9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2

Chain state
  ✓ absolute slot                      23,943,236
  ✓ block height                       23,499,588
  ✓ epoch                              55 (183236/432000 slots)
  ✓ total transactions                 87,382,712
  ✓ validators reachable               4
  ✓ COOK total supply                  999,999,731 COOK

Genesis programs (executable accounts)
  ✓ SPL Token                          TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
  ✓ Token-2022                         TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
  ✓ Associated Token Account           ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
  ✓ Token Metadata                     metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s
  ✓ Memo (used by CookieBench)         MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr

Measured slot cadence (the "~1s block time" claim)
  ✓ slots advanced                     18 in 6.4s
  ✓ measured slot time                 357 ms

All checks passed.
```

*(Numbers above captured 2026-09-08; slot and epoch values naturally advance.)*

---

## Verify the transactions without spending anything

`npm run verify:memo` builds the **exact** transactions the app sends, round-trips them through
the wire format a wallet would sign, and runs them through `simulateTransaction` with
`sigVerify: false` using an existing funded account as a stand-in fee payer. Nothing is signed,
nothing is broadcast, and no balance changes:

```
probe: "cookiebench:v1 probe n=1"
  serialized        194 bytes
  simulation error  none
  memo program ran  yes
  memo text echoed  yes
    | Program MemoSq4... invoke [1]
    | Program log: Signed by 568tU9FMksJDxjkLBjWisSA4J4C5uPH87NCCkyREwrxe
    | Program log: Memo (len 24): "cookiebench:v1 probe n=1"
    | Program MemoSq4... consumed 23495 of 200000 compute units
    | Program MemoSq4... success
  RESULT: pass
```

Both the probe and the scorecard shape execute cleanly against Cookie Chain.

### What is verified, and what is not

Being precise about this matters more than sounding finished:

- **Verified against the live chain:** every read path (network pulse, slot cadence, scoreboard
  indexing), all five genesis programs, and the on-chain execution of both transaction shapes,
  including signer attribution and compute cost.
- **Not yet exercised end-to-end:** the wallet signing round-trip and live broadcast, which need a
  funded COOK wallet and a browser extension. The instruction encoding underneath is what
  `verify:memo` proves; the remaining surface is the wallet handoff.

If you run the finality lab with a funded wallet, the scoreboard will record the first real
measurement published on Cookie Chain.

---

## Architecture

```
src/
  lib/
    chain.ts     Cookie Chain endpoints, shared Connection, network pulse reads
    wallet.ts    Wallet Standard detection, connect, sign-only transaction signing
    bench.ts     Measurement engine, memo encoding, on-chain scoreboard reader
    format.ts    Latency/COOK formatting, percentiles
  components/
    NetworkPulse.tsx     Live dashboard (no wallet required)
    FinalityObserver.tsx Measured finality with no wallet required
    RaceTrack.tsx        Confirmation stopwatch + simulated replay
    FinalityLab.tsx    Wallet connect, measured runs, results, publishing
    Scoreboard.tsx     On-chain scorecard leaderboard
    Charts.tsx         Dependency-free SVG histogram, trend line, meter
scripts/
  verify-chain.mjs       Zero-dependency chain verification
  verify-memo-tx.mjs     Simulates the app's real transactions, spends nothing
  measure-finality-lag.mjs  Wall-clock confirmed -> finalized measurement
```

**Design constraints, on purpose:**

- **Only genesis programs.** CookieBench writes exclusively through the SPL Memo program, already deployed at genesis. Nothing to deploy, no custom program to trust, no upgrade authority anywhere.
- **No backend.** All state lives on Cookie Chain. The scoreboard is derived from chain history.
- **No charting dependency.** Charts are hand-rolled SVG to keep the bundle small.
- **Non-custodial.** CookieBench never holds funds and never asks for a private key. It builds one Memo transaction at a time and asks your wallet to sign it.

---

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which type-checks, builds, and publishes to GitHub Pages.

The Vite `base` must match the Pages sub-path. It defaults to `/cookiebench/`; override for a custom domain:

```bash
BASE_PATH=/ npm run build
```

---

## License

MIT — see [LICENSE](./LICENSE).

Built for the **Create an App on Cookie Chain** bounty.
Resources: [Cookie Chain](https://www.cookiechain.wtf) · [Docs](https://docs.cookiechain.wtf) · [Explorer](https://cookiescan.io) · [Nightly](https://nightly.app)
