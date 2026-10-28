"""Person 1: completeness checks, estimates, and confidence labels.

Each validator takes one scope's parsed data and returns:
    {"valid", "errors", "estimates_made", "data", "completeness"}

- errors block the run: the user has to fix the file
- estimates_made are assumptions filled in; any estimate lowers confidence
- completeness is "full", "partial", "overview" (budget only), or "missing"
"""

DEFAULT_ANNUAL_DISTANCE_KM = 15000
DEFAULT_LIFESPAN_YEARS = 5
DEFAULT_COMMUTE_KM = 10
DEFAULT_GRID_STATE = "default_india"
COMMUTE_MODES = ("car", "bus", "bike", "wfh")
COMMUTE_SUM_TOLERANCE = 0.05

CONFIDENCE_LABELS = {
    "full": "full_data",
    "partial": "partial_data",
    "overview": "overview_only",
    "missing": "missing",
}

# A scope given as budget-only uses these keys instead of its detailed data.
BUDGET_KEYS = {
    "scope_1": ["annual_fuel_budget_inr"],
    "scope_2": ["annual_energy_bill_inr"],
    "scope_3": ["cloud_spend_inr", "employee_count"],
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


def _is_budget(scope, scope_name):
    return any(key in scope for key in BUDGET_KEYS[scope_name])


def _budget_report(scope, scope_name):
    errors = []
    for key in BUDGET_KEYS[scope_name]:
        value = scope.get(key)
        if not _is_number(value) or value <= 0:
            errors.append(f"{key} must be a positive number")
    return _report(scope, errors, [], "overview")


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
    """Vehicles and DG set. Returns data as {"vehicles": [...], "dg_set": {...} or None}."""
    if _is_budget(scope, "scope_1"):
        return _budget_report(scope, "scope_1")

    errors, estimates, vehicles = [], [], []
    dg_set = None

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

    if not vehicles and not dg_set and not errors:
        return _empty_report()

    data = {"vehicles": vehicles, "dg_set": dg_set}
    return _report(data, errors, estimates, _completeness(estimates))


def validate_scope_2(scope):
    """Grid electricity. Returns data as {"energy_meter": {...}}."""
    if _is_budget(scope, "scope_2"):
        return _budget_report(scope, "scope_2")

    meter = scope.get("energy_meter")
    if not meter:
        return _empty_report()

    meter = dict(meter)
    errors, estimates = [], []

    kwh = meter.get("monthly_kwh")
    if not _is_number(kwh) or kwh <= 0:
        errors.append("energy_meter: monthly_kwh must be a positive number")

    if _is_blank(meter.get("region_state")):
        meter["region_state"] = DEFAULT_GRID_STATE
        estimates.append("energy_meter: region not given, using India default grid factor")

    return _report({"energy_meter": meter}, errors, estimates, _completeness(estimates))


def validate_scope_3(scope):
    """Cloud, hardware, commute, and waste. Returns data with those four keys."""
    if _is_budget(scope, "scope_3"):
        return _budget_report(scope, "scope_3")

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
