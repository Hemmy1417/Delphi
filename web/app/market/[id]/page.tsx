"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { StatusBadge } from "@/components/StatusBadge";
import { explorerTxUrl } from "@/lib/config";
import {
  getMarket, getPositions, stake, closeMarket, resolve, claim,
  genFromWei, genToWei, impliedOdds, payoutMultiple, type Market, type Position,
} from "@/lib/delphi";

function short(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function MarketPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { address, client, connect } = useWallet();

  const [market, setMarket] = useState<Market | null>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const [amount, setAmount] = useState("");

  const load = useCallback(async () => {
    try {
      const m = await getMarket(id);
      setMarket(m);
      if (address) {
        const ps = await getPositions(address);
        setPos(ps.find((p) => p.market_id === id) ?? null);
      } else {
        setPos(null);
      }
    } catch {
      setMarket(null);
    } finally {
      setLoading(false);
    }
  }, [id, address]);

  useEffect(() => { load(); }, [load]);

  async function run(label: string, fn: () => Promise<string>) {
    if (!client) { connect().catch(() => {}); return; }
    setError(""); setTxHash(""); setBusy(label);
    try {
      setTxHash(await fn());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <p className="mx-auto max-w-3xl px-5 py-24 text-body flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-ink pulse-soft" /> Reading the contract…</p>;
  }
  if (!market) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <h1 className="display text-4xl">Market not found</h1>
        <Link href="/markets" className="btn mt-6">Back to markets</Link>
      </div>
    );
  }

  const m = market;
  const odds = impliedOdds(m.pools);
  const isCreator = !!address && address.toLowerCase() === m.creator.toLowerCase();
  const myStake = (opt: number) => pos?.stakes.find((s) => s.option === opt)?.amount ?? "0";
  const hasAnyStake = (pos?.stakes.length ?? 0) > 0;
  const wonOnWinner = m.status === "RESOLVED" && m.winning_option != null && Number(myStake(m.winning_option)) > 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/markets" className="eyebrow hover:text-ink">← Markets</Link>

      <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
        <span className="tag">{m.id}</span>
        <StatusBadge status={m.status} />
      </div>
      <h1 className="display text-4xl sm:text-5xl mt-3 leading-tight" style={{ textTransform: "none" }}>{m.question}</h1>
      <p className="mono text-xs text-muted mt-4">{genFromWei(m.total_pool)} GEN pooled · resolves from{" "}
        <a href={m.source_uri} target="_blank" rel="noreferrer" className="link">the source ↗</a>
      </p>
      <p className="mt-4 text-body"><span className="eyebrow">Criteria</span><br />{m.criteria}</p>

      {/* options + pools */}
      <div className="card mt-8">
        {m.options.map((o, i) => {
          const isWinner = m.winning_option === i;
          const mine = Number(myStake(i)) > 0;
          return (
            <div key={i} className={`p-5 ${i > 0 ? "border-t border-hairline" : ""} ${isWinner ? "bg-surface-soft" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="mono text-muted text-xs">{i}</span>
                  <span className="text-body-strong text-lg">{o}</span>
                  {isWinner && <span className="mono text-[0.6rem] uppercase tracking-[0.15em] text-success">winner</span>}
                  {mine && <span className="mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">· you {genFromWei(myStake(i))}</span>}
                </div>
                <div className="text-right">
                  <span className="mono text-sm text-ink">{odds[i]}%</span>
                  <span className="mono text-xs text-muted ml-3">{genFromWei(m.pools[i])} GEN</span>
                </div>
              </div>
              <div className="bar mt-3"><span style={{ width: `${odds[i]}%` }} /></div>
              {m.status === "OPEN" && (
                <button
                  onClick={() => setPick(i)}
                  className={`mt-3 mono text-[0.65rem] uppercase tracking-[0.18em] ${pick === i ? "text-ink" : "text-muted hover:text-ink"}`}
                >
                  {pick === i ? "▸ selected" : "back this option"}
                  {payoutMultiple(m.pools, i) > 0 && pick === i && (
                    <span className="text-muted ml-2 normal-case tracking-normal">~{payoutMultiple(m.pools, i).toFixed(2)}× if it wins</span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ruling */}
      {m.ruling && (
        <div className="card p-6 mt-6">
          <p className="eyebrow">Oracle ruling{m.status === "REFUNDING" ? " · unclear" : ""}</p>
          <p className="mono mt-2 text-ink">
            {m.winning_option != null ? `Winner — option ${m.winning_option}: ${m.options[m.winning_option]}` : "UNCLEAR"}
            <span className="text-muted ml-3 text-xs">{m.ruling.confidence} confidence</span>
          </p>
          {m.ruling.reasons?.[0] && <p className="mt-3 text-body text-[0.95rem] border-l border-hairline-strong pl-3">{m.ruling.reasons[0]}</p>}
        </div>
      )}

      {/* actions */}
      <div className="card p-6 mt-6">
        <p className="eyebrow">{m.status === "OPEN" ? "Stake" : "Settle"}</p>

        {m.status === "OPEN" && (
          <div className="mt-4">
            <div className="flex gap-3 flex-col sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="eyebrow">Stake on {pick != null ? `“${m.options[pick]}”` : "an option (pick above)"}</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0 GEN" className="field mono mt-2" />
              </div>
              <button
                onClick={() => run("stake", () => stake(client, id, pick as number, genToWei(amount)))}
                disabled={pick == null || !(Number(amount) > 0) || !!busy}
                className="btn whitespace-nowrap"
              >
                {busy === "stake" ? "Staking…" : "Place stake"}
              </button>
            </div>
            {isCreator && (
              <button onClick={() => run("close", () => closeMarket(client, id))} disabled={!!busy} className="btn-ghost mt-5 text-[0.7rem]">
                {busy === "close" ? "Closing…" : "Close betting (creator)"}
              </button>
            )}
          </div>
        )}

        {m.status === "CLOSED" && (
          <div className="mt-4">
            <p className="text-body text-[0.95rem]">Betting is closed. Trigger the AI-validator panel to read the source and rule the winner.</p>
            <button onClick={() => run("resolve", () => resolve(client, id))} disabled={!!busy} className="btn mt-4">
              {busy === "resolve" ? "Consulting the oracle…" : "Resolve market"}
            </button>
          </div>
        )}

        {(m.status === "RESOLVED" || m.status === "REFUNDING") && (
          <div className="mt-4">
            {!hasAnyStake ? (
              <p className="text-body text-[0.95rem]">{m.status === "REFUNDING" ? "This market was unclear — stakers can reclaim their stake." : "Settled. Winners can claim their share."}</p>
            ) : pos?.claimed ? (
              <p className="mono text-sm text-success">✓ Claimed.</p>
            ) : m.status === "REFUNDING" ? (
              <>
                <p className="text-body text-[0.95rem]">Unclear outcome — reclaim your full stake.</p>
                <button onClick={() => run("claim", () => claim(client, id))} disabled={!!busy} className="btn mt-4">{busy === "claim" ? "Refunding…" : "Claim refund"}</button>
              </>
            ) : wonOnWinner ? (
              <>
                <p className="text-body text-[0.95rem]">You backed the winner — claim your share of the {genFromWei(m.total_pool)} GEN pool.</p>
                <button onClick={() => run("claim", () => claim(client, id))} disabled={!!busy} className="btn mt-4">{busy === "claim" ? "Claiming…" : "Claim winnings"}</button>
              </>
            ) : (
              <p className="text-body text-[0.95rem]">Your option didn&apos;t win — nothing to claim on this market.</p>
            )}
          </div>
        )}

        {!address && <p className="mono text-xs text-muted mt-4">Connect a wallet to take part.</p>}
        {error && <p className="mt-4 text-sm text-warning break-words">{error}</p>}
      </div>

      <p className="mono text-xs text-muted mt-6">
        Created by <Link href={`/u/${m.creator}`} className="link">{short(m.creator)}</Link>{isCreator ? " · you" : ""}
      </p>

      {txHash && (
        <div className="card p-5 mt-4">
          <p className="eyebrow">Last transaction</p>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <code className="mono text-xs text-body break-all">{txHash}</code>
            {explorerTxUrl(txHash) && <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="link mono text-xs">View ↗</a>}
          </div>
        </div>
      )}
    </div>
  );
}
