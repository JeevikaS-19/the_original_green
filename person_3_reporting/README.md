# Person 3: Reporting

The reporting package accepts Person 2 calculation JSON, normalizes supported
contract and legacy payloads, and produces deterministic emissions summaries,
illustrative grades, and ranked reduction-planning suggestions.

## Run from the repository root

```powershell
python -m person_3_reporting.reporting --input .\integration\output\calc_open_source.json --out-dir .\person_3_reporting\output --formats json,txt,md,html
```

`calc_open_source.json` is written by `integration/run_demo.py`, which runs the
intake and calculator first. Person 2's calculator does not write a file yet.
The organization type is taken from the tier in the calculation output; pass
`--org-type` only to override it.

Run the same module from inside this folder by supplying paths relative to this
folder, for example:

```powershell
python reporting.py --input .\tests\fixtures\master_contract.json --out-dir .\output
```

The CLI writes `output.json`, `output.txt`, `output.md`, and `output.html` in
UTF-8. A missing input produces an error and a non-zero exit code.

## Python API

```python
from person_3_reporting import generate_report, render_text

report = generate_report(calculation_json, org_type="school")
print(render_text(report))
```

`generate_report` returns a `{"report": ...}` object. Use
`normalize_calc_results` to inspect the canonical inputs. The HTML renderer is
self-contained and print-friendly. Core functionality uses only the Python
standard library.

## Assumptions

- Reduction costs, savings, and paybacks are hardcoded planning assumptions
  and must be verified before use. They are not sourced or guaranteed.
- Reported emissions and action savings are displayed to one decimal place.
  Savings from different actions can overlap and should not be summed.
- Grade thresholds are illustrative benchmarks and should be replaced with
  sourced, organization-appropriate data.
- Scope totals are preferred over inferred category sums. If a provided
  overall total differs from the sum of scopes by more than 1%, the report
  uses the scope sum and records a warning.
- Missing facts are treated as unknown, so related recommendations are skipped
  with a diagnostic. Report values are rules-based; no LLM is used.
- Comparison equivalents for flights, cars, and trees are rough approximations.
