import { useEffect, useState } from 'react';
import { fetchPulse, measureSlotTime, type NetworkPulse as Pulse } from '../lib/chain';
import { fmtInt, fmtMs } from '../lib/format';
import { Meter } from './Charts';

/**
 * Live chain state. Deliberately requires no wallet: anyone opening the app sees
 * real Cookie Chain data immediately.
 */
export function NetworkPulse() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [slotMs, setSlotMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const p = await fetchPulse();
        if (alive) {
          setPulse(p);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to reach the Cookie Chain RPC.');
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void measureSlotTime(3, 2000)
      .then((ms) => alive && setSlotMs(ms))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <section className="card error-card">
        <h2>Network pulse</h2>
        <p className="error">{error}</p>
        <p className="muted small">Retrying every 3 seconds.</p>
      </section>
    );
  }

  if (!pulse) {
    return (
      <section className="card">
        <h2>Network pulse</h2>
        <p className="muted">Connecting to rpc.cookiescan.io…</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Network pulse</h2>
        <span className="live">live</span>
      </div>
      <div className="grid stats">
        <Stat label="Slot" value={fmtInt(pulse.slot)} />
        <Stat label="Block height" value={fmtInt(pulse.blockHeight)} />
        <Stat label="Epoch" value={String(pulse.epoch)} />
        <Stat label="Validators" value={String(pulse.validators)} />
        <Stat
          label="Measured slot time"
          value={slotMs === null ? 'measuring…' : fmtMs(slotMs)}
          hint="Sampled live from this browser"
        />
        <Stat label="Agave version" value={pulse.solanaCore} />
        <Stat
          label="Total transactions"
          value={pulse.transactionCount === null ? '—' : fmtInt(pulse.transactionCount)}
        />
        <Stat label="COOK supply" value={`${fmtInt(Math.round(pulse.supplyCook))} COOK`} />
      </div>
      <div className="epoch">
        <div className="row-between small muted">
          <span>Epoch {pulse.epoch} progress</span>
          <span>
            {fmtInt(pulse.slotIndex)} / {fmtInt(pulse.slotsInEpoch)} slots
          </span>
        </div>
        <Meter value={pulse.slotIndex} max={pulse.slotsInEpoch} />
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}
