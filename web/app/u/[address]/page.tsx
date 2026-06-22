"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getAddress } from "viem";
import { StatusBadge } from "@/components/StatusBadge";
import { listMarkets, getPositions, genFromWei, type Market, type Position } from "@/lib/delphi";

export default function ProfilePage() {
  const params = useParams<{ address: string }>();
  // Positions/markets are keyed by the EIP-55 checksummed address on-chain; normalize a
  // shared/typed link (which may be lowercase) so it matches.
  const address = useMemo(() => {
    try { return getAddress(params.address); } catch { return params.address; }
  }, [params.address]);

  const [created, setCreated] = useState<Market[]>([]);
  const [positions, setPositions] = useState<{ pos: Position; market: Market | undefined }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listMarkets(100), getPositions(address)])
      .then(([all, pos]) => {
        const lower = address.toLowerCase();
        setCreated(all.filter((m) => m.creator.toLowerCase() === lower));
        setPositions(pos.map((p) => ({ pos: p, market: all.find((m) => m.id === p.market_id) })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  const totalStaked = positions.reduce(
    (sum, { pos }) => sum + pos.stakes.reduce((s, st) => s + Number(BigInt(st.amount || "0")), 0),
    0,
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/markets" className="eyebrow hover:text-ink">← Markets</Link>

      <p className="eyebrow mt-8">Forecaster</p>
      <h1 className="mono text-2xl sm:text-3xl text-ink mt-2 break-all">{address}</h1>

      <div className="grid grid-cols-3 gap-px bg-hairline border border-hairline mt-8">
        <Stat label="Created" value={`${created.length}`} />
        <Stat label="Backed" value={`${positions.length}`} />
        <Stat label="Staked" value={`${genFromWei(BigInt(Math.round(totalStaked)))} GEN`} />
      </div>

      <Section title={`Markets created · ${created.length}`} loading={loading} empty="No markets created.">
        {created.map((m) => <MarketRow key={m.id} m={m} />)}
      </Section>

      <Section title={`Positions · ${positions.length}`} loading={loading} empty="No positions.">
        {positions.map(({ pos, market }) =>
          market ? (
            <Link key={pos.market_id} href={`/market/${market.id}`} className="block p-6 card-hover border-t border-hairline first:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <span className="tag">{market.id}</span>
                <StatusBadge status={market.status} />
              </div>
              <h3 className="display text-lg mt-2" style={{ textTransform: "none" }}>{market.question}</h3>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                {pos.stakes.map((s, i) => (
                  <span key={i} className="mono text-xs text-body">{market.options[s.option]}: <span className="text-ink">{genFromWei(s.amount)} GEN</span></span>
                ))}
                {pos.claimed && <span className="mono text-xs text-success">✓ claimed</span>}
              </div>
            </Link>
          ) : null,
        )}
      </Section>
    </div>
  );
}

function MarketRow({ m }: { m: Market }) {
  return (
    <Link href={`/market/${m.id}`} className="block p-6 card-hover border-t border-hairline first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <span className="tag">{m.id}</span>
        <StatusBadge status={m.status} />
      </div>
      <h3 className="display text-lg mt-2" style={{ textTransform: "none" }}>{m.question}</h3>
      <p className="mono text-xs text-muted mt-2">{genFromWei(m.total_pool)} GEN pooled</p>
    </Link>
  );
}

function Section({ title, loading, empty, children }: { title: string; loading: boolean; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(arr) ? arr.length === 0 : !arr;
  return (
    <div className="mt-12">
      <p className="eyebrow">{loading ? "Reading the chain…" : title}</p>
      {isEmpty && !loading ? (
        <p className="card p-8 mt-3 text-center text-body">{empty}</p>
      ) : (
        <div className="card mt-3">{children}</div>
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
