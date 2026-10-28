from calculator import (
    adjust_confidence,
    calculate_all_scopes,
    calculate_scope_1,
    calculate_scope_2,
)
from factors import conversion_factors


def test_scope_1_uses_explicit_vehicle_efficiency_and_dg_fuel():
    result = calculate_scope_1(
        [
            {
                "vehicle_id": "CAR_001",
                "vehicle_type": "car",
                "fuel_type": "diesel",
                "annual_distance_km": 100,
                "fuel_efficiency_l_per_100km": 10,
            }
        ],
        {
            "fuel_type": "diesel",
            "hours_per_year": 2,
            "fuel_consumption_per_hour": 5,
        },
        conversion_factors,
    )

    assert result["total_co2e_kg"] == 53.6
    assert result["breakdown"][0]["annual_fuel_litres"] == 10


def test_scope_2_uses_all_india_grid_factor():
    result = calculate_scope_2({"monthly_kwh": 100}, conversion_factors)

    assert result["breakdown"]["electricity"]["region"] == "all-india"
    assert result["total_co2e_kg"] == 948


def test_missing_placeholder_factors_are_explicitly_unverified():
    result = calculate_all_scopes({
        "tier": "tier_2",
        "timestamp": "2026-10-28T13:00:00",
        "scopes": {
            "scope_1": {"vehicles": [], "dg_set": None},
            "scope_2": {"energy_meter": {"monthly_kwh": 1}},
            "scope_3": {"cloud": None, "hardware": [], "commute": None, "waste": []},
        },
    })

    assert result["scopes"]["scope_2"]["total_co2e_kg"] == 9.48
    assert "scope_3.cloud" in result["unverified_inputs"]


def test_adjust_confidence_adds_range():
    result = adjust_confidence({"total_co2e_kg": 100}, "full_data")

    assert result["uncertainty_pct"] == 10
    assert result["co2e_range_kg"] == {"low": 90, "high": 110}
