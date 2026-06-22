# Delphi — Data Schemas

All contract views return JSON strings (frontend `JSON.parse`s them). Amounts are wei strings.

## Market
```json
{
  "id": "m-0",
  "creator": "0x…",
  "question": "Which team wins the Q3 hackathon?",
  "options": ["Team A", "Team B", "Team C"],
  "source_uri": "https://…/results",
  "criteria": "Resolves to the team listed as winner on the official results page.",
  "status": "OPEN | CLOSED | RESOLVED | REFUNDING",
  "total_pool": "0",
  "pools": ["0", "0", "0"],
  "winning_option": null,
  "ruling": null,
  "created_seq": 0
}
```

## Ruling (set on resolve)
```json
{
  "winning_option": 1,
  "confidence": "LOW | MEDIUM | HIGH",
  "reasons": ["The results page lists Team B as the winner."],
  "risk_flags": []
}
```
`winning_option` is an option index, or `"UNCLEAR"` (→ status REFUNDING, everyone reclaims stake).

## Position (per address, derived)
```json
{
  "market_id": "m-0",
  "stakes": [{ "option": 0, "amount": "1000000000000000000" }],
  "claimed": false
}
```

## Stats
```json
{ "total_markets": 0, "total_open": 0, "total_resolved": 0, "total_volume": "0" }
```

## Key formats
- market id: `m-<seq>`
- stake key: `<market_id>:<address>:<option_idx>`
- option pool key: `<market_id>:<option_idx>`
- claimed key: `<market_id>:<address>`
- payout (parimutuel): `stake_on_winner * total_pool // winning_pool`
