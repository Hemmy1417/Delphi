"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { StatusBadge } from "@/components/StatusBadge";
import { getPositions, getMarket, genFromWei, type Position, type Market } from "@/lib/delphi";

type Row = { pos: Position; market: Market };

export default function PositionsPage() {
  const { address, connect } = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const positions = await getPositions(address);
      const out: Row[] = [];
      for (const pos of positions) {
        const market = await getMarket(pos.market_id);
        if (market) out.push({ pos, market });
      }
      out.sort((a, b) => b.market.created_seq - a.market.created_seq);
      setRows(out);
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
        <h1 className="display text-5xl">Your positions</h1>
        <p className="mt-5 text-body">Connect a wallet to see your stakes and claims.</p>
        <button onClick={() => connect().catch(() => {})} className="btn mt-8">Connect wallet</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="eyebrow">Your book</p>
      <h1 className="display text-5xl sm:text-6xl mt-3">Positions</h1>

      <p className="eyebrow mt-10">{loading ? "Reading the chain…" : `${rows.length} markets`}</p>

      {rows.length === 0 && !loading ? (
        <div className="card p-14 mt-4 text-center">
          <p className="text-body">No positions yet.</p>
          <Link href="/markets" className="btn mt-6">Find a market</Link>
        </div>
      ) : (
        <div className="card mt-4">
          {rows.map(({ pos, market }, idx) => {
            const claimable =
              !pos.claimed &&
              ((market.status === "RESOLVED" && market.winning_option != null &&
                pos.stakes.some((s) => s.option === market.winning_option)) ||
                market.status === "REFUNDING");
            return (
              <Link key={pos.market_id} href={`/market/${pos.market_id}`}
                className={`block p-6 card-hover ${idx > 0 ? "border-t border-hairline" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="tag">{market.id}</span>
                  <StatusBadge status={market.status} />
                </div>
                <h2 className="display text-xl mt-3" style={{ textTransform: "none" }}>{market.question}</h2>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                  {pos.stakes.map((s, i) => (
                    <span key={i} className="mono text-xs text-body">
                      {market.options[s.option]}: <span className="text-ink">{genFromWei(s.amount)} GEN</span>
                    </span>
                  ))}
                </div>
                {pos.claimed && <p className="mono text-xs text-success mt-3">✓ claimed</p>}
                {claimable && <p className="mono text-xs text-warning mt-3">▸ claimable — open to settle</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
