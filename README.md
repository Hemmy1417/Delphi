# Delphi — AI-resolved prediction markets on GenLayer

> Stake on the outcome of any real-world question. When it's settled, an AI-validator panel reads the
> **evidence pinned at market creation** and pays the winners — no central oracle, no swappable sources.

**Status:** **Live.** Frontend on Vercel, contract v3 on **Studionet** (chain 61999) at
`0xfCb9bF0b431BBDaeA051898Fa7d16eBA0b6eDc7E`. The Next.js frontend (`web/`, Bugatti-inspired
monochrome) reads the live markets.

## Live demo
**https://delphi-markets.vercel.app**

## Project summary
Prediction markets need an **oracle** to decide what actually happened — normally a centralized,
trusted resolver. Delphi makes the oracle an **AI-validator panel** on GenLayer: the contract holds
the staked GEN, and at settlement it fetches the resolution sources, judges which option won, and pays
the winners from the pool. Pooled (parimutuel) odds, claim-based payouts, refund on an unclear result.

**GenLayer advantage:** resolving a market needs live web access + AI judgement *and* a binding
on-chain payout. A normal contract can't fetch or judge; a centralized oracle isn't trustless.
GenLayer's validator consensus *is* the decentralized oracle.

## The v3 hardening (why this isn't a demo)

- **Pinned multi-source evidence.** 1–3 resolution URLs are frozen the moment a market is created —
  nobody (the creator included) can swap the evidence after money is staked. The panel reads *all* of
  them and requires corroboration; one walled or dead link is reported to the panel instead of sinking
  the market. Verified on-chain: a dual-source market resolved correctly under 5-validator consensus.
- **Contract-enforced appeal deadline (real wall-clock).** `resolve` only *proposes* a ruling and stamps
  a hard deadline: the contract fetches the current UTC time under validator consensus — from two
  probe-verified sources, Cloudflare's edge clock and Ethereum's own latest block timestamp — and an
  **unappealed** ruling cannot be finalized until a *fresh* fetch proves that 10-minute window has
  passed. The old guard only blocked the resolver's own wallet, so a second wallet could resolve→finalize
  back-to-back and snipe the window shut; now real minutes cannot be manufactured with extra wallets. The
  clock **fails closed** (no trusted time → no finalization; if it was down at ruling time, the window is
  armed on the first finalize attempt instead — an outage can only lengthen it).
- **Bonded appeals.** One appeal per market, stakers only, costing 1% of the pool (min 0.01 GEN). If
  the appeal flips the outcome (or the market ends in refunds) the bond returns; if the original ruling
  is upheld the bond joins the winners' pool. Re-rolling consensus is no longer a free dice-roll.
- **Ruling history on-chain.** Every consensus round (initial + appeal) is stored on the market and
  rendered in the UI — the full audit trail of how the outcome was decided.
- **Solvency book.** Global `escrowed / paid out / fees / appeals` accounting exposed by `get_stats`
  and shown on the markets page: every wei the contract holds is visible, and a settled market's book
  closes to zero (floor-division dust aside).
- **Funds-safety exit.** A staker can withdraw their entire position while a market is still OPEN — an
  abandoned market can never trap money.
- **41 direct-mode tests** covering the pricing math, bond settlement in all three outcomes
  (flip / upheld / refund), the appeal-deadline guard, the book invariants, the case-file /
  odds / scheduled-close / cancel additions, and the full lifecycle.

## The Internet Court: every market is a multi-outcome case

A Delphi market is not just a set of pools — it is a **case before a panel**. Anyone may call
`build_case_file(market_id)` — non-payable, permissionless — and the validator panel fetches the pinned
sources and files a structured, **multi-outcome** brief on-chain: a neutral summary, per-source findings,
the strongest evidence-based case **for every option**, and a **probability distribution across all
options** (not just yes/no) with an evidence-quality confidence read. Files **append, never overwrite** —
each stamped with a consensus-fetched UTC epoch and the pools at that moment — so the sequence is the
market's evidence timeline. The market page renders the latest brief as a per-option debate with a
distribution bar; "Reopen the file" is a real ~90s validator investigation, so every update is a verified
transaction, not a stream you have to trust. The same injection guardrails as settlement apply: fetched
text is material under review, never instructions, and an unreachable source supports nothing.

**Verified live on-chain:** a 3-outcome market ("Bitcoin block height below 900k / 900k–1M / above 1M")
filed a case where the panel read both pinned sources (height 958,540), put the full distribution on
**900k–1M at 100%** with HIGH confidence, and cited the exact height under the winning option.

## The full-build additions

- **Probability-over-time chart.** The contract snapshots the pools after every stake (`get_odds_history`);
  each market page draws one line per option — the signature prediction-market view, from on-chain data.
- **Autonomous scheduled close.** A market can carry a real close time (`close_at_epoch`). Once the fetched
  wall-clock proves it has passed, **anyone** may close it — staking never waits on the creator.
- **Creator cancel, guarded by immutability.** A creator can `cancel_market` (VOID) a mistaken market, but
  only while it has **zero stakes**; the instant one stake lands, cancel is refused forever.
- **AI drafter + clerk.** `suggest_market` drafts a multi-outcome question, options, criteria, and sources,
  and flags ambiguity + edge cases for the creator to fix before opening.

## How it works
1. **Create** a market: a question, 2+ options, **1–3 resolution-source URLs (pinned forever)** + criteria,
   optional creator fee (≤5%).
2. **Stake** GEN on an option — pools build per option; withdraw any time before betting closes.
3. **Close** betting (creator), then **resolve** — the AI panel reads the pinned sources and *proposes* a
   ruling. The proposer can't finalize it; a staker may appeal once (bonded) for a rigorous re-read.
4. **Finalize** locks the ruling and settles the appeal bond, then **claim** — winners split the pool
   pro-rata (plus any forfeited bond); an unclear result refunds everyone.

## Honest boundaries
- **The appeal window is now real time, fetched.** GenVM has no native clock, so the contract fetches UTC
  under consensus (Cloudflare + Ethereum block time). This is as trustless as those two independent,
  probe-verified sources — both would have to be wrong in the same direction at the same moment to shift a
  deadline, and the clock never *raises*: an outage degrades to "no finalization" rather than mispricing.
  The earlier action-gated caveat (a second wallet could snipe the window) no longer applies — real
  minutes cannot be manufactured with extra wallets.
- **Source quality is the creator's choice.** Pinning freezes the evidence, it doesn't bless it — the
  UI steers creators toward stable, anonymously-fetchable pages, and unreadable sources push markets
  toward refunds (fail-safe, not fail-open).

## Tech stack
- **Intelligent Contract:** Python + GenVM (markets, stakes, AI resolution, payouts — source of truth)
- **Frontend:** Next.js · React · Tailwind · GenLayerJS · viem; injected-wallet only (EIP-6963)
- **Backend:** none

## Repo layout
```
docs/          PRD.md TRD.md SDLC.md SCHEMAS.md
contracts/     delphi.py       (the Intelligent Contract, v0.4)
tests/direct/  test_delphi.py  (41 direct-mode tests, pytest)
web/           Next.js + GenLayerJS frontend
```

## Contract
- **Address:** `0xfCb9bF0b431BBDaeA051898Fa7d16eBA0b6eDc7E`
- **Network:** GenLayer Studionet (chain 61999)
- **Open in Studio:** [GenLayer Studio](https://studio.genlayer.com/?import-contract=0xfCb9bF0b431BBDaeA051898Fa7d16eBA0b6eDc7E)

Stress-tested end-to-end on-chain across four live markets: a dual-Wikipedia market resolved
correctly under validator consensus with an **upheld bonded appeal** — the forfeited bond joined the
winners' pool and the claim paid out pool + bond minus the creator fee, with the fee landing in the
creator's wallet; a market with one deliberately login-walled source still resolved from the readable
one; a market with **both** sources unreachable ruled UNCLEAR and refunded everyone, **returning the
appellant's bond** (fail-safe, not fail-open); two keyless JSON price APIs corroborated a live-number
market. The anti-snipe guard (proposer's own finalize) rolls back on-chain; stake withdrawal, restake,
and the escrow book closing to zero were all verified with balance checks.

> **GenVM lessons baked in (July 2026).** Wallet payouts go through an empty
> `@gl.evm.contract_interface` proxy (`emit_transfer` at a plain wallet strands value). JSON-array
> arguments arrive as *strings* from genlayer-js but as *decoded lists* from the CLI — the contract
> accepts both. Never re-wrap an `Address`-typed field.

## Local development
```bash
# contract tests
python -m pytest tests/direct -q

# frontend
cd web
npm install && npm run dev   # set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local
```

_Sibling projects:_ [Credence](https://github.com/Hemmy1417/Credence) (identity) ·
[Aegis](https://github.com/Hemmy1417/Aegis) (AI-arbitrated escrow).
