# Person 3: Reporting

**Owner:** Person 3. Edit only files in this folder.

Reads Person 2's calculation output, ranks reduction actions from a fixed knowledge base, assigns a grade, and writes the report.

## Files

- `knowledge_base.py` — hardcoded reduction actions (cost, carbon saved, payback)
- `reporting.py` — suggestion ranking, grade, JSON/Markdown/HTML formatters
- `tests/` — your tests
- `output/` — generated `report.json` and `report.txt` (git-ignored)

## Input and output

- Input: `../person_2_calculator/output/calc_output.json`. Until Person 2 is ready, use `../shared/contracts/calc_output.example.json`.
- Output: must match `../shared/contracts/report_output.example.json`.

No LLM is used for any number. Rules and lookups only.
