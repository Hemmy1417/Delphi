# Delphi — Product Requirements (PRD v0.1)

> Multi-outcome prediction markets on GenLayer, resolved by an AI-validator panel instead of a
> central oracle.

## One-line pitch
Stake on the outcome of any real-world question; when it's settled, an AI-validator panel reads the
resolution source and pays the winners — no central oracle.

## Problem
Prediction markets live or die by their **oracle** — who decides what actually happened.
Centralized oracles are a single point of trust/failure; pure smart contracts can't read a webpage
or judge a nuanced real-world outcome. So markets either trust a human resolver or can't resolve
anything subtle.

## Target users
Anyone who wants to forecast/bet on real-world events trustlessly; communities forecasting
milestones; DAOs settling internal questions.

## Why GenLayer (the core)
Resolving a market needs three things at once: **fetch a live web source**, **judge which outcome
occurred**, and **pay out on-chain**. A normal contract can't fetch or judge; a centralized oracle
isn't trustless. **GenLayer's AI-validator consensus *is* the decentralized oracle.** This is the
canonical GenLayer use case and shows web-resolved settlement — a superpower neither Credence
(identity) nor Aegis (escrow arbitration) fully demonstrated.

## Core GenLayer decision
Given the question, the named options, and the resolution source (URL + criteria), return the
**winning option** (or `UNCLEAR`), with confidence + reasons.

## Market model — parimutuel (pooled)
Each option has a pool. Everyone who staked on the **winning** option splits the **total** pool
pro-rata:

```
payout = your_stake / winning_pool * total_pool
```

No order book / AMM — pooled odds are the right fit for oracle-resolved markets and keep the MVP
simple.

## User flows
1. **Create** — question + 2+ named options + a public **resolution source URL** + plain-English
   criteria for how it resolves.
2. **Stake** — users stake GEN on an option (escrowed in the contract); pools build per option.
3. **Close** — creator/anyone closes betting (action-gated; GenVM has no wall-clock).
4. **Resolve** — anyone triggers → the AI fetches the source + rules the winning option (or
   `UNCLEAR`).
5. **Claim** — winners pull their share; `UNCLEAR` → everyone reclaims their original stake.

## MVP features
- create / stake / close / resolve (AI) / claim, plus refund-on-`UNCLEAR`
- views: `get_market`, `list_markets`, `get_stakes_by_address`, `get_stats`
- frontend: markets list, market detail (live pools + odds + stake UI), create form, "my positions /
  claims". Injected-wallet-only (EIP-6963).

## Out of scope (MVP)
Time/block-based close, market fees, AMM/order-book pricing, liquidity provision, conditional/scalar
markets, partial cash-out.

## Resolution / verdict structure
```json
{ "winning_option": 0, "confidence": "LOW|MEDIUM|HIGH", "reasons": ["..."], "risk_flags": ["..."] }
```
`winning_option` is the option index, or the string `"UNCLEAR"`.

## Risks & limitations
- **No on-chain clock** → close is action-gated, a mild trust assumption (documented honestly). Time/
  block-based close is future hardening.
- **Resolution-source fragility** is the #1 risk → guide creators hard toward anonymously-fetchable
  sources; `UNCLEAR` refunds rather than mis-pays.
- LLM/web variance; resolution depends on the source being reachable and unambiguous.
- If a winning option somehow has zero stakers, refund everyone.

## Demo / submission
Create a market on a reliably-fetchable question → stake on options → close → resolve (AI reads the
source, picks the winner) → winners claim. Deployed on Studionet; README + screenshots.
