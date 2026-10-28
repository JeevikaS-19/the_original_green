"""Run both intake paths end to end and print what the intake did.

Usage, from person_1_intake/:  python demo.py

- Open-source path: detailed tracker exports from sample_data/
- Closed-source path: budget-only numbers from ../shared/demo_data/demo_data_budget.json

Each path writes its handoff file to output/<path>/intake_output.json.
"""

import json
from pathlib import Path

from intake import run_intake, send_to_calculator, validate_and_route

HERE = Path(__file__).resolve().parent
SAMPLE = HERE / "sample_data"
SHARED_DEMO = HERE.parent / "shared" / "demo_data"
OUTPUT = HERE / "output"


def open_source_run():
    return run_intake(
        "School/Small Company",
        vehicles_csv=SAMPLE / "vehicles.csv",
        dg_set={
            "capacity_kva": 50,
            "fuel_type": "diesel",
            "hours_per_year": 500,
            "fuel_consumption_per_hour": 15,
        },
        energy_meter_csv=SAMPLE / "energy_meter.csv",
        cloud_csv=SAMPLE / "cloud_export.json",
        hardware_csv=SAMPLE / "hardware.csv",
        commute_survey=SAMPLE / "commute.csv",
        waste_csv=SAMPLE / "waste.csv",
        output_file=OUTPUT / "open_source" / "intake_output.json",
    )


def closed_source_run():
    demo = json.loads((SHARED_DEMO / "demo_data_budget.json").read_text(encoding="utf-8"))["scopes"]
    payload, estimates = validate_and_route("tier_2", demo["scope_1"], demo["scope_2"], demo["scope_3"])
    path = send_to_calculator(payload, OUTPUT / "closed_source" / "intake_output.json")
    return path, estimates


def describe(title, path, estimates):
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    print(f"\n{title}")
    print(f"  tier: {payload['tier']}")
    for scope in ("scope_1", "scope_2", "scope_3"):
        if scope not in payload["scopes"]:
            continue
        print(f"  {scope}: {payload['data_path'][scope]}, confidence {payload['confidence_metadata'][scope]}")
        for note in estimates.get(scope, []):
            print(f"      assumed: {note}")
    print(f"  handoff file: {path}")


if __name__ == "__main__":
    describe("Open-source path (detailed exports)", *open_source_run())
    describe("Closed-source path (budget only)", *closed_source_run())
