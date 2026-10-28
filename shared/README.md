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

## Decisions in force

- **Confidence vocabulary.** Intake writes `full_data`, `partial_data`, `overview_only`. The calculator reads `full`, `partial`, `missing`. `integration/intake_to_calc.py` maps between them: `overview_only` becomes `missing`, the widest band.
- **Downgrade on placeholders.** If any input in a scope used a placeholder or missing factor, the calculator lowers that scope's confidence one level (full → partial → missing). A placeholder contributes zero, so the total can understate.
- **`data_path`.** The intake output adds `data_path` per scope (`open_source` or `closed_source`). Consumers may ignore it.
- **`unverified_inputs`.** The calc output lists every input path that is missing or uses a placeholder factor, both per scope and at the top level. The report surfaces them as warnings.
- **Zero total is not a grade.** Person 3 shows `N/A` when nothing could be calculated, never `A`.

## Who hands what to whom

| Stage | Reads | Writes |
|---|---|---|
| Person 1 (`person_1_intake/`) | tracker CSV/JSON files, `demo_data/` | `person_1_intake/output/intake_output.json` |
| Person 2 (`person_2_calculator/`) | `person_1_intake/output/intake_output.json` | `person_2_calculator/output/calc_output.json` |
| Person 3 (`person_3_reporting/`) | `person_2_calculator/output/calc_output.json` | `person_3_reporting/output/report.json` and `report.txt` |
| Integration (`integration/`, Day 2) | all three of the above | `integration/output/` |

Integration is not started until Day 2. Until then, nobody edits `integration/`.
