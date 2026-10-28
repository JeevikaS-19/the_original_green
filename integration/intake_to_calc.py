"""Integration: Person 1 intake output -> Person 2 calculator.

This file changes neither person's folder. It:
- maps Person 1's confidence labels onto Person 2's vocabulary
- runs Person 2's calculate_all_scopes
- checks the result against the shared calc output contract
"""

import copy
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "person_1_intake"))
sys.path.insert(0, str(HERE.parent / "person_2_calculator"))
sys.path.insert(0, str(HERE.parent))  # repo root, so person_3_reporting imports as a package

from calculator import calculate_all_scopes  # noqa: E402

# Person 1 writes full_data / partial_data / overview_only.
# Person 2 reads full / partial / overview / missing.
# overview_only is totals-only input (the closed-source path): ±40%.
CONFIDENCE_MAP = {
    "full_data": "full",
    "partial_data": "partial",
    "overview_only": "overview",
    "missing": "missing",
}

SCOPES = ("scope_1", "scope_2", "scope_3")
TOP_LEVEL_KEYS = ("timestamp", "tier", "scopes", "total", "unverified_inputs")
SCOPE_KEYS = ("total_co2e_kg", "total_co2e_tons", "confidence", "uncertainty_pct", "unverified_inputs")


def to_calculator_input(intake_payload):
    """Return a copy of the intake payload with confidence labels in Person 2's vocabulary."""
    payload = copy.deepcopy(intake_payload)
    mapped = {}
    for scope, label in payload.get("confidence_metadata", {}).items():
        if label not in CONFIDENCE_MAP:
            raise ValueError(f"unknown confidence label for {scope}: {label}")
        mapped[scope] = CONFIDENCE_MAP[label]
    payload["confidence_metadata"] = mapped
    return payload


def run_calculator(intake_payload):
    """Run Person 2's calculator on Person 1's intake output."""
    return calculate_all_scopes(to_calculator_input(intake_payload))


def check_calc_output(output):
    """Return a list of problems with the calc output. An empty list means it matches the contract."""
    problems = []
    for key in TOP_LEVEL_KEYS:
        if key not in output:
            problems.append(f"missing top-level key: {key}")

    scopes = output.get("scopes", {})
    for scope in SCOPES:
        block = scopes.get(scope)
        if block is None:
            problems.append(f"missing {scope}")
            continue
        for key in SCOPE_KEYS:
            if key not in block:
                problems.append(f"{scope} missing {key}")

    total = output.get("total", {})
    if "co2e_kg" not in total or "co2e_tons" not in total:
        problems.append("total missing co2e_kg or co2e_tons")
    elif all(scope in scopes and "total_co2e_kg" in scopes[scope] for scope in SCOPES):
        summed = sum(scopes[scope]["total_co2e_kg"] for scope in SCOPES)
        if abs(summed - total["co2e_kg"]) > 0.5:
            problems.append(f"total co2e_kg {total['co2e_kg']} does not match scope sum {summed}")
    return problems
