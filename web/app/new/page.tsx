"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { createMarket } from "@/lib/delphi";

export default function NewMarketPage() {
  const router = useRouter();
  const { address, client, connect } = useWallet();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [sourceUri, setSourceUri] = useState("");
  const [criteria, setCriteria] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const clean = options.map((o) => o.trim()).filter(Boolean);
  const urlOk = /^https?:\/\/\S+/.test(sourceUri.trim());
  const ready = question.trim().length > 0 && clean.length >= 2 && urlOk && criteria.trim().length > 0;

  function setOpt(i: number, v: string) {
    setOptions((prev) => prev.map((o, j) => (j === i ? v : o)));
  }

  async function onCreate() {
    if (!client) return;
    setError(""); setBusy(true);
    try {
      await createMarket(client, question.trim(), clean, sourceUri.trim(), criteria.trim());
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
          <label className="eyebrow">Resolution source (URL)</label>
          <input value={sourceUri} onChange={(e) => setSourceUri(e.target.value)} placeholder="https://… a public, anonymously-fetchable page" className="field mono mt-2 text-sm" />
          <p className="mt-2 text-muted text-sm">The AI fetches this page to decide. Pick a stable, public source — Wikipedia, official results, GitHub stats. Login-walled pages (X, Discord) can&apos;t be read.</p>
        </div>

        <div>
          <label className="eyebrow">How it resolves</label>
          <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={3} placeholder="Resolves to the option named as the winner on the results page." className="field mt-2 resize-y" />
        </div>

        <div className="pt-2">
          <button onClick={onCreate} disabled={!ready || busy} className="btn">
            {busy ? "Creating…" : "Create market"}
          </button>
          {!ready && <p className="mono text-xs text-muted mt-3">Need a question, 2+ options, a valid source URL, and criteria.</p>}
          {error && <p className="mt-4 text-sm text-warning break-words">{error}</p>}
        </div>
      </div>
    </div>
  );
}
