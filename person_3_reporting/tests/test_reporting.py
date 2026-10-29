import json
from pathlib import Path

import pytest

try:
    from person_3_reporting.knowledge_base import CONDITIONS, CONDITION_IDS, reduction_knowledge_base
    from person_3_reporting.reporting import (
        calculate_grade,
        format_inr,
        format_inr_short,
        generate_report,
        normalize_calc_results,
        rank_suggestions,
        render_html,
        render_markdown,
        render_text,
        run,
    )
except ImportError:
    from knowledge_base import CONDITIONS, CONDITION_IDS, reduction_knowledge_base
    from reporting import (
        calculate_grade,
        format_inr,
        format_inr_short,
        generate_report,
        normalize_calc_results,
        rank_suggestions,
        render_html,
        render_markdown,
        render_text,
        run,
    )


FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name):
    with (FIXTURES / name).open(encoding="utf-8") as file:
        return json.load(file)


@pytest.mark.parametrize(
    "fixture",
    ["master_contract.json", "person_3_brief.json", "minimal_messy.json"],
)
def test_normalizes_fixtures_without_exception(fixture):
    result = normalize_calc_results(load_fixture(fixture))
    assert set(result["scopes"]) == {"scope_1", "scope_2", "scope_3"}
    assert result["total_tons"] >= 0


def test_normalizes_master_and_legacy_aliases():
    master = normalize_calc_results(load_fixture("master_contract.json"))
    assert master["total_tons"] == 121
    assert master["tier"] == "tier_2"
    assert master["facts"]["dg_set_present"] is True
    legacy = normalize_calc_results(load_fixture("person_3_brief.json"))
    assert legacy["org_type"] == "school"
    assert legacy["scopes"]["scope_1"]["confidence"] == "±15%"


def test_all_knowledge_base_conditions_have_predicates_and_unknown_is_false():
    assert set(CONDITION_IDS) == set(CONDITIONS)
    assert all(item["applicable_when"] in CONDITIONS for item in reduction_knowledge_base)
    allowed, reason = CONDITIONS["dg_set_present"]({"dg_set_present": None})
    assert not allowed
    assert "unknown" in reason


def test_recommendation_roi_and_ordering():
    normalized = normalize_calc_results(
        {
            "tier": "tier_2",
            "org_type": "school",
            "activity_summary": {
                "dg_set_present": True,
                "commute_tons": 6,
                "e_waste_kg_per_month": 20,
                "solid_waste_kg_per_month": 500,
            },
            "scopes": {
                "scope_1": {"total_co2e_tons": 80},
                "scope_2": {"total_co2e_tons": 33},
                "scope_3": {"total_co2e_tons": 8},
            },
        }
    )
    suggestions, skipped = rank_suggestions(normalized)
    assert [item["action"] for item in suggestions] == [
        "Route optimization",
        "Carpooling and public transport",
        "Renewable energy procurement",
        "Composting",
        "E-waste recycling",
    ]
    assert [item["roi"] for item in suggestions] == [1.5, 1.0, 0.75, 0.667, 0.5]
    assert skipped and all("not an individual profile" in item for item in skipped)


def test_roi_values_for_all_actions():
    expected = {
        "cng_buses": 8 / 30,
        "route_optimization": 1.5,
        "dg_set_efficiency": 0.4,
        "renewable_procurement": 0.75,
        "rooftop_solar": 0.5,
        "commute_carpool": 1.0,
        "e_waste_recycling": 0.5,
        "composting": 2 / 3,
        "individual_commute_transit": 0.5 / 0.12,
        "individual_efficient_appliances": 0.3 / 0.15,
        "individual_green_power": 1.5 / 0.03,
        "individual_eco_driving": 0.1 / 0.04,
        "individual_home_composting": 0.1 / 0.03,
    }
    for action in reduction_knowledge_base:
        roi = action["carbon_saved_tons_per_year"] / (action["cost_inr"] / 100_000)
        assert roi == pytest.approx(expected[action["id"]])


@pytest.mark.parametrize(
    ("tons", "org_type", "employees", "grade"),
    [
        (0, "school", 200, "A"),
        (250, "school", 200, "B"),
        (300, "school", 200, "C"),
        (99999, "school", 200, "F"),
        (1.5, "individual", None, "B"),
        (600, "enterprise", 500, "B"),
        (50, "unknown", 200, "A"),
        (50, "school", None, "N/A"),
    ],
)
def test_grade_boundaries(tons, org_type, employees, grade):
    assert calculate_grade(tons, org_type, employees) == grade


def test_zero_and_missing_inputs_are_safe():
    zero = generate_report({"scopes": {key: {"total_co2e_tons": 0} for key in ("scope_1", "scope_2", "scope_3")}})
    assert zero["report"]["total_emissions"] == 0
    assert zero["report"]["top_drivers"] == []
    assert all(scope["pct"] == 0 for scope in zero["report"]["by_scope"].values())
    zero_json = json.dumps(zero)
    assert '"total_emissions": 0.0' in zero_json
    assert '"tons": 0.0' in zero_json
    missing = generate_report({})
    assert len(missing["report"]["warnings"]) >= 4
    # Nothing was calculated, so there is no grade. "A" would claim a clean result.
    assert missing["report"]["grade"] == "N/A"


def test_format_inr_cases():
    assert format_inr(3_000_000) == "₹30,00,000"
    assert format_inr(1000) == "₹1,000"
    assert format_inr_short(3_000_000) == "₹30.0 lakh"
    assert format_inr_short(12_000_000) == "₹1.2 crore"


def test_savings_cap_top_five_and_recurring_payback():
    data = {
        "tier": "tier_2",
        "activity_summary": {"e_waste_kg_per_month": 10, "solid_waste_kg_per_month": 500},
        "scopes": {
            "scope_1": {"total_co2e_tons": 80},
            "scope_2": {"total_co2e_tons": 33},
            "scope_3": {"total_co2e_tons": 0.6},
        },
    }
    actions, _ = rank_suggestions(normalize_calc_results(data))
    assert len(actions) <= 5
    capped = [action for action in actions if action["carbon_saved"] == 0.6]
    assert capped
    assert all("capped" in action["notes"] for action in capped)
    renewable = next(action for action in actions if action["id"] == "renewable_procurement")
    assert renewable["payback_display"] == "N/A (recurring cost)"


def test_report_shape_and_renderers_escape_html():
    report = generate_report(
        {
            "timestamp": "2026-10-28T13:00:00",
            "organization": "<Campus & Co>",
            "tier": "tier_2",
            "org_type": "school",
            "scopes": {
                "scope_1": {"total_co2e_tons": 80, "breakdown": [{"name": "<Bus>", "co2e_tons": 80}]},
                "scope_2": {"total_co2e_tons": 33},
                "scope_3": {"total_co2e_tons": 8},
            },
            "activity_summary": {"dg_set_present": True},
        }
    )
    body = report["report"]
    required = {
        "meta",
        "summary",
        "total_emissions",
        "grade",
        "grade_basis",
        "by_scope",
        "top_drivers",
        "top_5_actions",
        "methodology",
        "diagnostics",
        "warnings",
    }
    assert required <= body.keys()
    assert "N/A (no previous period provided)" == body["improvement_vs_last_period"]
    assert "&lt;Campus &amp; Co&gt;" in render_html(report)
    assert "# Scope Breakdown" in render_markdown(report)
    assert "EXECUTIVE SUMMARY" in render_text(report)


def test_tons_use_one_decimal_and_labels_are_cleaned():
    report = generate_report(load_fixture("master_contract.json"))
    body = report["report"]
    assert body["total_emissions"] == 121.0
    assert body["by_scope"]["scope_1"]["tons"] == 80.0
    assert any(driver["name"] == "Fleet vehicle (BUS_001)" for driver in body["top_drivers"])
    assert body["by_scope"]["scope_3"]["categories"][0]["name"] == "Hardware (embodied)"
    assert body["by_scope"]["scope_3"]["categories"][0]["tons"] == 6.0
    assert "co2e_kg" not in body["by_scope"]["scope_3"]["categories"][0]
    text = render_text(report)
    markdown = render_markdown(report)
    html_report = render_html(report)
    assert "80.0 t" in text
    assert "80.0" in markdown
    assert "80.0" in html_report
    assert "<meta charset=\"utf-8\">" in html_report
    assert "Action savings overlap and should not be summed." in text
    assert "Action savings overlap and should not be summed." in markdown
    assert "Action savings overlap and should not be summed." in html_report
    encoded_report = json.dumps(report, ensure_ascii=False)
    assert '"tons": 80.0' in encoded_report


def test_missing_scope_data_and_no_actions_message():
    report = generate_report({})
    body = report["report"]
    expected = (
        "No actions applied: emissions are below the action thresholds, or the activity data needed "
        "(for example DG set, waste or commute details) was not provided. See diagnostics."
    )
    assert body["actions_message"] == expected
    assert expected in render_text(report)
    assert expected in render_markdown(report)
    assert expected in render_html(report)
    assert "No data provided" in render_text(report)
    assert "No data provided" in render_markdown(report)
    assert "No data provided" in render_html(report)


def test_opex_cost_is_identified_as_recurring_annual_cost():
    data = {
        "tier": "tier_2",
        "activity_summary": {},
        "scopes": {
            "scope_1": {"total_co2e_tons": 0},
            "scope_2": {"total_co2e_tons": 33},
            "scope_3": {"total_co2e_tons": 0},
        },
    }
    report = generate_report(data)
    renewable = next(
        action for action in report["report"]["top_5_actions"]
        if action["action"] == "Renewable energy procurement"
    )
    assert "recurring annual cost" in renewable["cost_display"]
    assert "recurring annual cost" in render_text(report)


def test_run_writes_utf8_files_and_cli_fixtures(tmp_path):
    input_path = FIXTURES / "master_contract.json"
    output = run(input_path, tmp_path)
    assert output["report"]["total_emissions"] == 121
    with (tmp_path / "output.json").open(encoding="utf-8") as file:
        assert json.load(file)["report"]["meta"]["organization"] == "Not provided"
    assert "₹" in (tmp_path / "output.txt").read_text(encoding="utf-8")
    assert (tmp_path / "output.md").exists()
    assert (tmp_path / "output.html").exists()


@pytest.mark.parametrize(
    "fixture",
    ["master_contract.json", "person_3_brief.json", "minimal_messy.json"],
)
def test_run_accepts_all_fixtures(fixture, tmp_path):
    output = run(FIXTURES / fixture, tmp_path / fixture.replace(".json", ""))
    assert "report" in output


def test_llm_flag_does_not_invoke_an_llm():
    report = generate_report({}, use_llm=True)
    assert report["report"]["top_5_actions"] == []


def test_missing_input_fails_clearly(tmp_path):
    with pytest.raises(FileNotFoundError, match="Input calculation file not found"):
        run(tmp_path / "missing.json", tmp_path / "out")
