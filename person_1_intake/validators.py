"""Person 1: completeness checks, estimates, and confidence labels.

Each validator takes one scope's parsed data and returns:
    {"valid", "errors", "estimates_made", "data", "completeness"}

- errors block the run: the user has to fix the file
- estimates_made are assumptions filled in; any estimate lowers confidence
- completeness is "full", "partial", "overview" (totals only: the closed-source
  path), or "missing"

Closed-source input is consumption totals, not spend: annual litres of fuel
per fuel type, and annual kWh of grid electricity.
"""

DEFAULT_ANNUAL_DISTANCE_KM = 15000
DEFAULT_LIFESPAN_YEARS = 5
DEFAULT_COMMUTE_KM = 10
DEFAULT_GRID_STATE = "default_india"
COMMUTE_MODES = ("car", "bus", "bike", "wfh")
COMMUTE_SUM_TOLERANCE = 0.05
TOTAL_FUEL_TYPES = ("petrol", "diesel", "lpg")

CONFIDENCE_LABELS = {
    "full": "full_data",
    "partial": "partial_data",
    "overview": "overview_only",
    "missing": "missing",
}


class IntakeError(ValueError):
    """The input cannot be used: empty file, wrong format, invalid value, or no scopes."""


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_blank(value):
    return value is None or value == ""


def _report(data, errors, estimates, completeness):
    return {
        "valid": not errors,
        "errors": errors,
        "estimates_made": estimates,
        "data": data,
        "completeness": completeness,
    }


def _empty_report():
    return _report(None, [], [], "missing")


def _completeness(estimates):
    # Anything missing or assumed means partial. Full only when nothing was filled in.
    return "partial" if estimates else "full"


def _validate_fuel_totals(totals, errors):
    cleaned = []
    for index, raw in enumerate(totals):
        label = f"fuel total {index + 1}"
        fuel_type = str(raw.get("fuel_type") or "").strip().lower()
        if fuel_type not in TOTAL_FUEL_TYPES:
            errors.append(f"{label}: fuel_type must be one of {', '.join(TOTAL_FUEL_TYPES)}")
            continue
        litres = raw.get("litres_per_year")
        if not _is_number(litres) or litres <= 0:
            errors.append(f"{label}: litres_per_year must be a positive number")
            continue
        cleaned.append({"fuel_type": fuel_type, "litres_per_year": litres})
    return cleaned


def _validate_hardware(devices, errors, estimates):
    cleaned = []
    for index, raw in enumerate(devices):
        device = dict(raw)
        label = device.get("model") or f"device {index + 1}"
        if _is_blank(device.get("device_type")):
            errors.append(f"{label}: device_type is required")
            continue
        if not _is_number(device.get("quantity")) or device["quantity"] <= 0:
            errors.append(f"{label}: quantity must be a positive number")
            continue
        if _is_blank(device.get("expected_lifespan_years")):
            device["expected_lifespan_years"] = DEFAULT_LIFESPAN_YEARS
            estimates.append(f"{label}: assumed {DEFAULT_LIFESPAN_YEARS} year lifespan")
        cleaned.append(device)
    return cleaned


def _validate_commute(commute, errors, estimates):
    if not commute:
        return None

    commute = dict(commute)
    employees = commute.get("total_employees")
    if not _is_number(employees) or employees <= 0:
        errors.append("commute: total_employees must be a positive number")
        return commute

    split = dict(commute.get("mode_split") or {})
    for mode in COMMUTE_MODES:
        if _is_blank(split.get(mode)):
            split[mode] = 0
            estimates.append(f"commute: {mode} share not given, assumed 0%")
        elif not _is_number(split[mode]) or split[mode] < 0:
            errors.append(f"commute: {mode} share must be a number of 0 or more")
            return commute

    total = sum(split[mode] for mode in COMMUTE_MODES)
    if total == 0:
        errors.append("commute: mode shares add up to 0")
        return commute
    if abs(total - 100) < 1:
        split = {mode: split[mode] / 100 for mode in COMMUTE_MODES}
        estimates.append("commute: shares read as percentages and converted")
    elif abs(total - 1) > COMMUTE_SUM_TOLERANCE:
        split = {mode: split[mode] / total for mode in COMMUTE_MODES}
        estimates.append("commute: shares did not add to 100%, normalised")

    distance = commute.get("avg_distance_km")
    if _is_blank(distance):
        distance = DEFAULT_COMMUTE_KM
        estimates.append(f"commute: avg distance not given, assumed {DEFAULT_COMMUTE_KM} km")
    elif not _is_number(distance) or distance < 0:
        errors.append("commute: avg_distance_km must be a number of 0 or more")

    return {
        "total_employees": employees,
        "mode_split": split,
        "avg_distance_km": distance,
    }


def _validate_waste(items, errors):
    cleaned = []
    for item in items:
        if _is_blank(item.get("category")):
            errors.append("waste: category is required")
            continue
        mass = item.get("mass_kg_per_month")
        if not _is_number(mass) or mass < 0:
            errors.append(f"waste {item['category']}: mass_kg_per_month must be 0 or more")
            continue
        cleaned.append(dict(item))
    return cleaned


def validate_scope_1(scope):
    """Vehicles, DG set, or fuel totals. Returns data with vehicles, dg_set, and fuel_totals where present."""
    errors, estimates, vehicles = [], [], []
    dg_set = None
    totals = _validate_fuel_totals(scope.get("fuel_totals") or [], errors)

    for index, raw in enumerate(scope.get("vehicles") or []):
        vehicle = dict(raw)
        label = vehicle.get("vehicle_id") or f"vehicle {index + 1}"
        if _is_blank(vehicle.get("make")) or _is_blank(vehicle.get("fuel_type")):
            errors.append(f"{label}: make and fuel_type are required")
            continue
        if _is_blank(vehicle.get("model")) or _is_blank(vehicle.get("year")):
            estimates.append(f"{label}: model or year not given")
        if _is_blank(vehicle.get("annual_distance_km")):
            vehicle["annual_distance_km"] = DEFAULT_ANNUAL_DISTANCE_KM
            estimates.append(f"{label}: assumed {DEFAULT_ANNUAL_DISTANCE_KM} km/year")
        if _is_blank(vehicle.get("lifespan_years")):
            vehicle["lifespan_years"] = DEFAULT_LIFESPAN_YEARS
        vehicles.append(vehicle)

    if scope.get("dg_set"):
        dg_set = dict(scope["dg_set"])
        for field in ("hours_per_year", "fuel_consumption_per_hour"):
            if not _is_number(dg_set.get(field)) or dg_set[field] < 0:
                errors.append(f"dg_set: {field} must be a number of 0 or more")
        if _is_blank(dg_set.get("fuel_type")):
            dg_set["fuel_type"] = "diesel"
            estimates.append("dg_set: fuel type not given, assumed diesel")

    if not vehicles and not dg_set and not totals and not errors:
        return _empty_report()

    data = {"vehicles": vehicles, "dg_set": dg_set}
    if totals:
        data["fuel_totals"] = totals

    # Totals only, with no detail behind them: the closed-source path.
    if totals and not vehicles and not dg_set:
        return _report(data, errors, estimates, "overview")
    return _report(data, errors, estimates, _completeness(estimates))


def validate_scope_2(scope):
    """Grid electricity. Monthly readings (open source) or an annual total (closed source)."""
    meter = scope.get("energy_meter")
    if not meter:
        return _empty_report()

    meter = dict(meter)
    errors, estimates = [], []
    monthly = meter.get("monthly_kwh")
    annual = meter.get("annual_kwh")

    totals_only = False
    if not _is_blank(monthly):
        if not _is_number(monthly) or monthly <= 0:
            errors.append("energy_meter: monthly_kwh must be a positive number")
    elif not _is_blank(annual):
        if not _is_number(annual) or annual <= 0:
            errors.append("energy_meter: annual_kwh must be a positive number")
        totals_only = True
    else:
        errors.append("energy_meter: monthly_kwh or annual_kwh is required")

    if _is_blank(meter.get("region_state")):
        meter["region_state"] = DEFAULT_GRID_STATE
        estimates.append("energy_meter: region not given, using India default grid factor")

    if totals_only and not errors:
        return _report({"energy_meter": meter}, errors, estimates, "overview")
    return _report({"energy_meter": meter}, errors, estimates, _completeness(estimates))


def validate_scope_3(scope):
    """Cloud, hardware, commute, and waste. Returns data with those four keys."""
    errors, estimates = [], []
    hardware = _validate_hardware(scope.get("hardware") or [], errors, estimates)
    commute = _validate_commute(scope.get("commute"), errors, estimates)
    waste = _validate_waste(scope.get("waste") or [], errors)
    cloud = scope.get("cloud")

    if not (hardware or commute or waste or cloud) and not errors:
        return _empty_report()

    for name, part in (("hardware", hardware), ("commute", commute), ("waste", waste)):
        if not part:
            estimates.append(f"{name} not given")
    if not cloud:
        estimates.append("cloud not given, Scope 3.1 not calculated")

    data = {
        "cloud": cloud or None,
        "hardware": hardware or None,
        "commute": commute,
        "waste": waste or None,
    }
    return _report(data, errors, estimates, _completeness(estimates))
