from calculator import (
    calculate_scope_1,
    adjust_confidence,
    uncertainty_pct,
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


def test_fuel_totals_use_the_sourced_litre_factors():
    # Closed-source input: litres per year, no vehicle detail. Diesel 2.68 kg/L (IPCC-derived).
    result = calculate_scope_1(None, None, conversion_factors,
                               fuel_totals=[{"fuel_type": "diesel", "litres_per_year": 1000}])
    assert result["total_co2e_kg"] == 2680
    assert result["unverified_inputs"] == []


def test_overview_confidence_is_plus_minus_40_percent():
    assert uncertainty_pct("overview_only") == 50  # unknown label keeps the widest band
    assert uncertainty_pct("overview") == 40
    result = adjust_confidence({"total_co2e_kg": 1000}, "overview")
    assert result["co2e_range_kg"] == {"low": 600.0, "high": 1400.0}


def test_illustrative_factors_are_used_and_reported():
    hardware = [{"device_type": "Laptop", "quantity": 10}]
    result = calculate_scope_3(None, hardware, None, None, conversion_factors)
    assert result["categories"]["3.2_hardware"]["total_co2e_kg"] == 10 * 30
    assert "scope_3.hardware.laptop.embodied_carbon_factor" in result["illustrative_inputs"]
    assert not any("laptop" in item for item in result["unverified_inputs"])


def test_cloud_usage_rows_use_the_gpu_factor():
    cloud = [{"instance_type": "gpu-a100-x4", "usage_hours": 500, "cost": 40000}]
    result = calculate_scope_3(cloud, None, None, None, conversion_factors)
    assert result["categories"]["3.1_cloud"]["total_co2e_kg"] == 500 * 0.4
    assert "scope_3.cloud.gpu.factor" in result["illustrative_inputs"]


def test_unknown_cloud_instance_stays_unverified():
    cloud = [{"instance_type": "t3.medium", "usage_hours": 500, "cost": 100}]
    result = calculate_scope_3(cloud, None, None, None, conversion_factors)
    assert result["categories"]["3.1_cloud"]["total_co2e_kg"] == 0
    assert any("t3.medium" in item for item in result["unverified_inputs"])


def test_all_scopes_collects_illustrative_inputs_at_top_level():
    intake = {
        "scopes": {"scope_3": {"commute": {"total_employees": 10, "avg_distance_km": 10,
                                            "mode_split": {"car": 1.0}}}},
        "confidence_metadata": {"scope_3": "partial_data"},
    }
    result = calculate_all_scopes(intake)
    assert "scope_3.commute.car.factor" in result["illustrative_inputs"]
