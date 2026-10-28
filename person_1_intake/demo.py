"""Run both intake paths end to end and print what the intake did.

Usage, from person_1_intake/:  python demo.py

- Open-source path: detailed tracker exports from sample_data/
- Closed-source path: consumption totals only (litres and annual kWh) from
  ../shared/demo_data/small_scale/closed.json

Each path writes its handoff file to output/<path>/intake_output.json.
"""

import json
from pathlib import Path

from intake import run_intake, run_totals_intake

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
    return run_totals_intake(
        "School/Small Company",
        SHARED_DEMO / "small_scale" / "closed.json",
        output_file=OUTPUT / "closed_source" / "intake_output.json",
    )


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
    describe("Closed-source path (totals only)", *closed_source_run())
