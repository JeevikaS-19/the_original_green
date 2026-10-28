"""Run all three stages on both demo paths: intake -> calculator -> report.

Usage, from integration/:  python run_demo.py

Writes output/calc_<path>.json, output/report_<path>.json, and output/report_<path>.txt.
"""

import json
from pathlib import Path

from intake_to_calc import SCOPES, check_calc_output, run_calculator

from demo import closed_source_run, open_source_run  # person_1_intake/demo.py
from person_3_reporting.reporting import generate_report, render_text

OUTPUT = Path(__file__).resolve().parent / "output"


def summarise(name, calc, problems):
    print(f"\n{name}")
    print(f"  tier: {calc['tier']}   total: {calc['total']['co2e_tons']} t CO2e/yr")
    for scope in SCOPES:
        block = calc["scopes"][scope]
        print(f"  {scope}: {block['total_co2e_tons']} t, confidence {block['confidence']} "
              f"(+/-{block['uncertainty_pct']}%), unverified inputs: {len(block['unverified_inputs'])}")
    print(f"  missing or unverified input paths: {len(calc['unverified_inputs'])}")
    for path in calc["unverified_inputs"]:
        print(f"    - {path}")
    if problems:
        print("  CONTRACT PROBLEMS:")
        for problem in problems:
            print(f"    - {problem}")
    else:
        print("  contract: ok")


def run_path(name, runner):
    intake_path, _ = runner()
    intake = json.loads(Path(intake_path).read_text(encoding="utf-8"))
    calc = run_calculator(intake)
    problems = check_calc_output(calc)

    OUTPUT.mkdir(exist_ok=True)
    out_file = OUTPUT / f"calc_{name}.json"
    out_file.write_text(json.dumps(calc, indent=2), encoding="utf-8")

    summarise(name, calc, problems)
    print(f"  written: {out_file}")

    report = generate_report(calc)
    (OUTPUT / f"report_{name}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (OUTPUT / f"report_{name}.txt").write_text(render_text(report), encoding="utf-8")
    print(f"  grade: {report['report']['grade']}   report: {OUTPUT / f'report_{name}.txt'}")


if __name__ == "__main__":
    run_path("open_source", open_source_run)
    run_path("closed_source", closed_source_run)
