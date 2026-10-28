"""Scope 1/2/3 calculations for Person 2.

The calculator uses only explicitly supplied values and the factor registry in
``factors.py``.  A missing or placeholder factor never becomes an invented
estimate; its input is recorded as unverified and contributes zero.
"""

from __future__ import annotations

from datetime import datetime, timezone
from numbers import Number
from typing import Any

try:
    from .factors import conversion_factors
except ImportError:
    from factors import conversion_factors


def _number(value: Any, default: float = 0.0) -> float:
    return float(value) if isinstance(value, Number) and not isinstance(value, bool) else default


def _factor_value(factor: Any) -> float | None:
    value = factor.get("value") if isinstance(factor, dict) else factor
    return value if isinstance(value, Number) and not isinstance(value, bool) else None


def _factor_is_placeholder(factor: Any) -> bool:
    return isinstance(factor, dict) and factor.get("status") == "placeholder"


def _round(value: float) -> float:
    return round(value, 6)


def _tons(kg: float) -> float:
    return _round(kg / 1000)


def _vehicle_type(vehicle: dict[str, Any]) -> str:
    explicit = str(vehicle.get("vehicle_type", "")).strip().lower().replace("-", "_")
    if explicit:
        return explicit
    description = f"{vehicle.get('make', '')} {vehicle.get('model', '')}".lower()
    if "bus" in description or "coach" in description:
        return "bus"
    if "bike" in description or "motorcycle" in description or "scooter" in description:
        return "two_wheeler"
    if "car" in description or "van" in description:
        return "car"
    return "fuel_default"


def _fuel_factor(fuel_type: str, factors: dict[str, Any]) -> tuple[float | None, bool]:
    factor = factors.get(str(fuel_type).strip().lower())
    return _factor_value(factor), _factor_is_placeholder(factor) or factor is None


def _efficiency_factor(vehicle: dict[str, Any], factors: dict[str, Any]) -> tuple[float | None, bool]:
    efficiency = vehicle.get("fuel_efficiency_l_per_100km")
    if isinstance(efficiency, Number) and not isinstance(efficiency, bool):
        return float(efficiency), False
    vehicle_type = _vehicle_type(vehicle)
    factor = factors.get(vehicle_type)
    if factor is None:
        factor = factors.get("fuel_default")
    return _factor_value(factor), _factor_is_placeholder(factor) or factor is None


def calculate_scope_1(vehicles, dg_set, conversion_factors):
    """Calculate direct fuel emissions from vehicles and a DG set."""
    fuel_factors = conversion_factors.get("fuel", {})
    efficiency_factors = conversion_factors.get("fuel_efficiency", {})
    breakdown = []
    unverified = []
    total = 0.0

    for vehicle in vehicles or []:
        fuel_type = str(vehicle.get("fuel_type", "")).strip().lower()
        emission_factor, missing_emission_factor = _fuel_factor(fuel_type, fuel_factors)
        efficiency, missing_efficiency = _efficiency_factor(vehicle, efficiency_factors)
        distance = _number(vehicle.get("annual_distance_km"))
        fuel_litres = distance * efficiency / 100 if efficiency is not None else 0.0
        annual_kg = fuel_litres * emission_factor if emission_factor is not None else 0.0
        if missing_emission_factor:
            unverified.append(f"scope_1.vehicle[{vehicle.get('vehicle_id', 'unknown')}].fuel_factor")
        if missing_efficiency:
            unverified.append(f"scope_1.vehicle[{vehicle.get('vehicle_id', 'unknown')}].fuel_efficiency")
        breakdown.append({
            "vehicle_id": vehicle.get("vehicle_id"),
            "fuel_type": fuel_type,
            "annual_fuel_litres": _round(fuel_litres),
            "annual_co2e_kg": _round(annual_kg),
        })
        total += annual_kg

    if dg_set:
        fuel_type = str(dg_set.get("fuel_type", "")).strip().lower()
        emission_factor, missing_emission_factor = _fuel_factor(fuel_type, fuel_factors)
        litres = _number(dg_set.get("hours_per_year")) * _number(
            dg_set.get("fuel_consumption_per_hour")
        )
        annual_kg = litres * emission_factor if emission_factor is not None else 0.0
        if missing_emission_factor:
            unverified.append("scope_1.dg_set.fuel_factor")
        breakdown.append({
            "source": f"DG Set ({fuel_type})",
            "annual_fuel_litres": _round(litres),
            "annual_co2e_kg": _round(annual_kg),
        })
        total += annual_kg

    return {
        "scope": "Scope 1 (Direct Fuel)",
        "total_co2e_kg": _round(total),
        "total_co2e_tons": _tons(total),
        "breakdown": breakdown,
        "methodology": "Fuel consumption (L/year) x emission factor (kg CO2e/L)",
        "unverified_inputs": unverified,
    }


def calculate_scope_2(energy_meter, conversion_factors):
    """Calculate purchased electricity with one all-India grid factor."""
    energy_meter = energy_meter or {}
    annual_kwh = _number(energy_meter.get("annual_kwh"))
    if not annual_kwh:
        annual_kwh = _number(energy_meter.get("monthly_kwh")) * 12
    grid_factor = conversion_factors.get("grid")
    grid_intensity = _factor_value(grid_factor)
    annual_kg = annual_kwh * grid_intensity if grid_intensity is not None else 0.0
    unverified = ["scope_2.grid_factor"] if _factor_is_placeholder(grid_factor) or grid_intensity is None else []
    electricity = {
        "annual_kwh": _round(annual_kwh),
        "region": "all-india",
        "grid_intensity": grid_intensity,
        "annual_co2e_kg": _round(annual_kg),
    }
    return {
        "scope": "Scope 2 (Purchased Electricity)",
        "total_co2e_kg": _round(annual_kg),
        "total_co2e_tons": _tons(annual_kg),
        "breakdown": {"electricity": electricity},
        "unverified_inputs": unverified,
    }


def calculate_scope_3(cloud, hardware, commute, waste, conversion_factors):
    """Calculate cloud, hardware, commute, and waste categories when factors exist."""
    categories = {}
    unverified = []

    cloud_kg = _number(cloud.get("annual_co2e_kg")) if isinstance(cloud, dict) else 0.0
    if cloud is not None and not isinstance(cloud, dict):
        unverified.append("scope_3.cloud")
    elif cloud is None:
        unverified.append("scope_3.cloud")
    categories["3.1_cloud"] = {"total_co2e_kg": _round(cloud_kg)} if cloud is not None else None

    hardware_total = 0.0
    hardware_details = []
    hardware_factors = conversion_factors.get("hardware_embodied_carbon", {})
    for item in hardware or []:
        key = str(item.get("device_type", "")).strip().lower().replace(" ", "_")
        factor = hardware_factors.get(key)
        factor_value = _factor_value(factor)
        item_kg = _number(item.get("annual_co2e_kg"))
        if factor_value is not None:
            item_kg = _number(item.get("quantity"), 0) * factor_value
        else:
            unverified.append(f"scope_3.hardware.{key or 'unknown'}.embodied_carbon_factor")
        hardware_total += item_kg
        hardware_details.append({"device_type": key, "total_co2e_kg": _round(item_kg)})
    categories["3.2_hardware"] = {
        "total_co2e_kg": _round(hardware_total),
        "breakdown": hardware_details,
    }

    commute_total = 0.0
    commute_details = {}
    commute = commute or {}
    days = _number(commute.get("commuting_days_per_year"), COMMUTING_DAYS_PER_YEAR)
    distance = _number(commute.get("avg_distance_km")) * days
    commute_factors = conversion_factors.get("commute", {})
    for mode, share in (commute.get("mode_split") or {}).items():
        factor = commute_factors.get(str(mode).lower())
        factor_value = _factor_value(factor)
        mode_kg = distance * _number(commute.get("total_employees")) * _number(share)
        mode_kg *= factor_value if factor_value is not None else 0
        if factor_value is None:
            unverified.append(f"scope_3.commute.{str(mode).lower()}.factor")
        commute_total += mode_kg
        commute_details[str(mode).lower()] = _round(mode_kg)
    categories["3.3_commute"] = {
        "total_co2e_kg": _round(commute_total),
        "breakdown": commute_details,
    }

    waste_total = 0.0
    waste_details = []
    waste_factors = conversion_factors.get("waste", {})
    for item in waste or []:
        category = str(item.get("category", "")).strip().lower()
        disposal = str(item.get("disposal_method", DEFAULT_DISPOSAL.get(category, ""))).strip().lower()
        factor = waste_factors.get((category, disposal))
        factor_value = _factor_value(factor)
        mass = _number(item.get("annual_mass_kg"))
        if not mass:
            mass = _number(item.get("mass_kg_per_month")) * 12
        item_kg = mass * factor_value if factor_value is not None else 0.0
        if factor_value is None:
            unverified.append(f"scope_3.waste.{category or 'unknown'}.{disposal}.factor")
        waste_total += item_kg
        waste_details.append({"category": category, "disposal_method": disposal, "total_co2e_kg": _round(item_kg)})
    categories["3.4_waste"] = {
        "total_co2e_kg": _round(waste_total),
        "breakdown": waste_details,
    }

    total = cloud_kg + hardware_total + commute_total + waste_total
    return {
        "scope": "Scope 3 (Indirect)",
        "total_co2e_kg": _round(total),
        "total_co2e_tons": _tons(total),
        "categories": categories,
        "unverified_inputs": unverified,
    }


COMMUTING_DAYS_PER_YEAR = 250  # spec: 250 working days
# Disposal route used when the input does not name one. Must match the keys in factors.WASTE_FACTORS.
DEFAULT_DISPOSAL = {"solid waste": "landfill", "e-waste": "recycling", "wastewater": "treatment"}
UNVERIFIED_DOWNGRADE = {"full": "partial", "partial": "missing", "missing": "missing"}


def effective_completeness(label, scope_result):
    """Lower the confidence one level when any input used a placeholder or missing factor.

    A placeholder factor contributes zero, so the reported total can understate
    the true value. The label should not claim more certainty than that allows.
    """
    if not scope_result.get("unverified_inputs"):
        return label
    base = str(label).lower().replace("_data", "")
    return UNVERIFIED_DOWNGRADE.get(base, "missing")


def uncertainty_pct(data_completeness):
    """Return the uncertainty percentage for a completeness label."""
    label = str(data_completeness).lower().replace("_data", "")
    return {"full": 10, "partial": 25, "missing": 50}.get(label, 50)


def adjust_confidence(scope_result, data_completeness):
    """Attach confidence and symmetric uncertainty bounds to a scope result."""
    result = dict(scope_result)
    percent = uncertainty_pct(data_completeness)
    total = _number(result.get("total_co2e_kg"))
    result["confidence"] = str(data_completeness).lower()
    result["uncertainty_pct"] = percent
    result["co2e_range_kg"] = {
        "low": _round(max(0, total * (1 - percent / 100))),
        "high": _round(total * (1 + percent / 100)),
    }
    return result


def estimate_from_budget(budget_data):
    """Convert budget input only when a usable price factor is available."""
    result = {"estimated": False, "unverified_inputs": []}
    if not isinstance(budget_data, dict):
        return result
    for field, factor_key, output_key in (
        ("annual_fuel_budget_inr", "fuel_price_per_litre", "fuel_litres"),
        ("annual_energy_bill_inr", "tariff_per_kwh", "annual_kwh"),
    ):
        if field in budget_data:
            factor = conversion_factors.get(factor_key)
            value = _factor_value(factor)
            if value:
                result[output_key] = _round(_number(budget_data[field]) / value)
                result["estimated"] = True
            else:
                result["unverified_inputs"].append(field)
    return result


def list_unverified(intake_data):
    """Return input paths that are missing, null, or driven by placeholders."""
    scopes = (intake_data or {}).get("scopes", {})
    paths = []
    if not scopes.get("scope_1", {}).get("vehicles") and not scopes.get("scope_1", {}).get("dg_set"):
        paths.append("scope_1")
    if not scopes.get("scope_2", {}).get("energy_meter"):
        paths.append("scope_2")
    scope_3 = scopes.get("scope_3", {})
    for key in ("cloud", "hardware", "commute", "waste"):
        if not scope_3.get(key):
            paths.append(f"scope_3.{key}")
    return paths


def calculate_all_scopes(intake_data):
    """Run all scope calculators and return the handoff payload for Person 3."""
    intake_data = intake_data or {}
    scopes = intake_data.get("scopes", {})
    metadata = intake_data.get("confidence_metadata", {})
    scope_1 = calculate_scope_1(
        scopes.get("scope_1", {}).get("vehicles"),
        scopes.get("scope_1", {}).get("dg_set"),
        conversion_factors,
    )
    scope_2 = calculate_scope_2(
        scopes.get("scope_2", {}).get("energy_meter"),
        conversion_factors,
    )
    scope_3 = calculate_scope_3(
        scopes.get("scope_3", {}).get("cloud"),
        scopes.get("scope_3", {}).get("hardware"),
        scopes.get("scope_3", {}).get("commute"),
        scopes.get("scope_3", {}).get("waste"),
        conversion_factors,
    )
    scope_1 = adjust_confidence(scope_1, effective_completeness(metadata.get("scope_1", "partial"), scope_1))
    scope_2 = adjust_confidence(scope_2, effective_completeness(metadata.get("scope_2", "partial"), scope_2))
    scope_3 = adjust_confidence(scope_3, effective_completeness(metadata.get("scope_3", "partial"), scope_3))
    total_kg = sum(_number(scope.get("total_co2e_kg")) for scope in (scope_1, scope_2, scope_3))
    unverified = list_unverified(intake_data)
    for scope in (scope_1, scope_2, scope_3):
        for item in scope.get("unverified_inputs", []):
            if item not in unverified:
                unverified.append(item)
    return {
        "timestamp": intake_data.get("timestamp", datetime.now(timezone.utc).isoformat()),
        "tier": intake_data.get("tier"),
        "scopes": {
            "scope_1": scope_1,
            "scope_2": scope_2,
            "scope_3": scope_3,
        },
        "total": {
            "co2e_kg": _round(total_kg),
            "co2e_tons": _tons(total_kg),
        },
        "unverified_inputs": unverified,
    }
