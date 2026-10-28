from calculator import (
    COMMUTING_DAYS_PER_YEAR,
    calculate_all_scopes,
    calculate_scope_3,
    effective_completeness,
)
from factors import conversion_factors


def test_placeholder_input_lowers_confidence_one_level():
    assert effective_completeness("full_data", {"unverified_inputs": ["x"]}) == "partial"
    assert effective_completeness("partial", {"unverified_inputs": ["x"]}) == "missing"
    assert effective_completeness("missing", {"unverified_inputs": ["x"]}) == "missing"


def test_confidence_is_kept_when_all_inputs_are_verified():
    assert effective_completeness("full_data", {"unverified_inputs": []}) == "full_data"


def test_overview_label_with_placeholders_becomes_missing():
    assert effective_completeness("overview_only", {"unverified_inputs": ["x"]}) == "missing"


def test_all_scopes_reports_scope_level_gaps_at_top_level():
    intake = {
        "scopes": {
            "scope_1": {"vehicles": [{"vehicle_id": "BUS_1", "fuel_type": "cng", "annual_distance_km": 1000}]},
            "scope_2": {"energy_meter": {"monthly_kwh": 100, "region_state": "x"}},
            "scope_3": {"hardware": [{"device_type": "laptop", "quantity": 2}]},
        },
        "confidence_metadata": {"scope_1": "full_data", "scope_2": "full_data", "scope_3": "full_data"},
    }
    result = calculate_all_scopes(intake)
    assert result["scopes"]["scope_1"]["confidence"] == "partial"
    assert result["scopes"]["scope_3"]["confidence"] == "partial"
    top = result["unverified_inputs"]
    assert any(item.startswith("scope_1.vehicle[BUS_1]") for item in top)
    assert len(top) == len(set(top))


def test_commute_defaults_to_250_working_days():
    assert COMMUTING_DAYS_PER_YEAR == 250
    commute = {"total_employees": 10, "avg_distance_km": 10, "mode_split": {"car": 1.0}}
    factors = {"commute": {"car": {"value": 1.0, "unit": "kg", "status": "verified"}}}
    result = calculate_scope_3(None, None, commute, None, {**conversion_factors, **factors})
    assert result["categories"]["3.3_commute"]["total_co2e_kg"] == 10 * 10 * 250


def test_wastewater_uses_its_treatment_factor_by_default():
    # Regression: the default disposal for wastewater used to be "recycling",
    # which has no factor, so wastewater always came out as zero.
    verified = {"value": 0.5, "unit": "kg CO2e/kg", "status": "verified"}
    factors = {**conversion_factors, "waste": {("wastewater", "treatment"): verified}}
    waste = [{"category": "Wastewater", "mass_kg_per_month": 100}]
    result = calculate_scope_3(None, None, None, waste, factors)
    assert result["categories"]["3.4_waste"]["total_co2e_kg"] == 100 * 12 * 0.5
    assert not any("waste" in item for item in result["unverified_inputs"])
