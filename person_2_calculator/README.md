# Person 2: Calculator

**Owner:** Person 2. Edit only files in this folder.

Reads Person 1's intake output, calculates Scope 1/2/3 emissions with confidence ranges, and writes the handoff file for Person 3.

## Files

- `factors.py` — hardcoded conversion factors, each with a source comment
- `calculator.py` — `calculate_scope_1/2/3`, `adjust_confidence`, `calculate_all_scopes`
- `tests/` — your tests
- `output/` — generated `calc_output.json` (git-ignored)

## Input and output

- Input: `../person_1_intake/output/intake_output.json`. Until Person 1 is ready, use `../shared/demo_data/` converted to the intake shape, or `../shared/contracts/intake_output.example.json`.
- Output: must match `../shared/contracts/calc_output.example.json`.
