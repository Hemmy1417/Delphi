# Delphi — AI-resolved prediction markets on GenLayer

> Stake on the outcome of any real-world question. When it's settled, an AI-validator panel reads the
> resolution source and pays the winners — no central oracle.

**Status:** **Live.** Frontend deployed on Vercel, contract (creator fees + dispute appeals) on
**Studionet** (chain 61999) at `0xeCCfe310516DceCC25797fDB901705a5d60CE462`. The Next.js

> **Payout fix (July 2026).** Wallet payouts are sent as EVM external messages (an empty `@gl.evm.contract_interface` proxy executed by the contract's ghost account). The previous GenVM-call pattern errored at finalization on plain wallets and stranded the value; the contract was redeployed at the address above with the corrected transfer path.

frontend (`web/`, Bugatti-inspired monochrome) reads the live markets.

## Live demo
**https://delphi-markets.vercel.app** — live on Vercel, reading the contract on Testnet Bradbury.

## Project summary
Prediction markets need an **oracle** to decide what actually happened — normally a centralized,
trusted resolver. Delphi makes the oracle an **AI-validator panel** on GenLayer: the contract holds
the staked GEN, and at settlement it fetches the resolution source, judges which option won, and pays
the winners from the pool. Pooled (parimutuel) odds, claim-based payouts, refund on an unclear result.

**GenLayer advantage:** resolving a market needs live web access + AI judgement *and* a binding
on-chain payout. A normal contract can't fetch or judge; a centralized oracle isn't trustless.
GenLayer's validator consensus *is* the decentralized oracle.

## How it works
1. **Create** a market: a question, 2+ options, a public resolution-source URL + criteria.
2. **Stake** GEN on an option — pools build per option.
3. **Close** betting, then **resolve** — the AI panel reads the source and rules the winner.
4. **Claim** — winners split the total pool pro-rata; an unclear result refunds everyone.

## Tech stack
- **Intelligent Contract:** Python + GenVM (markets, stakes, AI resolution, payouts — source of truth)
- **Frontend:** Next.js · React · Tailwind · GenLayerJS · viem; injected-wallet only (EIP-6963)
- **Backend:** none

## Repo layout
```
docs/        PRD.md TRD.md SDLC.md SCHEMAS.md
contracts/   delphi.py     (the Intelligent Contract — Phase 1)
web/         Next.js + GenLayerJS frontend (Phase 2)
```

## Network
**Testnet Bradbury** — chain ID `4221`, RPC `https://rpc-bradbury.genlayer.com`, explorer
`https://explorer-bradbury.genlayer.com`. (Set `NEXT_PUBLIC_NETWORK=studionet` to run on the
sponsored-gas Studio sandbox instead.)

_Sibling projects:_ [Credence](https://github.com/Hemmy1417/Credence) (identity) ·
[Aegis](https://github.com/Hemmy1417/Aegis) (AI-arbitrated escrow).
