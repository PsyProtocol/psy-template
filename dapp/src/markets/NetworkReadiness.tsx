import { useEffect, useRef, useState } from "react";
import {
  readinessPresentation,
  validateReadiness,
  type Readiness,
} from "../../../market-client/readiness.mjs";
import registry from "../../../market-client/reviewed/staging-qa-20261026-account-v2/registry.json";
import pin from "../../../market-client/reviewed/staging-qa-20261026-account-v2/client-pin.json";
import { Icon } from "./icons";
export function NetworkReadiness() {
  const [state, setState] = useState<Readiness | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [clock, setClock] = useState(Date.now());
  const active = useRef(true),
    pending = useRef(false),
    generation = useRef(0);
  const check = async () => {
    if (pending.current) return;
    pending.current = true;
    const token = ++generation.current;
    setBusy(true);
    setError("");
    setState(null);
    try {
      const response = await fetch("/api/markets/v1/readiness", {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      const body = await response.text();
      if (!response.ok || body.length > 16384)
        throw Error("Network status could not be loaded. Try checking again.");
      const result = validateReadiness(
        JSON.parse(body),
        registry,
        pin.registrySha256,
      );
      if (active.current && token === generation.current) {
        setState(result);
        setClock(Date.now());
      }
    } catch {
      if (active.current && token === generation.current)
        setError(
          "Network status could not be validated. Trading remains disabled.",
        );
    } finally {
      if (token === generation.current) {
        pending.current = false;
        if (active.current) setBusy(false);
      }
    }
  };
  useEffect(() => {
    active.current = true;
    void check();
    return () => {
      active.current = false;
      generation.current++;
      pending.current = false;
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state]);
  const expired =
    state && (clock < state.observedAt || clock - state.observedAt > 30000);
  const [title, description] = expired
    ? [
        "Network observation expired",
        "Refresh to read the current network status. Trading remains disabled.",
      ]
    : readinessPresentation(state?.state);
  return (
    <section
      className="chain-readiness"
      aria-label="Live network status"
      aria-busy={busy}
    >
      <div className="chain-readiness-heading">
        <Icon name="network" size={20} />
        <div>
          <p className="eyebrow">LIVE NETWORK STATUS · READ-ONLY</p>
          <h2>
            {busy
              ? "Checking Psy testnet…"
              : error
                ? "Connection not verified"
                : title}
          </h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void check()}
        >
          {busy ? "Checking…" : "Refresh network status"}
        </button>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true">
        {error ||
          (busy
            ? "Reading the configured network. No transaction will be submitted."
            : description)}
      </p>
      {state && (
        <div className="chain-readiness-meta">
          <span>
            {state.checkpoint === null
              ? "RPC not reachable"
              : `Observed checkpoint ${state.checkpoint}`}
          </span>
          <span>Trading disabled</span>
          <span>
            Observed {new Date(state.observedAt).toISOString().slice(11, 19)}{" "}
            UTC
          </span>
          <span>RPC observation · not a state proof</span>
        </div>
      )}
      {state?.chainRoot && (
        <details>
          <summary>Observed network identity</summary>
          <dl>
            <dt>Checkpoint-one chain root</dt>
            <dd>{state.chainRoot}</dd>
            <dt>Native code root</dt>
            <dd>{state.nativeCodeRoot}</dd>
            <dt>Required deployment checks</dt>
            <dd>{state.issues.join(" ")}</dd>
          </dl>
        </details>
      )}
    </section>
  );
}
