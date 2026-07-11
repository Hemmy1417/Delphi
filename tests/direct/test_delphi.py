"""
Direct-mode tests for delphi.py — the deterministic surface of the prediction
market contract without GenLayer's AI/consensus stack. Run with:
    python -m pytest tests/direct -q

The genlayer runtime is stubbed (strict Address that refuses double-wrapping,
a _Payee proxy that records transfers, a primeable oracle). The AI ruling is
exercised by priming exec_prompt with a canned JSON verdict — the input
builder still runs, so multi-source fetching, unreachable-source handling and
the prompt contents are all covered deterministically.
"""

import importlib.util
import json
import pathlib
import sys
import types
import pytest


CONTRACT_PATH = pathlib.Path(__file__).resolve().parents[2] / "contracts" / "delphi.py"


# ── GenLayer runtime stubs ───────────────────────────────────────────────────

class _UserError(Exception):
    pass


class _VmModule:
    UserError = _UserError


class _TreeMap(dict):
    def get(self, k, default=None):
        return super().get(k, default)


class _U256(int):
    def __new__(cls, v):
        return super().__new__(cls, int(v))


class _Address(str):
    """Mirrors GenVM strictness: Address() must never wrap another Address."""
    def __new__(cls, v):
        if isinstance(v, _Address):
            raise TypeError("cannot convert 'Address' object to bytes")
        return super().__new__(cls, v)


class _PublicViewDeco:
    def __call__(self, fn):
        return fn


class _PublicWriteDeco:
    payable = staticmethod(lambda fn: fn)

    def __call__(self, fn):
        return fn


class _Public:
    view = _PublicViewDeco()
    write = _PublicWriteDeco()


class _FakeEmit:
    def __init__(self):
        self.transfers = []   # (to, value, on)

    def total_to(self, addr):
        return sum(v for (t, v, _) in self.transfers if t.lower() == addr.lower())


class _Evm:
    @staticmethod
    def contract_interface(cls):
        class _Proxy:
            def __init__(self, addr):
                self._addr = str(addr)

            def emit_transfer(self, value, on=None):
                _GL._emit.transfers.append((self._addr, int(value), on))
        return _Proxy


class _NondetWeb:
    @staticmethod
    def render(url, mode="text"):
        if "unreachable" in url:
            raise RuntimeError("403 blocked")
        return f"[stub page text from {url}]"


class _Nondet:
    web = _NondetWeb()

    @staticmethod
    def exec_prompt(task):
        _EqPrinciple.last_input = task
        return _EqPrinciple.canned


class _EqPrinciple:
    canned = '{"winning_option": 0, "confidence": "HIGH", "reasons": ["stub"], "risk_flags": []}'
    last_input = None

    @classmethod
    def prompt_comparative(cls, fn, principle):
        return fn()


class _GL:
    class Contract:
        pass

    evm = _Evm()
    nondet = _Nondet()
    eq_principle = _EqPrinciple
    public = _Public()
    vm = _VmModule

    class message:
        sender_address = "0x0000000000000000000000000000000000000000"
        value = 0

    _emit = None


def _install_stub():
    mod = types.ModuleType("genlayer")
    mod.gl = _GL
    mod.TreeMap = _TreeMap
    mod.u256 = _U256
    mod.Address = _Address
    mod.__all__ = ["gl", "TreeMap", "u256", "Address"]
    sys.modules["genlayer"] = mod


_install_stub()


def _load_contract():
    spec = importlib.util.spec_from_file_location("delphi_contract", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ── Fixtures ─────────────────────────────────────────────────────────────────

CREATOR = "0x1111111111111111111111111111111111111111"
ALICE   = "0x2222222222222222222222222222222222222222"
BOB     = "0x3333333333333333333333333333333333333333"
CAROL   = "0x4444444444444444444444444444444444444444"
GEN = 10 ** 18
SRC1 = "https://api.example.com/result.json"
SRC2 = "https://mirror.example.org/result"


@pytest.fixture
def module():
    return _load_contract()


@pytest.fixture
def contract(module):
    module.gl.message.sender_address = CREATOR
    module.gl.message.value = 0
    module.gl._emit = _FakeEmit()
    return module.Delphi()


def _as(module, sender, value=0):
    module.gl.message.sender_address = sender
    module.gl.message.value = value


def _prime(module, winning_option, confidence="HIGH"):
    module.gl.eq_principle.canned = json.dumps(
        {"winning_option": winning_option, "confidence": confidence,
         "reasons": ["stub"], "risk_flags": []}
    )


def _mk(module, contract, uris=None, fee_bps=200):
    _as(module, CREATOR, 0)
    raw = contract.create_market(
        "Will X happen?", json.dumps(["Yes", "No"]),
        json.dumps(uris or [SRC1]), "Rule from the pinned sources.", fee_bps,
    )
    return json.loads(raw)["id"]


def _stake(module, contract, mid, who, idx, amount):
    _as(module, who, amount)
    contract.stake(mid, idx)


def _to_proposed(module, contract, uris=None, win=0):
    """create → alice YES 1 GEN, bob NO 1 GEN → close → resolve (by CAROL)."""
    mid = _mk(module, contract, uris)
    _stake(module, contract, mid, ALICE, 0, GEN)
    _stake(module, contract, mid, BOB, 1, GEN)
    _as(module, CREATOR, 0)
    contract.close_market(mid)
    _prime(module, win)
    _as(module, CAROL, 0)
    contract.resolve(mid)
    return mid


# ── create_market: pinned multi-source evidence ──────────────────────────────

def test_create_pins_multiple_sources(module, contract):
    mid = _mk(module, contract, uris=[SRC1, SRC2])
    m = json.loads(contract.get_market(mid))
    assert m["source_uris"] == [SRC1, SRC2]
    assert m["source_uri"] == SRC1          # kept for older readers


def test_create_accepts_cli_decoded_lists(module, contract):
    # regression: the genlayer CLI decodes JSON-array args into REAL lists
    # before the contract sees them (genlayer-js sends strings) — json.loads
    # on a list crashed create_market on-chain. Both shapes must work.
    _as(module, CREATOR, 0)
    raw = contract.create_market("Q?", ["Yes", "No"], [SRC1, SRC2], "crit", 0)
    m = json.loads(raw)
    assert m["options"] == ["Yes", "No"]
    assert m["source_uris"] == [SRC1, SRC2]


def test_create_rejects_zero_and_too_many_sources(module, contract):
    _as(module, CREATOR, 0)
    with pytest.raises(module.gl.vm.UserError, match="between 1 and 3"):
        contract.create_market("Q?", json.dumps(["A", "B"]), json.dumps([]), "crit", 0)
    with pytest.raises(module.gl.vm.UserError, match="between 1 and 3"):
        contract.create_market("Q?", json.dumps(["A", "B"]),
                               json.dumps([SRC1, SRC2, SRC1 + "x", SRC2 + "y"]), "crit", 0)


def test_create_rejects_bad_and_duplicate_urls(module, contract):
    _as(module, CREATOR, 0)
    with pytest.raises(module.gl.vm.UserError, match="invalid source URL"):
        contract.create_market("Q?", json.dumps(["A", "B"]), json.dumps(["ftp://nope"]), "crit", 0)
    with pytest.raises(module.gl.vm.UserError, match="duplicate"):
        contract.create_market("Q?", json.dumps(["A", "B"]), json.dumps([SRC1, SRC1]), "crit", 0)


def test_create_rejects_fee_above_cap(module, contract):
    _as(module, CREATOR, 0)
    with pytest.raises(module.gl.vm.UserError, match="fee_bps"):
        contract.create_market("Q?", json.dumps(["A", "B"]), json.dumps([SRC1]), "crit", 501)


def test_oracle_reads_every_pinned_source(module, contract):
    mid = _mk(module, contract, uris=[SRC1, SRC2])
    _stake(module, contract, mid, ALICE, 0, GEN)
    _as(module, CREATOR, 0)
    contract.close_market(mid)
    _prime(module, 0)
    _as(module, CAROL, 0)
    contract.resolve(mid)
    prompt = module.gl.eq_principle.last_input
    assert f"SOURCE 1 of 2 ({SRC1})" in prompt
    assert f"SOURCE 2 of 2 ({SRC2})" in prompt
    assert "pinned at market creation" in prompt


def test_one_unreachable_source_does_not_sink_resolution(module, contract):
    walled = "https://unreachable.example.com/page"
    mid = _mk(module, contract, uris=[walled, SRC2])
    _stake(module, contract, mid, ALICE, 0, GEN)
    _as(module, CREATOR, 0)
    contract.close_market(mid)
    _prime(module, 0)
    _as(module, CAROL, 0)
    m = json.loads(contract.resolve(mid))
    prompt = module.gl.eq_principle.last_input
    assert "UNREACHABLE" in prompt                 # reported to the panel
    assert f"({SRC2})" in prompt                   # readable source still present
    assert m["status"] == "PROPOSED"


# ── stake / unstake ──────────────────────────────────────────────────────────

def test_stake_updates_pools_and_book(module, contract):
    mid = _mk(module, contract)
    _stake(module, contract, mid, ALICE, 0, GEN)
    m = json.loads(contract.get_market(mid))
    assert m["pools"][0] == str(GEN)
    assert m["total_pool"] == str(GEN)
    stats = json.loads(contract.get_stats())
    assert stats["escrowed_wei"] == str(GEN)


def test_stake_requires_value_and_open_market(module, contract):
    mid = _mk(module, contract)
    _as(module, ALICE, 0)
    with pytest.raises(module.gl.vm.UserError, match="stake must be > 0"):
        contract.stake(mid, 0)
    _as(module, CREATOR, 0)
    contract.close_market(mid)
    _as(module, ALICE, GEN)
    with pytest.raises(module.gl.vm.UserError, match="not open"):
        contract.stake(mid, 0)


def test_unstake_returns_full_position(module, contract):
    mid = _mk(module, contract)
    _stake(module, contract, mid, ALICE, 0, GEN)
    _stake(module, contract, mid, ALICE, 1, GEN // 2)
    _as(module, ALICE, 0)
    out = json.loads(contract.unstake(mid))
    assert int(out["returned"]) == GEN + GEN // 2
    assert module.gl._emit.total_to(ALICE) == GEN + GEN // 2
    m = json.loads(contract.get_market(mid))
    assert m["total_pool"] == "0"
    assert json.loads(contract.get_stats())["escrowed_wei"] == "0"


def test_unstake_only_while_open_and_needs_stake(module, contract):
    mid = _mk(module, contract)
    _as(module, ALICE, 0)
    with pytest.raises(module.gl.vm.UserError, match="nothing staked"):
        contract.unstake(mid)
    _stake(module, contract, mid, ALICE, 0, GEN)
    _as(module, CREATOR, 0)
    contract.close_market(mid)
    _as(module, ALICE, 0)
    with pytest.raises(module.gl.vm.UserError, match="only possible while the market is OPEN"):
        contract.unstake(mid)


def test_restake_after_unstake_works(module, contract):
    mid = _mk(module, contract)
    _stake(module, contract, mid, ALICE, 0, GEN)
    _as(module, ALICE, 0)
    contract.unstake(mid)
    _stake(module, contract, mid, ALICE, 1, GEN)
    m = json.loads(contract.get_market(mid))
    assert m["pools"] == ["0", str(GEN)]


# ── lifecycle gates ──────────────────────────────────────────────────────────

def test_close_is_creator_only(module, contract):
    mid = _mk(module, contract)
    _as(module, ALICE, 0)
    with pytest.raises(module.gl.vm.UserError, match="only the creator"):
        contract.close_market(mid)


def test_resolve_requires_closed_and_records_resolver(module, contract):
    mid = _mk(module, contract)
    _as(module, CAROL, 0)
    with pytest.raises(module.gl.vm.UserError, match="must be CLOSED"):
        contract.resolve(mid)
    _stake(module, contract, mid, ALICE, 0, GEN)
    _as(module, CREATOR, 0)
    contract.close_market(mid)
    _prime(module, 0)
    _as(module, CAROL, 0)
    m = json.loads(contract.resolve(mid))
    assert m["status"] == "PROPOSED"
    assert m["resolver"] == CAROL
    assert len(m["history"]) == 1 and m["history"][0]["round"] == "initial"


# ── the real appeal window: proposer cannot self-finalize ────────────────────

def test_resolver_cannot_finalize_unappealed(module, contract):
    mid = _to_proposed(module, contract)
    _as(module, CAROL, 0)                          # CAROL proposed the ruling
    with pytest.raises(module.gl.vm.UserError, match="cannot also finalize"):
        contract.finalize(mid)


def test_other_wallet_finalizes_to_resolved(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _as(module, BOB, 0)
    m = json.loads(contract.finalize(mid))
    assert m["status"] == "RESOLVED"
    assert m["winning_option"] == 0


def test_resolver_can_finalize_after_appeal(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _prime(module, 0)                              # appeal upholds
    _as(module, BOB, GEN // 50)                    # 0.02 GEN bond
    contract.appeal(mid)
    _as(module, CAROL, 0)                          # both rounds ran — window served
    m = json.loads(contract.finalize(mid))
    assert m["status"] == "RESOLVED"


def test_low_confidence_and_empty_pool_refund(module, contract):
    mid = _to_proposed(module, contract, win=0)
    m = json.loads(contract.get_market(mid))
    m["ruling"]["confidence"] = "LOW"
    contract.markets[mid] = json.dumps(m)
    _as(module, BOB, 0)
    assert json.loads(contract.finalize(mid))["status"] == "REFUNDING"

    mid2 = _mk(module, contract)
    _stake(module, contract, mid2, ALICE, 0, GEN)  # nobody staked option 1
    _as(module, CREATOR, 0)
    contract.close_market(mid2)
    _prime(module, 1)                              # winner is the empty pool
    _as(module, CAROL, 0)
    contract.resolve(mid2)
    _as(module, BOB, 0)
    assert json.loads(contract.finalize(mid2))["status"] == "REFUNDING"


# ── bonded appeals ───────────────────────────────────────────────────────────

def test_appeal_bond_quote(module, contract):
    mid = _to_proposed(module, contract)           # pool = 2 GEN → 1% = 0.02 GEN
    q = json.loads(contract.get_appeal_bond(mid))
    assert int(q["bond_wei"]) == 2 * GEN // 100

    small = _mk(module, contract)                  # tiny pool → floor applies
    _stake(module, contract, small, ALICE, 0, GEN // 10)
    q2 = json.loads(contract.get_appeal_bond(small))
    assert int(q2["bond_wei"]) == 10 ** 16         # min 0.01 GEN


def test_appeal_requires_bond_stake_and_single_shot(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _as(module, CAROL, GEN)                        # not a staker
    with pytest.raises(module.gl.vm.UserError, match="only a staker"):
        contract.appeal(mid)
    _as(module, BOB, 10 ** 15)                     # staker, bond too small
    with pytest.raises(module.gl.vm.UserError, match="requires a bond"):
        contract.appeal(mid)
    _prime(module, 0)
    _as(module, BOB, 2 * GEN // 100)
    m = json.loads(contract.appeal(mid))
    assert m["appealed"] is True
    assert len(m["history"]) == 2 and m["history"][1]["round"] == "appeal"
    _as(module, ALICE, 2 * GEN // 100)
    with pytest.raises(module.gl.vm.UserError, match="already been appealed"):
        contract.appeal(mid)


def test_flipped_appeal_returns_bond(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _prime(module, 1)                              # appeal flips YES → NO
    bond = 2 * GEN // 100
    _as(module, BOB, bond)
    m = json.loads(contract.appeal(mid))
    assert m["appeal_flipped"] is True
    _as(module, CAROL, 0)
    m = json.loads(contract.finalize(mid))
    assert m["status"] == "RESOLVED" and m["winning_option"] == 1
    assert module.gl._emit.total_to(BOB) == bond   # bond came home
    assert m["total_pool"] == str(2 * GEN)         # pool NOT inflated by bond


def test_upheld_appeal_bond_joins_winners_pool(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _prime(module, 0)                              # appeal upholds YES
    bond = 2 * GEN // 100
    _as(module, BOB, bond)
    m = json.loads(contract.appeal(mid))
    assert m["appeal_flipped"] is False
    _as(module, CAROL, 0)
    m = json.loads(contract.finalize(mid))
    assert m["total_pool"] == str(2 * GEN + bond)  # winners share the bond
    assert module.gl._emit.total_to(BOB) == 0      # nothing back


def test_refunding_after_appeal_returns_bond(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _prime(module, "UNCLEAR")                      # appeal ends in UNCLEAR
    bond = 2 * GEN // 100
    _as(module, BOB, bond)
    contract.appeal(mid)
    _as(module, CAROL, 0)
    m = json.loads(contract.finalize(mid))
    assert m["status"] == "REFUNDING"
    assert module.gl._emit.total_to(BOB) == bond


# ── claims + the solvency book ───────────────────────────────────────────────

def test_winner_claim_math_fee_and_book(module, contract):
    mid = _to_proposed(module, contract, win=0)    # fee 2%
    _as(module, BOB, 0)
    contract.finalize(mid)
    _as(module, ALICE, 0)
    out = json.loads(contract.claim(mid))
    gross = 2 * GEN                                # sole winner takes the pool
    fee = gross * 200 // 10000
    assert out["paid"] == str(gross - fee)
    assert module.gl._emit.total_to(ALICE) == gross - fee
    assert module.gl._emit.total_to(CREATOR) == fee
    stats = json.loads(contract.get_stats())
    assert stats["escrowed_wei"] == "0"            # book closed to zero
    assert stats["paid_out_wei"] == str(gross - fee)
    assert stats["fees_paid_wei"] == str(fee)


def test_loser_and_double_claims_blocked(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _as(module, BOB, 0)
    contract.finalize(mid)
    _as(module, BOB, 0)
    with pytest.raises(module.gl.vm.UserError, match="no winning stake"):
        contract.claim(mid)
    _as(module, ALICE, 0)
    contract.claim(mid)
    with pytest.raises(module.gl.vm.UserError, match="already claimed"):
        contract.claim(mid)


def test_refunding_claims_return_all_stakes(module, contract):
    mid = _to_proposed(module, contract, win=0)
    m = json.loads(contract.get_market(mid))
    m["ruling"]["confidence"] = "LOW"
    contract.markets[mid] = json.dumps(m)
    _as(module, BOB, 0)
    contract.finalize(mid)
    for who in (ALICE, BOB):
        _as(module, who, 0)
        out = json.loads(contract.claim(mid))
        assert out["kind"] == "refund" and out["paid"] == str(GEN)
        assert module.gl._emit.total_to(who) == GEN
    assert json.loads(contract.get_stats())["escrowed_wei"] == "0"


def test_upheld_bond_flows_to_winner_claim(module, contract):
    mid = _to_proposed(module, contract, win=0)
    bond = 2 * GEN // 100
    _prime(module, 0)
    _as(module, BOB, bond)
    contract.appeal(mid)
    _as(module, CAROL, 0)
    contract.finalize(mid)
    _as(module, ALICE, 0)
    out = json.loads(contract.claim(mid))
    gross = 2 * GEN + bond
    fee = gross * 200 // 10000
    assert out["paid"] == str(gross - fee)
    assert json.loads(contract.get_stats())["escrowed_wei"] == "0"


def test_stats_shape(module, contract):
    stats = json.loads(contract.get_stats())
    for key in ("total_markets", "total_open", "total_resolved", "total_volume",
                "escrowed_wei", "paid_out_wei", "fees_paid_wei", "total_appeals"):
        assert key in stats
