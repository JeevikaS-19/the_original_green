"""Checks for Person 2 -> Person 3 inputs: tier defaults, unverified inputs, zero totals."""

import copy

import pytest

try:
    from person_3_reporting.reporting import generate_report, normalize_calc_results
except ImportError:
    from reporting import generate_report, normalize_calc_results


def calc_payload(tier, unverified_scope_1=None, total_kg=(87100, 46452, 0)):
    scopes = {}
    for key, kg in zip(("scope_1", "scope_2", "scope_3"), total_kg):
        scopes[key] = {
            "total_co2e_kg": kg,
            "total_co2e_tons": kg / 1000,
            "confidence": "full",
            "unverified_inputs": list(unverified_scope_1) if key == "scope_1" and unverified_scope_1 else [],
        }
    return {
        "tier": tier,
        "scopes": scopes,
        "total": {"co2e_kg": sum(total_kg), "co2e_tons": sum(total_kg) / 1000},
        "unverified_inputs": [],
    }


@pytest.mark.parametrize("tier, org", [("tier_1", "individual"), ("tier_2", "school"), ("tier_3", "enterprise")])
def test_org_type_follows_tier_without_warning(tier, org):
    report = generate_report(calc_payload(tier))["report"]
    assert report["meta"]["org_type"] == org
    assert not any("Organization type" in warning for warning in report["warnings"])


def test_explicit_org_type_still_wins_over_tier():
    payload = calc_payload("tier_2")
    payload["org_type"] = "enterprise"
    assert normalize_calc_results(payload)["org_type"] == "enterprise"


def test_unverified_inputs_are_reported_as_warnings():
    payload = calc_payload("tier_2", unverified_scope_1=["scope_1.vehicle[BUS_001].fuel_factor"])
    warnings = generate_report(payload)["report"]["warnings"]
    assert any("Scope 1" in warning and "overstate" in warning for warning in warnings)


def test_missing_top_level_inputs_are_listed():
    payload = calc_payload("tier_2")
    payload["unverified_inputs"] = ["scope_1", "scope_3.cloud"]
    warnings = generate_report(payload)["report"]["warnings"]
    assert any("scope_1, scope_3.cloud" in warning for warning in warnings)


def test_zero_total_has_no_grade():
    report = generate_report(calc_payload("tier_2", total_kg=(0, 0, 0)))["report"]
    assert report["grade"] == "N/A"


def test_nonzero_total_still_graded():
    report = generate_report(calc_payload("tier_2"))["report"]
    assert report["grade"] == "B"


def test_input_payload_is_not_mutated():
    payload = calc_payload("tier_2", unverified_scope_1=["x"])
    before = copy.deepcopy(payload)
    generate_report(payload)
    assert payload == before
