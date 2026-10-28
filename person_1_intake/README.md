# Person 1: Intake

**Owner:** Person 1. Edit only files in this folder.

Parses tracker CSV/JSON files, validates them, picks the tier, and writes the handoff file for Person 2.

## Files

- `intake.py` — tier selection, `validate_and_route`, `send_to_calculator`, and `run_intake` (the whole flow)
- `parsers.py` — CSV readers for each scope; header aliases and percent handling live here
- `validators.py` — per-scope checks, estimates, and confidence labels
- `sample_data/` — tracker-format CSVs for testing
- `tests/test_intake.py` — tests, including the shared demo JSON files
- `output/` — generated `intake_output.json` (git-ignored)

## Usage

```python
from intake import run_intake

path, estimates = run_intake(
    "School/Small Company",
    vehicles_csv="sample_data/vehicles.csv",
    dg_set={"capacity_kva": 50, "fuel_type": "diesel", "hours_per_year": 500, "fuel_consumption_per_hour": 15},
    energy_meter_csv="sample_data/energy_meter.csv",
    cloud_csv="sample_data/cloud.csv",
    hardware_csv="sample_data/hardware.csv",
    commute_survey="sample_data/commute.csv",   # a CSV path or a form dict
    waste_csv="sample_data/waste.csv",
)
```

Any input can be left out to skip that scope. Errors (bad numbers, missing columns, empty files, no scopes) raise `IntakeError`. Estimates are returned, not raised.

## Demo

From `person_1_intake/`:

```
python demo.py
```

Runs both paths and writes two handoff files:
- `output/open_source/intake_output.json` — detailed exports from `sample_data/`
- `output/closed_source/intake_output.json` — budget-only numbers from `../shared/demo_data/demo_data_budget.json`

## Tests

From `person_1_intake/`:

```
python tests/test_intake.py
```

## Output

Matches `../shared/contracts/intake_output.example.json`, plus one extra top-level field:

- `data_path`: per scope, `open_source` (detailed exports) or `closed_source` (budget only). This is an addition to the contract and needs the team's agreement.

Confidence labels are `full_data`, `partial_data`, or `overview_only`.

Budget-only scopes (e.g. `annual_fuel_budget_inr`) pass through with `overview_only`. Person 2 does not yet handle that shape.
