# Shared (no single owner)

Everything in this folder is read by more than one person. Do not edit it on your own branch without telling the others, and keep changes small and separate from your own folder's work.

## Contents

- `contracts/` — the JSON shape each stage hands to the next. Changing a contract is a team decision.
  - `intake_output.example.json` — Person 1 → Person 2
  - `calc_output.example.json` — Person 2 → Person 3
  - `report_output.example.json` — Person 3's final JSON
- `demo_data/` — the two demo inputs used by everyone for testing.
  - `demo_data_full.json` — open-source, full-data campus
  - `demo_data_budget.json` — closed-source, budget-only estimates

## Rules

1. Your folder is yours. Other people's folders are read-only for you.
2. Generated output goes to `output/` inside your own folder. It is git-ignored, so nothing generated is ever committed.
3. To change a contract, open a PR that touches only `shared/contracts/` and tell the other two people in chat before merging.
4. The example values in the contracts are illustrative, not calibrated.

## Who hands what to whom

| Stage | Reads | Writes |
|---|---|---|
| Person 1 (`person_1_intake/`) | tracker CSV/JSON files, `demo_data/` | `person_1_intake/output/intake_output.json` |
| Person 2 (`person_2_calculator/`) | `person_1_intake/output/intake_output.json` | `person_2_calculator/output/calc_output.json` |
| Person 3 (`person_3_reporting/`) | `person_2_calculator/output/calc_output.json` | `person_3_reporting/output/report.json` and `report.txt` |
| Integration (`integration/`, Day 2) | all three of the above | `integration/output/` |

Integration is not started until Day 2. Until then, nobody edits `integration/`.
