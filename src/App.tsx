import { useCallback, useEffect, useState } from 'react';
import { NetworkPulse } from './components/NetworkPulse';
import { FinalityLab } from './components/FinalityLab';
import { FinalityObserver } from './components/FinalityObserver';
import { Scoreboard } from './components/Scoreboard';
import { detectWallets, onWalletsChanged, type DetectedWallet } from './lib/wallet';
import { RPC_URL } from './lib/chain';

export default function App() {
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);

  const rescan = useCallback(() => setWallets(detectWallets()), []);

  useEffect(() => {
    rescan();
    // Extensions register asynchronously, so listen instead of scanning once.
    const off = onWalletsChanged(rescan);
    const t = setTimeout(rescan, 800);
    return () => {
      off();
      clearTimeout(t);
    };
  }, [rescan]);

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-mark" aria-hidden="true">
          🍪
        </div>
        <h1>CookieBench</h1>
        <p className="tagline">
          Cookie Chain says sub-second finality. This measures what that actually means — from
          your browser, with real transactions you can verify on-chain.
        </p>
        <p className="muted small">
          RPC <code>{RPC_URL}</code>
        </p>
      </header>

      <main>
        <NetworkPulse />
        <FinalityObserver />
        <FinalityLab wallets={wallets} onRefreshWallets={rescan} />
        <Scoreboard />

        <section className="card method">
          <h2>How the measurement works</h2>
          <ol>
            <li>
              A fresh <code>finalized</code> blockhash is fetched, and a Memo instruction is built
              with your address as the signer.
            </li>
            <li>
              Your wallet signs but does <strong>not</strong> broadcast. Using
              <code> signAndSendTransaction</code> would hand submission to the wallet&rsquo;s own RPC,
              so the clock would start at an unknown moment against an unknown endpoint.
            </li>
            <li>
              The clock starts immediately before <code>sendRawTransaction</code> against
              <code> rpc.cookiescan.io</code>. Every milestone below is measured from that instant, so
              the numbers are what a user actually waits.
            </li>
            <li>
              <code>getSignatureStatuses</code> is polled adaptively: every 50&nbsp;ms while
              confirmation is pending, then every 500&nbsp;ms while waiting out finalization.
              Polling the second phase at 50&nbsp;ms would issue hundreds of pointless calls.
            </li>
            <li>
              The real fee is read back from the finalized transaction&rsquo;s metadata — not
              estimated.
            </li>
          </ol>
          <p className="muted small">
            <strong>Confirmation and finalization are different claims.</strong> Confirmation is
            sub-second and is what a user waits for. Finalization waits the ~32-slot consensus
            depth, so it takes seconds. Any tool reporting a single &ldquo;finality&rdquo; number is
            hiding one of the two.
          </p>
          <p className="muted small">
            <strong>Reading the numbers.</strong> Latency includes your network round-trip to the RPC,
            which is why <em>submit</em> is reported separately: subtract it for closer to pure chain
            time. Results depend on your distance to the validator, so treat them as a real-world
            measurement from where you are sitting, not a lab benchmark.
          </p>
        </section>
      </main>

      <footer>
        <p className="muted small">
          Open source ·{' '}
          <a
            href="https://github.com/opusstudiohq-max/cookiebench"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>{' '}
          · Built for Cookie Chain ·{' '}
          <a href="https://cookiescan.io" target="_blank" rel="noreferrer">
            Explorer
          </a>{' '}
          ·{' '}
          <a href="https://docs.cookiechain.wtf" target="_blank" rel="noreferrer">
            Docs
          </a>
        </p>
        <p className="muted small">
          CookieBench never holds funds and never asks for a private key. It builds one Memo
          transaction at a time and asks your wallet to sign it.
        </p>
      </footer>
    </div>
  );
}
