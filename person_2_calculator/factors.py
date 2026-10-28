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


def _sourced(
    value: Any,
    unit: str,
    *,
    source: str,
    year: str,
) -> dict[str, Any]:
    """Cited from a secondary source, primary document not yet checked. Usable, but flagged in the source text."""
    return {
        "value": value,
        "unit": unit,
        "low": None,
        "high": None,
        "source": source,
        "year": year,
        "status": "sourced",
    }


# All-India combined margin. Secondary sources report 0.757 for FY2023-24 (CEA baseline v20.0).
# Primary CEA PDF could not be opened during this check; confirm before the final submission.
GRID_FACTOR = _sourced(
    0.757,
    "kg CO2e/kWh",
    source="CEA CO2 Baseline Database v20.0, combined margin (secondary report; primary PDF to confirm)",
    year="FY2023-24",
)

# Litre factors derived from IPCC 2006 Vol 2 Ch 1 CO2 defaults (Table 1.4, kg/TJ)
# times default density and net calorific value (Table 1.2 NCV; densities typical).
# diesel: 0.84 kg/L x 43.0 MJ/kg x 74,100 kg/TJ = 2.68 kg/L
# petrol: 0.745 kg/L x 44.3 MJ/kg x 69,300 kg/TJ = 2.29 kg/L
# lpg:    0.54 kg/L x 47.3 MJ/kg x 63,100 kg/TJ = 1.61 kg/L
FUEL_FACTORS = {
    "diesel": _sourced(2.68, "kg CO2e/L", source="IPCC 2006 Vol 2 Ch 1 Table 1.4, derived", year="2006"),
    "petrol": _sourced(2.29, "kg CO2e/L", source="IPCC 2006 Vol 2 Ch 1 Table 1.4, derived", year="2006"),
    "lpg": _sourced(1.61, "kg CO2e/L", source="IPCC 2006 Vol 2 Ch 1 Table 1.4, derived", year="2006"),
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
