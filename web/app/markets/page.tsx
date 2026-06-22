"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { listMarkets, getStats, genFromWei, impliedOdds, type Market, type Stats } from "@/lib/delphi";

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([listMarkets(40), getStats()])
      .then(([m, s]) => { setMarkets(m); setStats(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const q = query.trim().toLowerCase();
  const shown = q
    ? markets.filter((m) =>
        (m.question + " " + m.options.join(" ")).toLowerCase().includes(q),
      )
    : markets;

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">The markets</p>
          <h1 className="display text-5xl sm:text-6xl mt-3">Open questions</h1>
        </div>
        <Link href="/new" className="btn">Create a market</Link>
      </div>

      {/* stats strip */}
      <div className="grid grid-cols-3 gap-px bg-hairline border border-hairline mt-10">
        <Stat label="Markets" value={stats ? `${stats.total_markets}` : "—"} />
        <Stat label="Live now" value={stats ? `${stats.total_open}` : "—"} />
        <Stat label="Volume" value={stats ? `${genFromWei(stats.total_volume)} GEN` : "—"} />
      </div>

      <div className="flex items-end justify-between gap-4 flex-wrap mt-12">
        <p className="eyebrow">{loading ? "Reading the chain…" : `${shown.length} market${shown.length === 1 ? "" : "s"}`}</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search markets…"
          className="field mono text-sm max-w-xs"
        />
      </div>

      {markets.length === 0 && !loading ? (
        <div className="card p-16 mt-4 text-center">
          <p className="text-body">No markets yet.</p>
          <Link href="/new" className="btn mt-6">Create the first</Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="card p-12 mt-4 text-center">
          <p className="text-body">No markets match “{query}”.</p>
        </div>
      ) : (
        <div className="mt-4 grid md:grid-cols-2 gap-px bg-hairline border border-hairline">
          {shown.map((m) => {
            const odds = impliedOdds(m.pools);
            const top = odds.indexOf(Math.max(...odds));
            return (
              <Link key={m.id} href={`/market/${m.id}`} className="bg-canvas card-hover p-7 block">
                <div className="flex items-center justify-between gap-3">
                  <span className="tag">{m.id}</span>
                  <StatusBadge status={m.status} />
                </div>
                <h2 className="display text-2xl mt-4 leading-tight normal-case" style={{ textTransform: "none" }}>
                  {m.question}
                </h2>
                <div className="mt-5 space-y-2.5">
                  {m.options.map((o, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-sm">
                        <span className={i === top && m.status !== "RESOLVED" ? "text-ink" : "text-body"}>
                          {o}
                          {m.winning_option === i && <span className="ml-2 text-success mono text-[0.6rem] uppercase">winner</span>}
                        </span>
                        <span className="mono text-xs text-muted">{odds[i]}%</span>
                      </div>
                      <div className="bar mt-1.5"><span style={{ width: `${odds[i]}%` }} /></div>
                    </div>
                  ))}
                </div>
                <p className="mono text-xs text-muted mt-5">{genFromWei(m.total_pool)} GEN pooled</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-canvas p-6">
      <p className="eyebrow">{label}</p>
      <p className="display text-3xl mt-2">{value}</p>
    </div>
  );
}
