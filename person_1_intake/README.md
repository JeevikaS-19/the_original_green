# Person 1: Intake

**Owner:** Person 1. Edit only files in this folder.

Parses tracker CSV/JSON files, validates them, picks the tier, and writes the handoff file for Person 2.

## Files

- `intake.py` — tier selection, top-level flow, `send_to_calculator`
- `parsers.py` — one parser per scope/data type, returns standard dicts
- `validators.py` — completeness checks, estimates, confidence labels
- `tests/` — your tests
- `output/` — generated `intake_output.json` (git-ignored)

## Output

Must match `../shared/contracts/intake_output.example.json`.

## Test inputs

Use `../shared/demo_data/`. Put any extra raw sample files in this folder, not in `shared/`.
