# Delphi — AI-resolved prediction markets on GenLayer

> Stake on the outcome of any real-world question. When it's settled, an AI-validator panel reads the
> **evidence pinned at market creation** and pays the winners — no central oracle, no swappable sources.

**Status:** **Live.** Frontend on Vercel, contract v3 on **Studionet** (chain 61999) at
`0xE223B27964920c49322e80a59AB1983364776368`. The Next.js frontend (`web/`, Bugatti-inspired
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
- **A real appeal window.** `resolve` only *proposes* a ruling; the wallet that proposed it **cannot
  also finalize it unappealed**, so a winner-side staker can't propose-and-snipe the window shut in one
  breath. Verified on-chain: the resolver's own finalize rolls back with the guard message.
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
- **28 direct-mode tests** covering the pricing math, bond settlement in all three outcomes
  (flip / upheld / refund), the anti-snipe guard, the book invariants, and the full
  stake → close → resolve → appeal → finalize → claim lifecycle.

## How it works
1. **Create** a market: a question, 2+ options, **1–3 resolution-source URLs (pinned forever)** + criteria,
   optional creator fee (≤5%).
2. **Stake** GEN on an option — pools build per option; withdraw any time before betting closes.
3. **Close** betting (creator), then **resolve** — the AI panel reads the pinned sources and *proposes* a
   ruling. The proposer can't finalize it; a staker may appeal once (bonded) for a rigorous re-read.
4. **Finalize** locks the ruling and settles the appeal bond, then **claim** — winners split the pool
   pro-rata (plus any forfeited bond); an unclear result refunds everyone.

## Honest boundaries
- **No wall-clock on GenVM** — the appeal window is action-gated (proposer-can't-finalize), not
  time-gated. A production deploy would add a block-height dispute window on a network that exposes one.
- **A determined proposer could use a second wallet** to finalize — the guard raises the cost of
  sniping rather than making it impossible without time. Combined with bonded appeals and the on-chain
  ruling history, gaming attempts are visible and contestable.
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
contracts/     delphi.py       (the Intelligent Contract, v3)
tests/direct/  test_delphi.py  (28 direct-mode tests, pytest)
web/           Next.js + GenLayerJS frontend
```

## Contract
- **Address:** `0xE223B27964920c49322e80a59AB1983364776368`
- **Network:** GenLayer Studionet (chain 61999)
- **Open in Studio:** [GenLayer Studio](https://studio.genlayer.com/?import-contract=0xE223B27964920c49322e80a59AB1983364776368)

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
