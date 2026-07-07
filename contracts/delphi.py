# v0.1.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# Delphi — AI-resolved multi-outcome prediction markets (v2).
# Users stake GEN on the options of a question; the contract holds per-option pools. To settle,
# an AI-validator panel fetches the resolution source and rules which option won (or UNCLEAR).
# v2 adds: (1) an optional creator fee skimmed from winners' payouts; (2) an appeal window —
# resolve() proposes a ruling without paying, the losing side may appeal once for a more rigorous
# re-read, then finalize() locks it in and opens claims.
#
# Lifecycle (action-gated; GenVM has no wall-clock):
#   OPEN -(close_market)-> CLOSED -(resolve)-> PROPOSED -(finalize)-> RESOLVED  (winners claim)
#                                                                  -> REFUNDING (UNCLEAR; all refund)
#   PROPOSED -(appeal, once)-> PROPOSED (ruling re-examined)

from genlayer import *
import json

MAX_OPTIONS = 10
MAX_TEXT = 4000
MAX_FEE_BPS = 500  # creator fee capped at 5%

_PRINCIPLE = (
    "Outputs are equivalent if they contain a winning_option field with the same value "
    "(an integer index or the string 'UNCLEAR'), even if the confidence level, reasons, "
    "risk_flags, or other fields differ in wording or content."
)


# ------------------------------------------------------------------- helpers (deterministic)
def _is_url(u: str) -> bool:
    u = u.strip()
    return (u.startswith("http://") or u.startswith("https://")) and len(u) <= 2048


def _parse_json(raw: str):
    s = raw.strip().replace("```json", "").replace("```", "").strip()
    start, end = s.find("{"), s.rfind("}")
    if start == -1 or end == -1:
        raise gl.vm.UserError("ruling did not return JSON")
    return json.loads(s[start:end + 1])


def _resolve_prompt(question: str, options, source_text: str, criteria: str, appeal: bool) -> str:
    opts = "\n".join(f"{i}: {o}" for i, o in enumerate(options))
    appeal_note = ""
    if appeal:
        appeal_note = (
            "\nThis is an APPEAL of a prior ruling. Re-examine the source especially rigorously and "
            "judge independently; do not simply defer to the earlier decision.\n"
        )
    return f"""You are an impartial oracle resolving a prediction market based ONLY on the fetched source.{appeal_note}

Question:
\"\"\"
{question}
\"\"\"

Options (return the integer index of the option that actually occurred):
{opts}

Resolution criteria:
\"\"\"
{criteria}
\"\"\"

Fetched source (truncated):
\"\"\"
{source_text}
\"\"\"

Rules:
- Return VALID JSON ONLY, no prose outside the object. Do not invent facts.
- winning_option = the integer index (0-based) of the option the source shows occurred.
- If the source is empty, unreachable, or does not clearly determine a winner, set
  winning_option to the string "UNCLEAR".
- confidence is one of: "LOW", "MEDIUM", "HIGH".

Respond ONLY with:
{{"winning_option":0,"confidence":"LOW","reasons":["..."],"risk_flags":[]}}"""


# ----------------------------------------------------------------------------------- contract
# Empty EVM interface: paying a wallet is an external message through the
# chain layer (executed by the IC's ghost contract), NOT a GenVM call —
# gl.get_contract_at(...).emit_transfer at an EOA errors at finalization
# and the value is stranded. Proven empirically on Curia round 1.
@gl.evm.contract_interface
class _Payee:
    class View:
        pass
    class Write:
        pass


class Delphi(gl.Contract):
    total_markets: u256
    total_open: u256
    total_resolved: u256
    total_volume: u256
    markets: TreeMap[str, str]
    market_index: TreeMap[str, str]
    stakes: TreeMap[str, str]
    staker_options: TreeMap[str, str]
    addr_markets: TreeMap[str, str]
    claimed: TreeMap[str, str]

    def __init__(self) -> None:
        self.total_markets = u256(0)
        self.total_open = u256(0)
        self.total_resolved = u256(0)
        self.total_volume = u256(0)
        self.markets = TreeMap()
        self.market_index = TreeMap()
        self.stakes = TreeMap()
        self.staker_options = TreeMap()
        self.addr_markets = TreeMap()
        self.claimed = TreeMap()

    # -------------------------------------------------------- internal helpers
    def _get(self, market_id: str):
        raw = self.markets.get(market_id, "")
        if not raw:
            raise gl.vm.UserError("market not found")
        return json.loads(raw)

    def _save(self, m: dict) -> None:
        self.markets[m["id"]] = json.dumps(m)

    def _pay(self, address: str, amount: int) -> None:
        if amount > 0:
            _Payee(Address(address)).emit_transfer(value=u256(amount), on="finalized")

    def _index_addr(self, address: str, market_id: str) -> None:
        keys = json.loads(self.addr_markets.get(address, "[]"))
        if market_id not in keys:
            keys.append(market_id)
        self.addr_markets[address] = json.dumps(keys)

    def _run_oracle(self, m: dict, appeal: bool) -> dict:
        question = m["question"]
        options = m["options"]
        uri = m["source_uri"]
        criteria = m["criteria"]

        def judge() -> str:
            page = gl.nondet.web.render(uri, mode="text")
            return gl.nondet.exec_prompt(_resolve_prompt(question, options, page[:6000], criteria, appeal))

        ruling = _parse_json(gl.eq_principle.prompt_comparative(judge, _PRINCIPLE))
        for key, default in (("reasons", []), ("risk_flags", []), ("confidence", "LOW")):
            if key not in ruling:
                ruling[key] = default
        return ruling

    # ----------------------------------------------------------------------------- writes
    @gl.public.write
    def create_market(self, question: str, options_json: str, source_uri: str, criteria: str, fee_bps: int) -> str:
        creator = str(gl.message.sender_address)
        q = question.strip()
        uri = source_uri.strip()
        crit = criteria.strip()
        fee = int(fee_bps)
        if not q or len(q) > MAX_TEXT:
            raise gl.vm.UserError("invalid question")
        if not crit or len(crit) > MAX_TEXT:
            raise gl.vm.UserError("invalid criteria")
        if not _is_url(uri):
            raise gl.vm.UserError("invalid source_uri")
        if fee < 0 or fee > MAX_FEE_BPS:
            raise gl.vm.UserError("fee_bps must be between 0 and 500 (0-5%)")
        options = json.loads(options_json)
        if not isinstance(options, list) or len(options) < 2 or len(options) > MAX_OPTIONS:
            raise gl.vm.UserError("provide between 2 and 10 options")
        clean = []
        for o in options:
            t = str(o).strip()
            if not t:
                raise gl.vm.UserError("options must be non-empty")
            clean.append(t)

        seq = int(self.total_markets)
        mid = f"m-{seq}"
        market = {
            "id": mid, "creator": creator, "question": q, "options": clean,
            "source_uri": uri, "criteria": crit, "fee_bps": fee, "status": "OPEN",
            "total_pool": "0", "pools": ["0"] * len(clean),
            "winning_option": None, "ruling": None, "appealed": False, "created_seq": seq,
        }
        self._save(market)
        self.market_index[str(seq)] = mid
        self.total_markets = u256(seq + 1)
        self.total_open = u256(int(self.total_open) + 1)
        return json.dumps(market)

    @gl.public.write.payable
    def stake(self, market_id: str, option_idx: int) -> str:
        m = self._get(market_id)
        if m["status"] != "OPEN":
            raise gl.vm.UserError("market is not open for staking")
        idx = int(option_idx)
        if idx < 0 or idx >= len(m["options"]):
            raise gl.vm.UserError("invalid option")
        amount = int(gl.message.value)
        if amount <= 0:
            raise gl.vm.UserError("stake must be > 0 (send value with this call)")
        sender = str(gl.message.sender_address)

        skey = f"{market_id}:{sender}:{idx}"
        self.stakes[skey] = str(int(self.stakes.get(skey, "0")) + amount)
        m["pools"][idx] = str(int(m["pools"][idx]) + amount)
        m["total_pool"] = str(int(m["total_pool"]) + amount)
        self._save(m)

        okey = f"{market_id}:{sender}"
        opts = json.loads(self.staker_options.get(okey, "[]"))
        if idx not in opts:
            opts.append(idx)
            self.staker_options[okey] = json.dumps(opts)
        self._index_addr(sender, market_id)
        self.total_volume = u256(int(self.total_volume) + amount)
        return json.dumps(m)

    @gl.public.write
    def close_market(self, market_id: str) -> str:
        m = self._get(market_id)
        if str(gl.message.sender_address).lower() != m["creator"].lower():
            raise gl.vm.UserError("only the creator may close this market")
        if m["status"] != "OPEN":
            raise gl.vm.UserError("market is not open")
        m["status"] = "CLOSED"
        self._save(m)
        self.total_open = u256(max(0, int(self.total_open) - 1))
        return json.dumps(m)

    @gl.public.write
    def resolve(self, market_id: str) -> str:
        # Propose a ruling (no payout yet) — opens the appeal window.
        m = self._get(market_id)
        if m["status"] != "CLOSED":
            raise gl.vm.UserError("market must be CLOSED before resolving")
        m["ruling"] = self._run_oracle(m, False)
        m["status"] = "PROPOSED"
        self._save(m)
        return json.dumps(m)

    @gl.public.write
    def appeal(self, market_id: str) -> str:
        m = self._get(market_id)
        sender = str(gl.message.sender_address)
        if m["status"] != "PROPOSED":
            raise gl.vm.UserError("only a proposed (not yet finalized) market can be appealed")
        if m["appealed"]:
            raise gl.vm.UserError("this market has already been appealed once")
        # only someone who staked in THIS market may appeal
        if not self.staker_options.get(f"{market_id}:{sender}", ""):
            raise gl.vm.UserError("only a staker in this market may appeal")
        m["ruling"] = self._run_oracle(m, True)
        m["appealed"] = True
        self._save(m)
        return json.dumps(m)

    @gl.public.write
    def finalize(self, market_id: str) -> str:
        # Lock the proposed ruling in and open claims.
        m = self._get(market_id)
        if m["status"] != "PROPOSED":
            raise gl.vm.UserError("market is not in a finalizable (PROPOSED) state")
        ruling = m.get("ruling") or {}
        win = ruling.get("winning_option", "UNCLEAR")
        valid = isinstance(win, int) and 0 <= win < len(m["options"])
        if not valid or ruling.get("confidence") == "LOW" or int(m["pools"][win]) == 0:
            m["status"] = "REFUNDING"
            self._save(m)
            return json.dumps(m)
        m["winning_option"] = win
        m["status"] = "RESOLVED"
        self._save(m)
        self.total_resolved = u256(int(self.total_resolved) + 1)
        return json.dumps(m)

    @gl.public.write
    def claim(self, market_id: str) -> str:
        m = self._get(market_id)
        sender = str(gl.message.sender_address)
        ckey = f"{market_id}:{sender}"
        if self.claimed.get(ckey, "") == "1":
            raise gl.vm.UserError("already claimed")

        if m["status"] == "RESOLVED":
            win = int(m["winning_option"])
            winning_pool = int(m["pools"][win])
            total_pool = int(m["total_pool"])
            mine = int(self.stakes.get(f"{market_id}:{sender}:{win}", "0"))
            if mine == 0:
                raise gl.vm.UserError("no winning stake to claim")
            gross = mine * total_pool // winning_pool
            fee = gross * int(m.get("fee_bps", 0)) // 10000
            self.claimed[ckey] = "1"
            self._pay(sender, gross - fee)
            self._pay(m["creator"], fee)
            return json.dumps({"market_id": market_id, "paid": str(gross - fee), "fee": str(fee), "kind": "winnings"})

        if m["status"] == "REFUNDING":
            total = 0
            for idx in json.loads(self.staker_options.get(f"{market_id}:{sender}", "[]")):
                total += int(self.stakes.get(f"{market_id}:{sender}:{idx}", "0"))
            if total == 0:
                raise gl.vm.UserError("nothing to refund")
            self.claimed[ckey] = "1"
            self._pay(sender, total)
            return json.dumps({"market_id": market_id, "paid": str(total), "fee": "0", "kind": "refund"})

        raise gl.vm.UserError("market is not claimable yet")

    # ------------------------------------------------------------------------------ views
    @gl.public.view
    def get_market(self, market_id: str) -> str:
        return self.markets.get(market_id, "")

    @gl.public.view
    def list_markets(self, n: int) -> str:
        out = []
        total = int(self.total_markets)
        i = total - 1
        stop = max(-1, total - 1 - n)
        while i > stop:
            mid = self.market_index.get(str(i), "")
            if mid:
                raw = self.markets.get(mid, "")
                if raw:
                    out.append(json.loads(raw))
            i -= 1
        return json.dumps(out)

    @gl.public.view
    def get_positions(self, address: str) -> str:
        out = []
        for mid in json.loads(self.addr_markets.get(address, "[]")):
            if not self.markets.get(mid, ""):
                continue
            stakes_list = []
            for idx in json.loads(self.staker_options.get(f"{mid}:{address}", "[]")):
                stakes_list.append({"option": idx, "amount": self.stakes.get(f"{mid}:{address}:{idx}", "0")})
            out.append({
                "market_id": mid,
                "stakes": stakes_list,
                "claimed": self.claimed.get(f"{mid}:{address}", "") == "1",
            })
        return json.dumps(out)

    @gl.public.view
    def get_stats(self) -> str:
        return json.dumps({
            "total_markets": int(self.total_markets),
            "total_open": int(self.total_open),
            "total_resolved": int(self.total_resolved),
            "total_volume": str(int(self.total_volume)),
        })
