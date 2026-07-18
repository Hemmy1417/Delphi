"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { StatusBadge } from "@/components/StatusBadge";
import {
  getPositions, getMarket, listMarkets, getStats,
  genFromWei, payoutMultiple,
  type Position, type Market, type Stats,
} from "@/lib/delphi";

type Row = { pos: Position; market: Market };

// What (if anything) a market its creator is looking at needs next. Display hint
// only — the contract enforces the real windows and clocks on-chain.
function creatorDuty(m: Market, nowSec: number): string {
  if (m.status === "OPEN" && (m.close_at_epoch ?? 0) > 0 && nowSec >= (m.close_at_epoch ?? 0))
    return "past scheduled close — anyone can close it now";
  if (m.status === "OPEN") return "";
  if (m.status === "CLOSED") return "awaiting resolve — run the panel";
  if (m.status === "PROPOSED")
    return m.appealed
      ? "appealed — finalize to settle the bond and pools"
      : "ruling proposed — finalize once the appeal window passes";
  return "";
}

// Rough settle value of a claimable position: full refund when the market is
// REFUNDING, pool-share on the winning option when it resolved. "Est." because
// creator fees and forfeited bonds shift the exact figure at claim time.
function estClaimWei(pos: Position, m: Market): bigint {
  if (m.status === "REFUNDING")
    return pos.stakes.reduce((a, s) => a + BigInt(s.amount || "0"), 0n);
  if (m.status === "RESOLVED" && m.winning_option != null) {
    const win = pos.stakes
      .filter((s) => s.option === m.winning_option)
      .reduce((a, s) => a + BigInt(s.amount || "0"), 0n);
    if (win === 0n) return 0n;
    const mult = payoutMultiple(m.pools, m.winning_option);
    return BigInt(Math.floor(Number(win) * mult));
  }
  return 0n;
}

function isClaimable(pos: Position, m: Market): boolean {
  return (
    !pos.claimed &&
    ((m.status === "RESOLVED" && m.winning_option != null &&
      pos.stakes.some((s) => s.option === m.winning_option)) ||
      m.status === "REFUNDING")
  );
}

export default function DashboardPage() {
  const { address, connect } = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [created, setCreated] = useState<Market[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      // One batched sweep (positions + recent markets + stats), then fill any
      // position market the list missed — keeps reads calm under the shared
      // Studionet rate limit instead of one call per market.
      const [positions, recent, s] = await Promise.all([
        getPositions(address),
        listMarkets(60),
        getStats(),
      ]);
      const byId = new Map(recent.map((m) => [m.id, m]));
      const out: Row[] = [];
      for (const pos of positions) {
        const market = byId.get(pos.market_id) ?? (await getMarket(pos.market_id));
        if (market) out.push({ pos, market });
      }
      out.sort((a, b) => b.market.created_seq - a.market.created_seq);
      setRows(out);
      setCreated(
        recent
          .filter((m) => m.creator?.toLowerCase() === address.toLowerCase())
          .sort((a, b) => b.created_seq - a.created_seq),
      );
      setStats(s);
    } catch {
      /* graceful */
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  if (!address) {
    return (
      <div className="mx-auto max-w-xl px-5 py-28 text-center">
        <h1 className="display text-5xl">Your dashboard</h1>
        <p className="mt-5 text-body">Connect a wallet to see your book, claims, and markets.</p>
        <button onClick={() => connect().catch(() => {})} className="btn mt-8">Connect wallet</button>
      </div>
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const liveStatuses = new Set(["OPEN", "CLOSED", "PROPOSED"]);
  const atStakeWei = rows
    .filter(({ market }) => liveStatuses.has(market.status))
    .reduce((a, { pos }) => a + pos.stakes.reduce((x, s) => x + BigInt(s.amount || "0"), 0n), 0n);
  const claimables = rows.filter(({ pos, market }) => isClaimable(pos, market));
  const claimableWei = claimables.reduce((a, { pos, market }) => a + estClaimWei(pos, market), 0n);
  const duties = created
    .map((m) => ({ m, duty: creatorDuty(m, nowSec) }))
    .filter((d) => d.duty);

  const tiles = [
    { label: "At stake", value: `${genFromWei(atStakeWei)} GEN`, sub: "in live markets" },
    { label: "Claimable", value: `${genFromWei(claimableWei)} GEN`, sub: `est. across ${claimables.length} market${claimables.length === 1 ? "" : "s"}` },
    { label: "Markets played", value: String(rows.length), sub: "with a position" },
    { label: "Created", value: String(created.length), sub: "as the market maker" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <p className="eyebrow">Your book, at a glance</p>
      <h1 className="display text-5xl sm:text-6xl mt-3">Dashboard</h1>
      <p className="eyebrow mt-4">{loading ? "Reading the chain…" : `Connected as ${address.slice(0, 6)}…${address.slice(-4)}`}</p>

      {/* summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-hairline mt-8 border border-hairline">
        {tiles.map((t) => (
          <div key={t.label} className="bg-canvas p-5">
            <p className="eyebrow">{t.label}</p>
            <p className="display text-2xl mt-2">{t.value}</p>
            <p className="mono text-xs text-muted mt-1">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* claimables — the money waiting on a click */}
      {claimables.length > 0 && (
        <section className="mt-12">
          <p className="eyebrow text-warning">▸ Settle now</p>
          <div className="card mt-3">
            {claimables.map(({ pos, market }, idx) => (
              <Link key={pos.market_id} href={`/market/${pos.market_id}`}
                className={`block p-5 card-hover ${idx > 0 ? "border-t border-hairline" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="tag">{market.id}</span>
                  <span className="mono text-xs text-warning">
                    est. {genFromWei(estClaimWei(pos, market))} GEN
                  </span>
                </div>
                <h2 className="display text-lg mt-2" style={{ textTransform: "none" }}>{market.question}</h2>
                <p className="mono text-xs text-muted mt-2">
                  {market.status === "REFUNDING" ? "market refunding — reclaim your stake" : "you backed the winning option — claim your share"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* creator desk */}
      <section className="mt-12">
        <p className="eyebrow">Your markets · creator desk</p>
        {created.length === 0 && !loading ? (
          <div className="card p-10 mt-3 text-center">
            <p className="text-body">You haven&apos;t created a market yet.</p>
            <Link href="/new" className="btn mt-5">Create one</Link>
          </div>
        ) : (
          <div className="card mt-3">
            {created.map((m, idx) => {
              const duty = creatorDuty(m, nowSec);
              return (
                <Link key={m.id} href={`/market/${m.id}`}
                  className={`block p-5 card-hover ${idx > 0 ? "border-t border-hairline" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="tag">{m.id}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <h2 className="display text-lg mt-2" style={{ textTransform: "none" }}>{m.question}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span className="mono text-xs text-body">pool <span className="text-ink">{genFromWei(m.total_pool)} GEN</span></span>
                    {duty && <span className="mono text-xs text-warning">▸ {duty}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {duties.length > 0 && (
          <p className="mono text-xs text-muted mt-3">
            {duties.length} market{duties.length === 1 ? " needs" : "s need"} an action — open one to act.
          </p>
        )}
      </section>

      {/* positions link-through */}
      <section className="mt-12">
        <div className="flex items-center justify-between">
          <p className="eyebrow">All positions</p>
          <Link href="/positions" className="mono text-xs link">full list →</Link>
        </div>
      </section>

      {/* protocol book — the same solvency numbers the judges read */}
      {stats && (
        <section className="mt-12">
          <p className="eyebrow">Protocol book · on-chain</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-hairline mt-3 border border-hairline">
            <div className="bg-canvas p-5">
              <p className="eyebrow">Escrowed</p>
              <p className="mono text-lg text-ink mt-2">{genFromWei(stats.escrowed_wei)} GEN</p>
            </div>
            <div className="bg-canvas p-5">
              <p className="eyebrow">Paid out</p>
              <p className="mono text-lg text-ink mt-2">{genFromWei(stats.paid_out_wei)} GEN</p>
            </div>
            <div className="bg-canvas p-5">
              <p className="eyebrow">Creator fees</p>
              <p className="mono text-lg text-ink mt-2">{genFromWei(stats.fees_paid_wei)} GEN</p>
            </div>
            <div className="bg-canvas p-5">
              <p className="eyebrow">Appeals</p>
              <p className="mono text-lg text-ink mt-2">{stats.total_appeals}</p>
            </div>
          </div>
          <p className="mono text-xs text-muted mt-3">
            Every wei the contract holds, from get_stats — a settled market closes its book to zero.
          </p>
        </section>
      )}
    </div>
  );
}
