"""Person 1: tier selection, routing, and the handoff to Person 2.

Output contract: ../shared/contracts/intake_output.example.json
"""

import json
from datetime import datetime
from pathlib import Path

from parsers import parse_scope_1, parse_scope_2, parse_scope_3
from validators import (
    CONFIDENCE_LABELS,
    IntakeError,
    validate_scope_1,
    validate_scope_2,
    validate_scope_3,
)

OUTPUT_FILE = Path(__file__).resolve().parent / "output" / "intake_output.json"

TIER_ANSWERS = {
    "individual": "tier_1",
    "school": "tier_2",
    "school/small company": "tier_2",
    "enterprise": "tier_3",
    "large enterprise": "tier_3",
    "tier_1": "tier_1",
    "tier_2": "tier_2",
    "tier_3": "tier_3",
}

# Which scopes the form shows for each tier. scope_3 is optional for tier_1.
TIER_INFO = {
    "tier_1": {"user_type": "individual", "scopes_shown": ["scope_1", "scope_2"], "optional_scopes": ["scope_3"]},
    "tier_2": {"user_type": "school", "scopes_shown": ["scope_1", "scope_2", "scope_3"], "optional_scopes": []},
    "tier_3": {"user_type": "enterprise", "scopes_shown": ["scope_1", "scope_2", "scope_3"], "optional_scopes": []},
}

VALIDATORS = {
    "scope_1": validate_scope_1,
    "scope_2": validate_scope_2,
    "scope_3": validate_scope_3,
}


def tier_selector(answer):
    """Map the user's answer to "tier_1", "tier_2", or "tier_3"."""
    key = str(answer).strip().lower()
    if key not in TIER_ANSWERS:
        raise IntakeError(
            f"Unknown tier '{answer}'. Use Individual, School/Small Company, or Large Enterprise."
        )
    return TIER_ANSWERS[key]


def tier_selection(answer):
    """Tier object for the form: which scopes to show for this tier."""
    tier = tier_selector(answer)
    return {"tier": tier, **TIER_INFO[tier]}


def validate_and_route(tier, scope_1, scope_2, scope_3):
    """Validate each scope and build the payload for Person 2.

    Each scope argument is parsed data (or None when the user skipped it).
    Returns (payload, estimates), where estimates maps each scope to the
    assumptions that were made. Raises IntakeError if any scope has an error
    or if no scope has data.
    """
    if tier not in TIER_INFO:
        raise IntakeError(f"Unknown tier '{tier}'")

    scopes, confidence, estimates, data_path, errors = {}, {}, {}, {}, []
    inputs = (("scope_1", scope_1), ("scope_2", scope_2), ("scope_3", scope_3))

    for name, scope in inputs:
        if not scope:
            continue
        result = VALIDATORS[name](scope)
        errors.extend(f"{name}: {message}" for message in result["errors"])
        if result["completeness"] == "missing":
            continue
        scopes[name] = result["data"]
        confidence[name] = CONFIDENCE_LABELS[result["completeness"]]
        estimates[name] = result["estimates_made"]
        # Budget-only input is the closed-source path; detailed exports are open source.
        data_path[name] = "closed_source" if result["completeness"] == "overview" else "open_source"

    if errors:
        raise IntakeError("; ".join(errors))
    if not scopes:
        raise IntakeError("No scopes selected: add data for at least one scope")

    payload = {
        "tier": tier,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "scopes": scopes,
        "confidence_metadata": confidence,
        "data_path": data_path,
    }
    return payload, estimates


def send_to_calculator(intake_data, output_file=OUTPUT_FILE):
    """Write the payload to output/intake_output.json for Person 2 to read."""
    output_file = Path(output_file)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(intake_data, indent=2), encoding="utf-8")
    return output_file


def run_intake(
    tier_answer,
    vehicles_csv=None,
    dg_set=None,
    energy_meter_csv=None,
    cloud_csv=None,
    hardware_csv=None,
    commute_survey=None,
    waste_csv=None,
    output_file=OUTPUT_FILE,
):
    """Run the whole intake: parse, validate, route, and write the handoff file.

    Returns (output_path, estimates). Any input can be omitted to skip that scope.
    """
    tier = tier_selector(tier_answer)

    vehicles, dg = parse_scope_1(vehicles_csv, dg_set)
    scope_1 = {"vehicles": vehicles, "dg_set": dg} if vehicles or dg else None

    meter = parse_scope_2(energy_meter_csv) if energy_meter_csv else None
    scope_2 = {"energy_meter": meter} if meter else None

    scope_3 = parse_scope_3(cloud_csv, hardware_csv, commute_survey, waste_csv)
    if not any(scope_3.values()):
        scope_3 = None

    payload, estimates = validate_and_route(tier, scope_1, scope_2, scope_3)
    return send_to_calculator(payload, output_file), estimates


def run_totals_intake(tier_answer, totals_json, output_file=OUTPUT_FILE):
    """Closed-source path: run the intake on consumption totals.

    totals_json is a JSON file shaped like:
        {"scope_1": {"fuel_totals": [{"fuel_type": "petrol", "litres_per_year": 713}]},
         "scope_2": {"energy_meter": {"annual_kwh": 4200, "region_state": "Karnataka"}}}

    Returns (output_path, estimates).
    """
    tier = tier_selector(tier_answer)
    scopes = json.loads(Path(totals_json).read_text(encoding="utf-8"))
    payload, estimates = validate_and_route(
        tier,
        scopes.get("scope_1"),
        scopes.get("scope_2"),
        scopes.get("scope_3"),
    )
    return send_to_calculator(payload, output_file), estimates
