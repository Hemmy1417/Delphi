<p align="center">
  <img src="https://raw.githubusercontent.com/Hemmy1417/Delphi/main/web/app/icon.svg" alt="Delphi" width="140" />
</p>

# Delphi - AI-Resolved Prediction Markets

**Multi-outcome markets settled by AI-validator consensus on GenLayer - no central oracle.**

Stake GEN on the outcome of any real-world question. At settlement, an AI-validator panel fetches
the evidence pinned at market creation, judges which option won, and the contract pays the winners
from the parimutuel pool. Every market is also a live **case before a panel**: anyone can reopen the
file and get a structured, multi-outcome brief on-chain.

Live app: **https://delphi-markets.vercel.app**

## What it is

- **The oracle is the consensus** - resolution needs live web access + AI judgement + a binding
  payout; GenLayer's validator panel is all three in one place.
- **Pinned evidence** - 1-3 resolution URLs are frozen at creation; nobody (the creator included)
  can swap the sources after money is staked.
- **Contract-enforced appeal deadline** - an unappealed ruling cannot be finalized by any wallet
  until consensus-fetched UTC proves the window passed.
- **The Internet Court** - permissionless `build_case_file` runs a panel investigation and files a
  multi-outcome brief on-chain; files append, never overwrite - the market's evidence timeline.
- **Funds-safety exit** - a staker can withdraw an entire position while a market is OPEN; an
  abandoned market can never trap money.

## How it works

### For creators
1. Create a market: a question, 2+ options, 1-3 pinned source URLs, resolution criteria, an
   optional fee (up to 5%), and an optional scheduled close time.
2. Let it trade - the odds chart draws itself from on-chain pool snapshots.
3. Close betting (or let the scheduled close pass - then anyone may close it).
4. Resolve - the panel reads the pinned sources and proposes a ruling.
5. After the appeal window, anyone finalizes; winners claim; your fee pays out on claims.

### For bettors
1. Browse live markets; the case file shows the panel's latest read on every option.
2. Stake GEN on an option - pools build per option, parimutuel style.
3. Withdraw fully any time before betting closes if you change your mind.
4. If you disagree with a proposed ruling, appeal once (bonded) for a rigorous re-read.
5. Claim your pro-rata share of the total pool when the market resolves your way.

## Resolution

| Result | Meaning |
|---|---|
| Option wins | The panel corroborated the outcome from the pinned sources - winners split the pool. |
| `UNCLEAR` | Sources dead, contradictory, or below the confidence floor - the market refunds everyone. |
| Refund | Every staker reclaims exactly what they put in; an appeal bond is returned too. |

An unreadable source is reported to the panel as unreachable rather than sinking the market;
unclear evidence pushes toward refunds - fail-safe, not fail-open.

## Market lifecycle

```text
OPEN -> CLOSED -> PROPOSED -> RESOLVED -> (claims)
  |                   |
  |                   -> REFUNDING -> (refund claims)
  -> VOID                                (creator cancel, zero stakes only)
```

| Status | What happens |
|---|---|
| `OPEN` | Betting live; stake and unstake freely; case files can be opened. |
| `CLOSED` | Betting over - manually by the creator, or by anyone once the scheduled close provably passed. |
| `PROPOSED` | A ruling is on the table; the enforced appeal window is running; no payouts yet. |
| `RESOLVED` | Ruling final - winners claim `stake x total_pool / winning_pool`, minus the creator fee. |
| `REFUNDING` | Unclear result - every staker reclaims their stake; any appeal bond returns. |
| `VOID` | Cancelled by the creator before anyone staked; immutable once a single stake lands. |

## GenLayer consensus functions

| Function | Kind | What runs under consensus |
|---|---|---|
| `resolve` | write | The panel fetches **all** pinned sources, requires corroboration, and agrees the winning option (or UNCLEAR) via `gl.eq_principle.prompt_comparative`. |
| `appeal` | write, payable | An independent re-read of the same pinned evidence; one per market, stakers only. |
| `build_case_file` | write, non-payable | A panel investigation filed on-chain: summary, per-source findings, the strongest case for every option, and a probability distribution across all options. |
| `suggest_market` | write | An AI clerk drafts a question, options, criteria, and sources - and flags ambiguity before the market opens. |
| `close_market` (scheduled path) | write | The fetched wall-clock must prove `close_at_epoch` has passed before a non-creator may close. |

## Contract

| Field | Value |
|---|---|
| Network | GenLayer Studionet |
| Chain ID | `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Explorer | `https://explorer-studio.genlayer.com` |
| Contract address | [`0xfCb9bF0b431BBDaeA051898Fa7d16eBA0b6eDc7E`](https://studio.genlayer.com/?import-contract=0xfCb9bF0b431BBDaeA051898Fa7d16eBA0b6eDc7E) |
| Source | `contracts/delphi.py` |

### Write methods

| Method | Who | Payable | Notes |
|---|---|---|---|
| `create_market(question, options_json, source_uris_json, criteria, fee_bps, close_at_epoch)` | anyone | - | Sources frozen forever at creation; fee capped at 5%. |
| `stake(market_id, option_idx)` | anyone | stake | Pools per option; odds snapshot recorded after every stake. |
| `unstake(market_id)` | staker | - | Full position exit while OPEN. |
| `close_market(market_id)` | creator, or anyone once due | - | The permissionless path needs the fetched clock to prove the scheduled close passed. |
| `cancel_market(market_id)` | creator | - | VOID - refused forever after the first stake. |
| `resolve(market_id)` | anyone | - | Proposes a ruling and stamps the appeal deadline. |
| `appeal(market_id)` | staker | bond | 1% of pool (min 0.01 GEN). Flip or refund returns it; upheld joins the winners' pool. |
| `finalize(market_id)` | not the resolver | - | Refused for any wallet until the appeal window provably passed. |
| `claim(market_id)` | staker | - | Pays the pro-rata share (or refund); idempotent. |
| `build_case_file(market_id)` | anyone | - | Appends a panel brief to the market's evidence timeline. |
| `suggest_market(topic, hint)` | anyone | - | Stores a draft the creator can refine in the UI. |

### Read methods

`get_market`, `list_markets`, `get_positions`, `get_stats`, `get_appeal_bond`, `get_case_files`,
`get_odds_history`, `get_draft`

### Consensus guarantees

- **Corroboration required** - the panel reads every pinned source; a single walled or dead link is
  reported as unreachable instead of deciding the market.
- **Injection-guarded** - fetched text is material under review, never instructions; a source
  demanding a verdict is flagged, not obeyed.
- **The clock fails closed** - consensus-fetched UTC (Cloudflare + Ethereum block time) enforces the
  appeal deadline and scheduled close; an outage can only lengthen a window.

## Verified end-to-end

Live 3-outcome case on the deployed contract:

```text
market  "Is the current Bitcoin block height below 900k, between 900k-1M, or above 1M?"
build_case_file -> panel read both pinned sources (height 958,540)
implied_distribution -> [0, 100, 0]   (900k-1M at 100%, HIGH confidence)
resolve -> 900k-1M wins; claims paid pro-rata
```

> The brief cited the exact height under the winning option and steelmanned the losing options
> from the same evidence - stored on-chain as filing #0 of the market's timeline.

Earlier four-market stress run: a dual-Wikipedia market resolved under consensus with an **upheld
bonded appeal** (forfeited bond joined the winners' pool; the claim paid pool + bond minus the
creator fee, balance-checked); a market with one login-walled source still resolved from the
readable one; a market with both sources dead ruled UNCLEAR and refunded everyone, returning the
appellant's bond; two keyless JSON price APIs corroborated a live-number market. **41 direct-mode
tests** cover the pricing math, bond settlement in all three outcomes, the appeal-deadline guard,
case files, odds history, scheduled close, cancel, and the book invariants.

## Tech stack

| Layer | Tech |
|---|---|
| Intelligent Contract | Python on GenVM (markets, pools, resolution, payouts) |
| Consensus | `gl.eq_principle.prompt_comparative` + nondet multi-source fetches |
| Frontend | Next.js (App Router), React, Tailwind v4 - Bugatti monochrome |
| Web3 | GenLayerJS, viem, EIP-6963 injected wallets |
| Backend | None - the contract is the source of truth |

## Repository

```text
contracts/delphi.py          The Intelligent Contract (v0.4, deployed)
tests/direct/test_delphi.py  41 direct-mode tests, pytest
web/                         Next.js frontend (markets, market court page, dashboard, positions)
docs/                        PRD, TRD, SDLC, schemas
```

## Getting started

```bash
# contract tests
python -m pytest tests/direct -q

# frontend
cd web
npm install
cp .env.example .env.local     # contract address prefilled for Studionet
npm run dev
```

## Security

- Evidence is pinned at creation - the resolution surface cannot be swapped after money is staked.
- The appeal deadline and scheduled close are enforced against consensus-fetched UTC and fail
  closed; no second wallet can snipe a window shut.
- Appeals are bonded; re-rolling consensus is never free.
- Case files are non-payable and permissionless, but every filing is a real validator investigation
  appended to an immutable timeline - not a stream you have to trust.
- Wallet payouts go through an empty `@gl.evm.contract_interface` proxy (`emit_transfer` at a plain
  wallet strands value - proven empirically).
- JSON-array arguments arrive as strings from genlayer-js but as decoded lists from the CLI; the
  contract accepts both.

## Design notes

- Parimutuel pools need no market maker and no liquidity bootstrapping; the odds are the crowd.
- Source quality is the creator's choice - pinning freezes the evidence, it doesn't bless it; the
  UI steers toward stable, anonymously-fetchable pages.
- The multi-outcome brief distributes probability across **all** options rather than collapsing to
  yes/no - the case file is the market's research desk, not a second oracle.

## Disclaimer

Delphi is a hackathon project on a test network. Staked GEN is testnet currency; do not use the
contract for real wagers without an audit.
