"""Hardcoded conversion factors used by the calculator.

Values without a user-provided citation are deliberately marked as
placeholders.  Each factor uses the same seven-field schema so callers can
inspect provenance and uncertainty consistently.
"""

from __future__ import annotations

from typing import Any


def _placeholder(
    value: Any,
    unit: str,
    *,
    low: Any = None,
    high: Any = None,
) -> dict[str, Any]:
    return {
        "value": value,
        "unit": unit,
        "low": low,
        "high": high,
        "source": "UNVERIFIED placeholder",
        "year": None,
        "status": "placeholder",
    }


def _verified(
    value: Any,
    unit: str,
    *,
    low: Any = None,
    high: Any = None,
    source: str,
    year: str,
) -> dict[str, Any]:
    return {
        "value": value,
        "unit": unit,
        "low": low,
        "high": high,
        "source": source,
        "year": year,
        "status": "verified",
    }


# TODO: update this all-India factor when the latest CEA version is approved.
GRID_FACTOR = _verified(
    0.79,
    "kg CO2e/kWh",
    source="CEA CO2 Baseline Database, weighted average",
    year="FY2019-20",
)

FUEL_FACTORS = {
    "diesel": _placeholder(2.68, "kg CO2e/L"),
    "petrol": _placeholder(2.31, "kg CO2e/L"),
    "lpg": _placeholder(None, "kg CO2e/L"),
    # CNG is commonly sold by mass, not litres; no litre value is assumed.
    "cng": _placeholder(None, "kg CO2e/L"),
}

FUEL_EFFICIENCY_FACTORS = {
    "bus": _placeholder(25, "L/100 km"),
    "car": _placeholder(7, "L/100 km"),
    "two_wheeler": _placeholder(3, "L/100 km"),
    "fuel_default": _placeholder(None, "L/100 km"),
}

INDIRECT_WATER_FACTOR = _placeholder(
    2.5,
    "L/kWh",
    low=2.0,
    high=3.0,
)

HARDWARE_EMBODIED_CARBON = {
    "laptop": _placeholder(None, "kg CO2e/device"),
    "desktop": _placeholder(None, "kg CO2e/device"),
    "monitor": _placeholder(None, "kg CO2e/device"),
    "server": _placeholder(None, "kg CO2e/device"),
}

COMMUTE_FACTORS = {
    "car": _placeholder(None, "kg CO2e/km"),
    "bus": _placeholder(None, "kg CO2e/km"),
    "bike": _placeholder(None, "kg CO2e/km"),
    "two_wheeler": _placeholder(None, "kg CO2e/km"),
    "wfh": _placeholder(0, "kg CO2e/km"),
}

WASTE_FACTORS = {
    ("solid waste", "landfill"): _placeholder(None, "kg CO2e/kg"),
    ("solid waste", "recycling"): _placeholder(None, "kg CO2e/kg"),
    ("e-waste", "recycling"): _placeholder(None, "kg CO2e/kg"),
    ("wastewater", "treatment"): _placeholder(None, "kg CO2e/kg"),
}

FUEL_PRICE_PER_LITRE = {
    "diesel": _placeholder(None, "INR/L"),
    "petrol": _placeholder(None, "INR/L"),
    "lpg": _placeholder(None, "INR/L"),
}

TARIFF_PER_KWH = _placeholder(None, "INR/kWh")


conversion_factors = {
    "grid": GRID_FACTOR,
    "fuel": FUEL_FACTORS,
    "fuel_efficiency": FUEL_EFFICIENCY_FACTORS,
    "indirect_water": INDIRECT_WATER_FACTOR,
    "hardware_embodied_carbon": HARDWARE_EMBODIED_CARBON,
    "commute": COMMUTE_FACTORS,
    "waste": WASTE_FACTORS,
    "fuel_price_per_litre": FUEL_PRICE_PER_LITRE,
    "tariff_per_kwh": TARIFF_PER_KWH,
}


def _walk_factors(value: Any, path: str = ""):
    if isinstance(value, dict) and {"value", "unit", "low", "high", "source", "year", "status"} <= value.keys():
        yield path, value
        return
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            yield from _walk_factors(child, child_path)


def list_unverified() -> list[str]:
    """Print and return every factor marked as a placeholder."""
    placeholders = [
        path
        for path, factor in _walk_factors(conversion_factors)
        if factor["status"] == "placeholder"
    ]
    for path in placeholders:
        print(f"{path}: placeholder")
    return placeholders
