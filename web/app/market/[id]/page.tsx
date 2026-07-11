"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { StatusBadge } from "@/components/StatusBadge";
import { explorerTxUrl } from "@/lib/config";
import {
  getMarket, getPositions, getAppealBond, stake, unstake, closeMarket, resolve, appeal, finalize, claim,
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
  const [bond, setBond] = useState<bigint>(0n);
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
      if (m?.status === "PROPOSED" && !m.appealed) {
        getAppealBond(id).then(setBond).catch(() => setBond(0n));
      }
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
  const isResolver = !!address && !!m.resolver && address.toLowerCase() === m.resolver.toLowerCase();
  const sources = m.source_uris?.length ? m.source_uris : [m.source_uri];
  const myStake = (opt: number) => pos?.stakes.find((s) => s.option === opt)?.amount ?? "0";
  const hasAnyStake = (pos?.stakes.length ?? 0) > 0;
  const wonOnWinner = m.status === "RESOLVED" && m.winning_option != null && Number(myStake(m.winning_option)) > 0;
  const history = m.history?.length ? m.history : m.ruling ? [{ round: "initial" as const, ruling: m.ruling }] : [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/markets" className="eyebrow hover:text-ink">← Markets</Link>

      <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
        <span className="tag">{m.id}</span>
        <StatusBadge status={m.status} />
      </div>
      <h1 className="display text-4xl sm:text-5xl mt-3 leading-tight" style={{ textTransform: "none" }}>{m.question}</h1>
      <p className="mono text-xs text-muted mt-4">
        {genFromWei(m.total_pool)} GEN pooled
        {m.fee_bps > 0 && <span> · {(m.fee_bps / 100).toFixed(m.fee_bps % 100 ? 2 : 0)}% creator fee</span>}
      </p>
      <p className="mt-4 text-body"><span className="eyebrow">Criteria</span><br />{m.criteria}</p>

      {/* pinned evidence — frozen at creation, nobody can swap it */}
      <div className="card p-5 mt-6">
        <p className="eyebrow">Pinned resolution sources · frozen at creation</p>
        <div className="mt-2 space-y-1">
          {sources.map((s, i) => (
            <p key={i} className="mono text-xs break-all">
              <span className="text-muted mr-2">{i + 1}</span>
              <a href={s} target="_blank" rel="noreferrer" className="link">{s} ↗</a>
            </p>
          ))}
        </div>
        <p className="mono text-[0.65rem] text-muted mt-3">
          The oracle reads only these URLs — locked before the first stake, corroboration required.
        </p>
      </div>

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

      {/* ruling history — every consensus round, on-chain */}
      {history.length > 0 && (
        <div className="card p-6 mt-6">
          <p className="eyebrow">
            {m.status === "PROPOSED" ? "Proposed ruling" : "Oracle ruling"}
            {m.appealed ? ` · appealed${m.appeal_flipped ? " · flipped" : " · upheld"}` : ""}
            {m.status === "REFUNDING" ? " · unclear" : ""}
          </p>
          {history.map((h, i) => {
            const w = h.ruling.winning_option;
            const idx = typeof w === "number" ? w : null;
            const isLatest = i === history.length - 1;
            return (
              <div key={i} className={`mt-3 ${i > 0 ? "border-t border-hairline pt-3" : ""} ${isLatest ? "" : "opacity-55"}`}>
                <p className="mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                  Round {i + 1} · {h.round}{isLatest && history.length > 1 ? " · final" : ""}
                </p>
                <p className="mono mt-1 text-ink">
                  {idx != null ? `Option ${idx}: ${m.options[idx]}` : "UNCLEAR"}
                  <span className="text-muted ml-3 text-xs">{h.ruling.confidence} confidence</span>
                </p>
                {h.ruling.reasons?.[0] && <p className="mt-2 text-body text-[0.95rem] border-l border-hairline-strong pl-3">{h.ruling.reasons[0]}</p>}
              </div>
            );
          })}
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
            <div className="mt-5 flex gap-3 flex-wrap items-center">
              {isCreator && (
                <button onClick={() => run("close", () => closeMarket(client, id))} disabled={!!busy} className="btn-ghost text-[0.7rem]">
                  {busy === "close" ? "Closing…" : "Close betting (creator)"}
                </button>
              )}
              {hasAnyStake && (
                <button onClick={() => run("unstake", () => unstake(client, id))} disabled={!!busy} className="btn-ghost text-[0.7rem]">
                  {busy === "unstake" ? "Withdrawing…" : "Withdraw my stake"}
                </button>
              )}
            </div>
            {hasAnyStake && (
              <p className="mono text-[0.65rem] text-muted mt-2">You can pull your whole position out any time before betting closes — funds are never trapped.</p>
            )}
          </div>
        )}

        {m.status === "CLOSED" && (
          <div className="mt-4">
            <p className="text-body text-[0.95rem]">Betting is closed. Trigger the AI-validator panel to read the pinned sources and propose a ruling.</p>
            <button onClick={() => run("resolve", () => resolve(client, id))} disabled={!!busy} className="btn mt-4">
              {busy === "resolve" ? "Consulting the oracle…" : "Resolve market"}
            </button>
            <p className="mono text-[0.65rem] text-muted mt-3">Whoever proposes the ruling cannot also finalize it — the appeal window can&apos;t be sniped shut.</p>
          </div>
        )}

        {m.status === "PROPOSED" && (
          <div className="mt-4">
            <p className="text-body text-[0.95rem]">
              A ruling is proposed — funds haven&apos;t moved.{" "}
              {m.appealed
                ? "The appeal has run; anyone can finalize to open claims."
                : "A staker may appeal once (bonded) before anyone else finalizes."}
            </p>
            <div className="mt-4 flex gap-3 flex-wrap">
              <button onClick={() => run("finalize", () => finalize(client, id))} disabled={!!busy || (isResolver && !m.appealed)} className="btn">
                {busy === "finalize" ? "Finalizing…" : "Finalize & open claims"}
              </button>
              {!m.appealed && hasAnyStake && (
                <button onClick={() => run("appeal", () => appeal(client, id, bond))} disabled={!!busy || bond === 0n} className="btn-ghost">
                  {busy === "appeal" ? "Re-reading…" : `Appeal (bond ${genFromWei(bond)} GEN)`}
                </button>
              )}
            </div>
            {isResolver && !m.appealed && (
              <p className="mono text-[0.65rem] text-muted mt-3">You proposed this ruling, so another wallet must finalize it — that&apos;s the appeal window.</p>
            )}
            {!m.appealed && hasAnyStake && (
              <p className="mono text-[0.65rem] text-muted mt-3">
                The bond (1% of the pool, min 0.01 GEN) returns if your appeal changes the outcome; if the ruling is upheld it joins the winners&apos; pool.
              </p>
            )}
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
        {m.resolver && <span> · ruling proposed by {short(m.resolver)}{isResolver ? " (you)" : ""}</span>}
        {m.appellant && <span> · appealed by {short(m.appellant)}</span>}
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
