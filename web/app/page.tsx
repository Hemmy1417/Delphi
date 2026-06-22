import Link from "next/link";

export default function Home() {
  return (
    <div>
      {/* hero */}
      <section className="mx-auto max-w-6xl px-5 pt-28 pb-32 text-center">
        <p className="eyebrow">Prediction markets · GenLayer</p>
        <h1 className="display text-6xl sm:text-8xl mt-8 leading-[1.02]">
          The oracle
          <br />
          decides.
        </h1>
        <p className="mt-8 text-body-strong text-xl max-w-2xl mx-auto leading-relaxed">
          Stake on the outcome of any question. When it settles, an AI-validator panel reads the
          resolution source and pays the winners — no central oracle, no trusted resolver.
        </p>
        <div className="mt-12 flex items-center justify-center gap-4 flex-wrap">
          <Link href="/markets" className="btn">Browse markets</Link>
          <Link href="/new" className="btn-ghost">Create a market</Link>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <p className="eyebrow text-center">How it works</p>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-hairline border border-hairline">
            {STEPS.map((s, i) => (
              <div key={i} className="bg-canvas p-8">
                <p className="mono text-muted text-xs">0{i + 1}</p>
                <h3 className="display text-2xl mt-4">{s.t}</h3>
                <p className="mt-3 text-body text-[0.95rem] leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* why genlayer */}
      <section className="border-t border-hairline">
        <div className="mx-auto max-w-3xl px-5 py-24 text-center">
          <p className="eyebrow">Why GenLayer</p>
          <p className="mt-8 text-2xl sm:text-3xl text-body-strong leading-snug" style={{ fontFamily: "var(--font-serif)" }}>
            Resolving a market needs live web access, AI judgement, and a binding on-chain payout.
            A normal contract can&apos;t fetch or judge; a centralized oracle isn&apos;t trustless.
            GenLayer&apos;s validator consensus <span className="text-ink">is</span> the decentralized oracle.
          </p>
          <Link href="/markets" className="btn mt-12">Enter the markets</Link>
        </div>
      </section>
    </div>
  );
}

const STEPS = [
  { t: "Create", d: "Pose a question, name the options, and point to a public resolution source + criteria." },
  { t: "Stake", d: "Back an option with GEN. Pools build per option; the odds move with the crowd." },
  { t: "Resolve", d: "Betting closes, then an AI-validator panel reads the source and rules the winner." },
  { t: "Claim", d: "Winners split the whole pool pro-rata. An unclear outcome refunds everyone." },
];
