"""Person 1: parsers that turn tracker files into standard dicts.

Each parser reads CSV files (paths) or form dicts. It raises IntakeError when a
file is empty, is missing required columns, or has a value that is not a number.
"""

import csv
import json
from pathlib import Path

from validators import COMMUTE_MODES, IntakeError

VEHICLE_ALIASES = {
    "annual_km": "annual_distance_km",
    "annual_distance": "annual_distance_km",
    "distance_km": "annual_distance_km",
    "fuel": "fuel_type",
}
ENERGY_ALIASES = {"kwh_consumed": "kwh"}
HARDWARE_ALIASES = {"lifespan_years": "expected_lifespan_years"}
COMMUTE_ALIASES = {"employee_count": "total_employees"}

DG_NUMERIC_FIELDS = ("capacity_kva", "hours_per_year", "fuel_consumption_per_hour")
COMMUTE_NUMERIC_FIELDS = ("total_employees", "avg_distance_km") + tuple(
    f"{mode}_pct" for mode in COMMUTE_MODES
)


def _normalise_header(name):
    return name.strip().lower().replace(" ", "_")


def _to_number(value, field, where):
    """Turn "5000", "40%", or "" into a number. Blank gives None; "40%" gives 0.4."""
    if value is None:
        return None
    text = str(value).strip()
    if text == "":
        return None
    try:
        number = float(text[:-1]) / 100 if text.endswith("%") else float(text)
    except ValueError:
        raise IntakeError(f"{where}: {field} must be a number, got '{text}'")
    return int(number) if number.is_integer() else number


def _read_rows(path, required, numeric=(), aliases=None):
    """Read a CSV into a list of dicts with normalised column names."""
    path = Path(path)
    aliases = aliases or {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        lines = csv.reader(handle)
        header = next(lines, [])
        if not any(cell.strip() for cell in header):
            raise IntakeError(f"{path.name} is empty")

        columns = [aliases.get(_normalise_header(c), _normalise_header(c)) for c in header]
        missing = [name for name in required if name not in columns]
        if missing:
            raise IntakeError(f"{path.name} is missing columns: {', '.join(missing)}")

        rows = []
        for line_number, cells in enumerate(lines, start=2):
            if not any(cell.strip() for cell in cells):
                continue
            where = f"{path.name} line {line_number}"
            row = {}
            for column, cell in zip(columns, cells):
                if column in numeric:
                    row[column] = _to_number(cell, column, where)
                else:
                    row[column] = cell.strip()
            rows.append(row)

    if not rows:
        raise IntakeError(f"{path.name} has no data rows")
    return rows


def parse_dg_set(dg_set):
    """DG set from a form dict. Returns None when there is no DG set."""
    if not dg_set:
        return None
    parsed = {}
    for key, value in dg_set.items():
        field = _normalise_header(key)
        if field in DG_NUMERIC_FIELDS:
            parsed[field] = _to_number(value, field, "dg_set")
        elif field == "fuel_type":
            parsed[field] = str(value or "").strip().lower()
        else:
            parsed[field] = value
    return parsed


def parse_scope_1(vehicles_csv=None, dg_set=None):
    """Return (vehicles, dg_set). Vehicles is an empty list when no file is given."""
    vehicles = []
    if vehicles_csv:
        vehicles = _read_rows(
            vehicles_csv,
            required=["make", "fuel_type"],
            numeric=("year", "annual_distance_km", "lifespan_years"),
            aliases=VEHICLE_ALIASES,
        )
        for vehicle in vehicles:
            vehicle["fuel_type"] = vehicle["fuel_type"].lower()
    return vehicles, parse_dg_set(dg_set)


def parse_scope_2(energy_meter_csv):
    """Return {"monthly_kwh", "region_state"}, with kWh averaged across all months."""
    rows = _read_rows(energy_meter_csv, required=["kwh"], numeric=("kwh",), aliases=ENERGY_ALIASES)
    readings = [row["kwh"] for row in rows if row["kwh"] is not None]
    if not readings:
        raise IntakeError(f"{Path(energy_meter_csv).name} has no kWh values")

    regions = [row["region_state"] for row in rows if row.get("region_state")]
    return {
        "monthly_kwh": round(sum(readings) / len(readings), 2),
        "region_state": regions[0] if regions else None,
    }


def parse_commute(source):
    """Commute survey from a CSV path or a form dict. Returns None when absent."""
    if not source:
        return None
    if isinstance(source, (str, Path)):
        survey = _read_rows(
            source,
            required=["total_employees"],
            numeric=COMMUTE_NUMERIC_FIELDS,
            aliases=COMMUTE_ALIASES,
        )[0]
    else:
        survey = {
            COMMUTE_ALIASES.get(_normalise_header(key), _normalise_header(key)):
                _to_number(value, key, "commute survey")
            for key, value in source.items()
        }
    return {
        "total_employees": survey.get("total_employees"),
        "mode_split": {mode: survey.get(f"{mode}_pct") for mode in COMMUTE_MODES},
        "avg_distance_km": survey.get("avg_distance_km"),
    }


CLOUD_JSON_KEYS = {"instanceType": "instance_type", "usageHours": "usage_hours"}


def _read_cloud_json(path):
    """Read a cloud bill export shaped like {"Items": [{"instanceType", "region", "usageHours", "cost"}]}."""
    path = Path(path)
    try:
        export = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as error:
        raise IntakeError(f"{path.name} is not valid JSON: {error.msg}")

    items = export.get("Items") if isinstance(export, dict) else export
    if not isinstance(items, list) or not items:
        raise IntakeError(f"{path.name} has no Items list")

    rows = []
    for index, item in enumerate(items, start=1):
        row = {CLOUD_JSON_KEYS.get(key, key): value for key, value in item.items()}
        missing = [field for field in ("instance_type", "usage_hours", "cost") if field not in row]
        if missing:
            raise IntakeError(f"{path.name} item {index} is missing: {', '.join(missing)}")
        row["usage_hours"] = _to_number(row["usage_hours"], "usage_hours", f"{path.name} item {index}")
        row["cost"] = _to_number(row["cost"], "cost", f"{path.name} item {index}")
        rows.append(row)
    return rows


def parse_cloud(path):
    """Cloud bill from a JSON export or a CSV. Returns a list of usage rows."""
    if Path(path).suffix.lower() == ".json":
        return _read_cloud_json(path)
    return _read_rows(
        path,
        required=["instance_type", "usage_hours", "cost"],
        numeric=("usage_hours", "cost"),
    )


def parse_scope_3(cloud_csv=None, hardware_csv=None, commute_survey=None, waste_csv=None):
    """Return {"cloud", "hardware", "commute", "waste"}. Absent inputs are None.

    cloud_csv may be a JSON export or a CSV. The name is kept for compatibility.
    """
    return {
        "cloud": parse_cloud(cloud_csv) if cloud_csv else None,
        "hardware": _read_rows(
            hardware_csv,
            required=["device_type", "quantity"],
            numeric=("quantity", "purchase_year", "expected_lifespan_years"),
            aliases=HARDWARE_ALIASES,
        ) if hardware_csv else None,
        "commute": parse_commute(commute_survey),
        "waste": _read_rows(
            waste_csv,
            required=["category", "mass_kg_per_month"],
            numeric=("mass_kg_per_month",),
        ) if waste_csv else None,
    }
