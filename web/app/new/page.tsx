"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { createMarket } from "@/lib/delphi";

const MAX_SOURCES = 3;

export default function NewMarketPage() {
  const router = useRouter();
  const { address, client, connect } = useWallet();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [sources, setSources] = useState([""]);
  const [criteria, setCriteria] = useState("");
  const [feePct, setFeePct] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const clean = options.map((o) => o.trim()).filter(Boolean);
  const cleanSources = sources.map((s) => s.trim()).filter(Boolean);
  const urlsOk =
    cleanSources.length >= 1 &&
    cleanSources.every((s) => /^https?:\/\/\S+/.test(s)) &&
    new Set(cleanSources).size === cleanSources.length;
  const fee = Number(feePct);
  const feeOk = isFinite(fee) && fee >= 0 && fee <= 5;
  const feeBps = Math.round((isFinite(fee) ? fee : 0) * 100);
  const ready = question.trim().length > 0 && clean.length >= 2 && urlsOk && criteria.trim().length > 0 && feeOk;

  function setOpt(i: number, v: string) {
    setOptions((prev) => prev.map((o, j) => (j === i ? v : o)));
  }
  function setSrc(i: number, v: string) {
    setSources((prev) => prev.map((s, j) => (j === i ? v : s)));
  }

  async function onCreate() {
    if (!client) return;
    setError(""); setBusy(true);
    try {
      await createMarket(client, question.trim(), clean, cleanSources, criteria.trim(), feeBps);
      router.push("/markets");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-xl px-5 py-28 text-center">
        <h1 className="display text-5xl">Create a market</h1>
        <p className="mt-5 text-body">Connect a wallet to open a market on any question.</p>
        <button onClick={() => connect().catch(() => {})} className="btn mt-8">Connect wallet</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <p className="eyebrow">New market</p>
      <h1 className="display text-5xl mt-3">Pose a question</h1>

      <div className="mt-10 space-y-8">
        <div>
          <label className="eyebrow">The question</label>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Which team wins the Q3 hackathon?" className="field mt-2 text-lg" />
        </div>

        <div>
          <label className="eyebrow">Options (2 or more)</label>
          <div className="mt-3 space-y-3">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="mono text-muted text-xs w-4">{i}</span>
                <input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} className="field" />
                {options.length > 2 && (
                  <button onClick={() => setOptions((p) => p.filter((_, j) => j !== i))} className="mono text-muted hover:text-ink text-xs" aria-label="remove">✕</button>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button onClick={() => setOptions((p) => [...p, ""])} className="mono text-[0.65rem] uppercase tracking-[0.18em] text-muted hover:text-ink mt-3">+ add option</button>
          )}
        </div>

        <div>
          <label className="eyebrow">Resolution sources (1–{MAX_SOURCES} URLs, pinned forever)</label>
          <div className="mt-3 space-y-3">
            {sources.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="mono text-muted text-xs w-4">{i + 1}</span>
                <input value={s} onChange={(e) => setSrc(i, e.target.value)} placeholder="https://… a public, anonymously-fetchable page" className="field mono text-sm" />
                {sources.length > 1 && (
                  <button onClick={() => setSources((p) => p.filter((_, j) => j !== i))} className="mono text-muted hover:text-ink text-xs" aria-label="remove source">✕</button>
                )}
              </div>
            ))}
          </div>
          {sources.length < MAX_SOURCES && (
            <button onClick={() => setSources((p) => [...p, ""])} className="mono text-[0.65rem] uppercase tracking-[0.18em] text-muted hover:text-ink mt-3">+ add a corroborating source</button>
          )}
          <p className="mt-2 text-muted text-sm">
            These URLs are <span className="text-ink">frozen the moment the market is created</span> — nobody, you included,
            can swap the evidence after money is staked. The AI reads all of them and they must corroborate. Prefer stable,
            anonymously-fetchable pages (Wikipedia, official results, keyless JSON APIs); login-walled or bot-blocked pages
            (X, Discord, many explorers) can&apos;t be read and will push the market toward refunds. A second source keeps
            one dead link from sinking the resolution.
          </p>
        </div>

        <div>
          <label className="eyebrow">How it resolves</label>
          <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={3} placeholder="Resolves to the option named as the winner on the results page." className="field mt-2 resize-y" />
        </div>

        <div>
          <label className="eyebrow">Creator fee (optional, 0–5%)</label>
          <div className="flex items-center gap-2 mt-2 max-w-[10rem]">
            <input value={feePct} onChange={(e) => setFeePct(e.target.value)} inputMode="decimal" className="field mono" />
            <span className="mono text-muted">%</span>
          </div>
          <p className="mt-2 text-muted text-sm">Skimmed from winners&apos; payouts and paid to you when the market settles.</p>
        </div>

        <div className="pt-2">
          <button onClick={onCreate} disabled={!ready || busy} className="btn">
            {busy ? "Creating…" : "Create market"}
          </button>
          {!ready && <p className="mono text-xs text-muted mt-3">Need a question, 2+ options, 1–3 valid unique source URLs, and criteria.</p>}
          {error && <p className="mt-4 text-sm text-warning break-words">{error}</p>}
        </div>
      </div>
    </div>
  );
}
