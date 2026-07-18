"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { StatusBadge } from "@/components/StatusBadge";
import { explorerTxUrl } from "@/lib/config";
import {
  getMarket, getPositions, getAppealBond, getCaseFiles, getOddsHistory, buildCaseFile, cancelMarket,
  stake, unstake, closeMarket, resolve, appeal, finalize, claim,
  genFromWei, genToWei, impliedOdds, payoutMultiple, type Market, type Position, type CaseFile,
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
  const [caseFiles, setCaseFiles] = useState<CaseFile[]>([]);
  const [oddsHist, setOddsHist] = useState<string[][]>([]);

  const load = useCallback(async () => {
    try {
      const m = await getMarket(id);
      setMarket(m);
      if (m?.status === "PROPOSED" && !m.appealed) {
        getAppealBond(id).then(setBond).catch(() => setBond(0n));
      }
      getCaseFiles(id).then(setCaseFiles).catch(() => {});
      getOddsHistory(id).then(setOddsHist).catch(() => {});
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
  // scheduled close + appeal deadline (client clock is advisory; the contract
  // re-fetches the real clock to enforce both — the UI only mirrors what it allows)
  const nowSec = Math.floor(Date.now() / 1000);
  const closeAt = m.close_at_epoch ?? 0;
  const scheduledPast = m.status === "OPEN" && closeAt > 0 && nowSec >= closeAt;
  const canCancel = isCreator && m.status === "OPEN" && BigInt(m.total_pool || "0") === 0n;
  const deadline = m.appeal_open_until_epoch ?? 0;

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

      <OddsChart history={oddsHist} options={m.options} />

      {/* the case file — Internet-Court multi-outcome brief + evidence timeline */}
      <CaseFileSection
        files={caseFiles}
        market={m}
        busy={busy}
        canFile={m.status !== "VOID"}
        connected={!!address}
        onFile={() => run("casefile", () => buildCaseFile(client, id))}
      />

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
              {/* permissionless scheduled close: once the time passes, anyone can close it */}
              {scheduledPast && !isCreator && (
                <button onClick={() => run("close", () => closeMarket(client, id))} disabled={!!busy} className="btn-ghost text-[0.7rem]">
                  {busy === "close" ? "Closing…" : "Close now (scheduled time reached)"}
                </button>
              )}
              {canCancel && (
                <button onClick={() => { if (confirm("Cancel this market? Only possible because nobody has staked — it will be voided permanently.")) run("cancel", () => cancelMarket(client, id)); }} disabled={!!busy} className="btn-ghost text-[0.7rem] text-danger">
                  {busy === "cancel" ? "Cancelling…" : "Cancel market"}
                </button>
              )}
              {hasAnyStake && (
                <button onClick={() => run("unstake", () => unstake(client, id))} disabled={!!busy} className="btn-ghost text-[0.7rem]">
                  {busy === "unstake" ? "Withdrawing…" : "Withdraw my stake"}
                </button>
              )}
            </div>
            {closeAt > 0 && (
              <p className="mono text-[0.65rem] text-muted mt-2">
                {scheduledPast ? "⏰ scheduled close reached — anyone can close it now."
                  : `⏱ betting auto-closes in ${fmtUntil(closeAt - nowSec)} — then anyone can close it (no need to wait on the creator).`}
              </p>
            )}
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
            {!m.appealed && deadline > 0 && nowSec < deadline && (
              <p className="mono text-[0.65rem] text-muted mt-3">
                ⏳ Contract-enforced appeal window: finalizing is refused for {fmtUntil(deadline - nowSec)} more of real time (until the fetched clock clears epoch {deadline}). Real minutes can&apos;t be sniped shut with a second wallet.
              </p>
            )}
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

// Compact "2d 4h" / "3h 12m" / "45m" countdown from a seconds delta.
function fmtUntil(sec: number): string {
  if (sec <= 0) return "moments";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), mm = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

// Probability-over-time chart, inline SVG (no chart library) from the on-chain
// odds history: each snapshot is the pools array after a stake; one line per option.
function OddsChart({ history, options }: { history: string[][]; options: string[] }) {
  if (!history || history.length < 2) return null;
  const W = 640, H = 150, padT = 12, padB = 4, padX = 4;
  const n = history.length;
  const COLORS = ["#111111", "#8a8a8a", "#c0392b", "#2d6a4f", "#8e6f00", "#5b3a8e"];
  const series = options.map((_, o) =>
    history.map((snap) => {
      const total = snap.reduce((a, s) => a + Number(s), 0);
      return total > 0 ? (Number(snap[o] ?? "0") / total) * 100 : 100 / options.length;
    })
  );
  const x = (i: number) => padX + (n === 1 ? 0 : (i / (n - 1)) * (W - 2 * padX));
  const y = (p: number) => padT + (1 - p / 100) * (H - padT - padB);
  const line = (s: number[]) => s.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  return (
    <div className="card p-5 mt-6">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Probability over time · on-chain</p>
        <span className="mono text-[0.6rem] text-muted">{n} snapshots</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="mt-2 block">
        {[0, 50, 100].map((g) => (
          <line key={g} x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={g === 50 ? 0.18 : 0.08} strokeWidth={0.5} className="text-ink" />
        ))}
        {series.map((s, o) => (
          <path key={o} d={line(s)} fill="none" stroke={COLORS[o % COLORS.length]} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <div className="flex gap-3 flex-wrap mt-2">
        {options.map((opt, o) => (
          <span key={o} className="mono text-[0.62rem] flex items-center gap-1.5">
            <span style={{ width: 9, height: 3, borderRadius: 2, background: COLORS[o % COLORS.length], display: "inline-block" }} />
            <span className="text-muted">{opt}</span>
            <span className="text-ink">{Math.round(series[o][n - 1])}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// The market as a case: a multi-outcome validator brief (summary, per-source
// findings, arguments per option, a probability distribution across ALL options,
// confidence) filed on-chain; filings append into an evidence timeline. "Reopen
// the file" is a real ~90s validator investigation — the honest shape of "live"
// on GenLayer: every update is a verified transaction, not a stream.
function CaseFileSection({ files, market, busy, canFile, onFile, connected }: {
  files: CaseFile[]; market: Market; busy: string; canFile: boolean; onFile: () => void; connected: boolean;
}) {
  const latest = files.length > 0 ? files[files.length - 1] : null;
  const b = latest?.brief;
  const conf = (b?.confidence || "LOW").toUpperCase();
  const stars = conf === "HIGH" ? 5 : conf === "MEDIUM" ? 3 : 2;
  const dist = b?.implied_distribution ?? [];
  const total = dist.reduce((a, x) => a + (Number(x) || 0), 0) || 1;
  const pct = (i: number) => Math.round(((Number(dist[i]) || 0) / total) * 100);
  const lead = dist.length ? dist.indexOf(Math.max(...dist)) : -1;
  const argsFor = (o: number) => b?.arguments?.find((a) => Number(a.option) === o)?.points ?? [];
  const fmtDate = (e: number) => (e > 0 ? new Date(e * 1000).toUTCString().replace(":00 GMT", " UTC") : "clock unavailable");

  return (
    <div className="card p-6 mt-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="eyebrow">Case file · panel investigation</p>
        {connected && canFile && (
          <button onClick={onFile} disabled={!!busy} className="btn-ghost text-[0.7rem]">
            {busy === "casefile" ? "Panel investigating… (~90s)" : latest ? "Reopen the file" : "Open the case file"}
          </button>
        )}
      </div>

      {!latest ? (
        <p className="text-body text-[0.95rem] mt-3">
          No case file yet. Anyone can ask the validator panel to investigate the pinned sources and
          file a structured brief — a summary, the evidence, and the strongest case for <em>every</em> option.
        </p>
      ) : (
        <>
          <p className="mono text-[0.6rem] text-muted mt-2">filing #{latest.index + 1} · {fmtDate(latest.at_epoch)} · by {latest.filed_by.slice(0, 6)}…{latest.filed_by.slice(-4)}</p>
          <p className="text-body text-[0.95rem] mt-2 leading-relaxed">{b!.summary}</p>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 mono text-xs">
            <span className="text-muted">Confidence <span className="text-ink">{conf}</span> <span className="tracking-widest">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span></span>
            <span className="text-muted">Sources cited <span className="text-ink">{b!.evidence.length}</span></span>
            {lead >= 0 && <span className="text-muted">Panel favours <span className="text-ink">{market.options[lead]} {pct(lead)}%</span></span>}
          </div>

          <div className="mt-4 space-y-2">
            <p className="eyebrow">Panel read across the options</p>
            {market.options.map((o, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mono text-xs">
                  <span className={i === lead ? "text-ink" : "text-muted"}>{o}</span>
                  <span className={i === lead ? "text-ink" : "text-muted"}>{pct(i)}%</span>
                </div>
                <div className="bar mt-1"><span style={{ width: `${pct(i)}%` }} /></div>
                {argsFor(i).length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {argsFor(i).map((p, k) => <li key={k} className="text-body text-[0.82rem] leading-snug pl-3 border-l border-hairline">{p}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {b!.evidence.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow">Evidence · what each pinned source shows</p>
              <div className="mt-1 space-y-1">
                {b!.evidence.map((e, i) => (
                  <p key={i} className="mono text-[0.7rem] leading-snug">
                    <a href={e.source} target="_blank" rel="noreferrer" className="link break-all">{e.source}</a>
                    <span className="text-muted"> — </span><span className="text-body text-[0.8rem]">{e.finding}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {files.length > 1 && (
            <div className="mt-4">
              <p className="eyebrow">Evidence timeline · {files.length} filings</p>
              <div className="mt-1 space-y-0.5">
                {[...files].reverse().map((f) => {
                  const d = f.brief.implied_distribution ?? [];
                  const t = d.reduce((a, x) => a + (Number(x) || 0), 0) || 1;
                  const li = d.length ? d.indexOf(Math.max(...d)) : -1;
                  return (
                    <p key={f.index} className="mono text-[0.64rem] text-muted">
                      #{f.index + 1} · {fmtDate(f.at_epoch)} · {li >= 0 ? `${market.options[li]} ${Math.round(((Number(d[li]) || 0) / t) * 100)}%` : "—"} · {String(f.brief.confidence).toUpperCase()}
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
