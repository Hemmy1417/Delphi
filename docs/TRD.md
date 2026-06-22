# Delphi — Technical Requirements (TRD v0.1)

## Stack
- **Intelligent Contract:** Python + GenVM on Studionet (chain 61999). Source of truth for markets,
  stakes, resolution, and payouts.
- **Frontend:** Next.js (App Router) · React · Tailwind v4 · GenLayerJS · viem. **Injected-wallet
  only** via EIP-6963 discovery (reuse Aegis's `lib/wallet.tsx`; no instant wallet — staking is real
  money). The chosen provider is passed to `createClient({ provider })` so the picked wallet signs.
- **Backend:** none. The contract decides everything; the frontend reads it directly.

## Value transfer (already pinned from Aegis)
- Receive: `@gl.public.write.payable`, amount in `gl.message.value` (a `u256`).
- Send: `gl.get_contract_at(Address(addr)).emit_transfer(value=u256(amount), on="finalized")`.

## Contract architecture
Action-gated lifecycle (no clock): `OPEN → CLOSED → RESOLVED` (or `OPEN/CLOSED → REFUNDING` on
`UNCLEAR`). Parimutuel pooled payouts, claim-based (winners pull).

### State (TreeMap/u256/str only — GenVM-safe)
- `total_markets: u256`
- `markets: TreeMap[str, str]` — `"m-<seq>"` → Market JSON
- `market_index: TreeMap[str, str]` — `str(seq)` → market_id (listing/feed)
- `stakes: TreeMap[str, str]` — `"<market_id>:<address>:<option_idx>"` → amount (wei, str)
- `option_pools: TreeMap[str, str]` — `"<market_id>:<option_idx>"` → pool total (wei, str)
- `staker_index: TreeMap[str, str]` — `"<market_id>:<address>"` → JSON list of option_idx staked
- `addr_markets: TreeMap[str, str]` — `<address>` → JSON list of market_ids touched
- `claimed: TreeMap[str, str]` — `"<market_id>:<address>"` → "1" once claimed (idempotency)

### Market JSON
`{ id, creator, question, options[], source_uri, criteria, status, total_pool, pools[],
   winning_option, ruling, created_seq }` (see SCHEMAS.md).

### Write methods
- `create_market(question, options_json, source_uri, criteria) -> str` — validate (≥2 options, valid
  URL, non-empty), status OPEN.
- `stake(market_id, option_idx) @payable -> str` — OPEN only; value>0; add to stake + option pool +
  total pool; index staker.
- `close_market(market_id) -> str` — creator only; OPEN → CLOSED.
- `resolve(market_id) -> str` — CLOSED only; run AI (web.render source + exec_prompt inside
  `eq_principle.prompt_comparative`); parse ruling. If `UNCLEAR`/low-confidence or winning pool == 0
  → status REFUNDING. Else store `winning_option` + ruling, status RESOLVED.
- `claim(market_id) -> str` — RESOLVED: pay `stake_on_winner / winning_pool * total_pool` to caller,
  mark claimed. REFUNDING: pay back the caller's total stake. Idempotent (claimed guard).

### Read methods (views, return JSON strings)
`get_market`, `list_markets(n)`, `get_stakes_by_address(market_id, address)` /
`get_positions(address)`, `get_stats`.

## Prompt design & consensus
Single LLM call inside `gl.eq_principle.prompt_comparative(fn, principle)`. Prompt: question +
numbered options + fetched source text (`gl.nondet.web.render(source_uri, "text")[:6000]`) +
criteria. Returns strict JSON `{winning_option, confidence, reasons, risk_flags}`. Equivalence
principle: outputs equivalent if they agree on `winning_option` (and the UNCLEAR flag), wording of
reasons may differ.

## Payout math (deterministic, after the AI block)
`winning_pool = pools[winning_option]`; `total_pool = sum(pools)`. Per claimer:
`payout = stake_on_winner * total_pool // winning_pool` (integer; dust from rounding stays in the
contract, negligible). REFUNDING returns the staker's summed stake across options.

## Environment
- `NEXT_PUBLIC_CONTRACT_ADDRESS` — deployed Delphi address.
- `NEXT_PUBLIC_EXPLORER_URL` — defaults to `https://explorer-studio.genlayer.com`.

## Deployment
GenLayer Studio → deploy `contracts/delphi.py` to Studionet → copy address into env + README →
Vercel (Root Directory = `web`, env var set).

## Testing
- Contract: create → stake (multiple options/addresses) → close → resolve (AI) → claim; UNCLEAR →
  refund path; idempotent claim; one-sided pool.
- Frontend: Vitest for pure helpers (gen↔wei, odds/payout math, status maps).

## Security / safety notes
- Reject: <2 options, empty question, invalid URL, zero stake, staking after CLOSED, double-claim,
  resolving an OPEN market, non-creator close.
- Checksum addresses on the frontend (EIP-55) so read-backs match (Credence/Aegis lesson).
- Funds only leave via `claim`/refund, gated by status + claimed guard.
