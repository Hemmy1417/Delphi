# Delphi — SDLC / Phase Plan

Approval-gated phases. No jumping ahead; commit a working checkpoint after each.

| Phase | Goal | Exit criteria |
|---|---|---|
| **0** | Research + planning | Idea validated, PRD/TRD/SDLC/SCHEMAS committed. ✅ |
| **1** | Contract MVP | `delphi.py` deploys + schema-loads; create/stake/close/resolve(AI)/claim validated on-chain incl. a real AI resolution that pays winners, plus the UNCLEAR→refund path. |
| **2** | Frontend MVP | Injected-wallet connect; markets list, market detail (pools/odds + stake), create form, my positions/claims — all reading the live contract; one write flow works in-browser. |
| **3** | Testing + hardening | Edge cases (bad inputs, one-sided pools, double-claim, unreachable source), graceful read/tx states, Vitest suite, build clean, no secrets. |
| **4** | Deploy | GitHub (product-only) + Vercel live; README with contract address, demo flow, limitations. |
| **5** | Polish | Screenshots/video; optional time/block-based close; categories; fees. |

**No probe phase** — the `payable` + `emit_transfer` value API is already pinned from Aegis.

## Notes
- GenVM constraints carried from Credence/Aegis: 2-line runner header; `TreeMap`/`u256`/`str` state
  only (no `DynArray`); `-> str` returns (no `-> bool`); `gl.message.sender_address`/`.value`;
  `gl.vm.UserError`; web+LLM must run inside an `eq_principle` fn.
- Action-gated lifecycle because GenVM has no wall-clock.
- Claim-based, parimutuel payouts.
