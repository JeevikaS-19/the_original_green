"""Run the whole pipeline for each demo persona and build the frontend data file.

Usage, from integration/:  python build_demo.py

For every persona and both data paths it runs:
    intake (Person 1) -> calculator (Person 2) -> report (Person 3)
and writes the outputs to integration/output/<persona>/<path>/.

Then it writes frontend/data/demo_fixtures.js from those real outputs, so the
demo shows pipeline results, not stand-in numbers.
"""

import json
import math
import sys
from pathlib import Path

from intake_to_calc import run_calculator, check_calc_output  # also sets up the import paths

from intake import run_estimated_intake, run_intake, run_totals_intake  # person_1_intake
from parsers import parse_scope_3  # person_1_intake
from person_3_reporting.reporting import GRADE_BENCHMARKS, generate_report, render_text

HERE = Path(__file__).resolve().parent
DEMO = HERE.parent / "shared" / "demo_data"
OUTPUT = HERE / "output"
FRONTEND_DATA = HERE.parent / "frontend" / "data" / "demo_fixtures.js"

# Persona metadata. Numbers in the descriptions match the files in shared/demo_data.
PERSONAS = [
    {
        "id": "individual",
        "folder": "individual",
        "tier_answer": "Individual",
        "tier": "tier_1",
        "org_type": "individual",
        "label": "Individual",
        "sublabel": "Software developer, one car",
        "description": "One person with a petrol car, home electricity and a work laptop.",
        "open_sources": [
            ("Fuel log export", "CSV", "One petrol car, 11,500 km a year, measured efficiency", "scope_1"),
            ("Smart meter export", "CSV", "12 monthly readings, Karnataka", "scope_2"),
            ("Device list", "CSV", "One laptop, bought 2022", "scope_3"),
            ("Waste pickup log", "CSV", "Solid waste, 20 kg a month", "scope_3"),
        ],
        "closed_sources": [
            ("Fuel total", "litres a year", "About 713 litres of petrol", "scope_1"),
            ("Electricity total", "kWh a year", "About 3,965 kWh", "scope_2"),
        ],
    },
    {
        "id": "small_scale",
        "folder": "small_scale",
        "tier_answer": "School/Small Company",
        "tier": "tier_2",
        "org_type": "school",
        "label": "Small scale",
        "sublabel": "Campus, 200 staff",
        "description": "A campus with two diesel buses, a diesel van, a diesel DG set and 200 staff.",
        "open_sources": [
            ("Vehicle log export", "CSV", "Two buses and a van, measured fuel use", "scope_1"),
            ("DG set record", "Form", "50 kVA, 400 hours a year, 12 L/h", "scope_1"),
            ("Energy meter export", "CSV", "12 monthly readings, Karnataka", "scope_2"),
            ("Asset register", "CSV", "30 laptops, 20 desktops", "scope_3"),
            ("Commute survey", "CSV", "200 responses, mode split", "scope_3"),
            ("Waste vendor log", "CSV", "Solid, e-waste and wastewater, monthly", "scope_3"),
        ],
        "closed_sources": [
            ("Fuel total", "litres a year", "About 53,350 litres of diesel (buses, van and DG)", "scope_1"),
            ("Electricity total", "kWh a year", "About 58,100 kWh", "scope_2"),
        ],
    },
    {
        "id": "large_scale",
        "folder": "large_scale",
        "tier_answer": "Large Enterprise",
        "tier": "tier_3",
        "org_type": "enterprise",
        "label": "Large scale",
        "sublabel": "Technology company, 500 staff",
        "description": "A technology company with 500 staff, eight cars, a diesel DG set and a data-heavy office.",
        "open_sources": [
            ("Fleet fuel export", "CSV", "Eight petrol cars, 14,000 km each", "scope_1"),
            ("DG run-hour log", "Form", "250 kVA, 600 hours a year, 55 L/h", "scope_1"),
            ("Smart meter export", "CSV", "12 monthly readings, about 751,000 kWh a year", "scope_2"),
            ("IT asset register", "CSV", "500 laptops, 12 servers", "scope_3"),
            ("Commute survey", "CSV", "500 responses, mode split", "scope_3"),
            ("Waste contractor records", "CSV", "Solid and e-waste, monthly", "scope_3"),
        ],
        "closed_sources": [
            ("Fuel totals", "litres a year", "About 7,840 L petrol and 33,000 L diesel (DG)", "scope_1"),
            ("Electricity total", "kWh a year", "About 751,000 kWh", "scope_2"),
        ],
    },
]

PARTIAL_PERSONA = {
    "id": "large_scale_partial",
    "folder": "large_scale_partial",
    "tier_answer": "Large Enterprise",
    "tier": "tier_3",
    "org_type": "enterprise",
    "label": "Large scale · partial data",
    "sublabel": "Headcount, energy bill and cloud only",
    "description": "The same technology company, but with only its headcount, annual energy bill and cloud usage. Everything else is estimated and labelled.",
    "open_sources": [
        ("Headcount and bill", "Form", "500 employees, ₹56 lakh annual energy bill, Karnataka", "scope_2"),
        ("Cloud usage export", "CSV", "GPU and general-purpose instance hours", "scope_3"),
    ],
    "closed_sources": [],
}

SCOPE_LABELS = {
    "scope_1": "Scope 1 · Direct fuel",
    "scope_2": "Scope 2 · Purchased electricity",
    "scope_3": "Scope 3 · Devices, commute, waste",
}
SCOPE_FORMULAS = {
    "scope_1": "Litres of fuel × kg CO2e per litre (IPCC 2006 defaults, converted)",
    "scope_2": "kWh × CEA combined margin (0.757 kg CO2e/kWh)",
    "scope_3": "Devices, commute and waste × factor. Factors are placeholders, so these show zero.",
}
PATH_INFO = {
    "open_source": {
        "label": "Open-source data",
        "summary": "Detailed exports from the company's own trackers give a tight range.",
    },
    "closed_source": {
        "label": "Closed-source data",
        "summary": "Only consumption totals are available (litres and kWh). The range is wide, and Scope 3 cannot be calculated from totals.",
    },
}


def optional(path):
    return path if path.exists() else None


def run_open(persona):
    folder = DEMO / persona["folder"]
    dg_path = optional(folder / "dg_set.json")
    dg_set = json.loads(dg_path.read_text(encoding="utf-8")) if dg_path else None
    return run_intake(
        persona["tier_answer"],
        vehicles_csv=optional(folder / "vehicles.csv"),
        dg_set=dg_set,
        energy_meter_csv=optional(folder / "energy_meter.csv"),
        cloud_csv=optional(folder / "cloud.csv"),
        hardware_csv=optional(folder / "hardware.csv"),
        commute_survey=optional(folder / "commute.csv"),
        waste_csv=optional(folder / "waste.csv"),
        output_file=OUTPUT / persona["id"] / "open_source" / "intake_output.json",
    )


def run_closed(persona):
    return run_totals_intake(
        persona["tier_answer"],
        DEMO / persona["folder"] / "closed.json",
        output_file=OUTPUT / persona["id"] / "closed_source" / "intake_output.json",
    )


def run_estimated(persona):
    folder = DEMO / persona["folder"]
    org = json.loads((folder / "org.json").read_text(encoding="utf-8"))
    uploaded = {
        "scope_1": {},
        "scope_2": {},
        "scope_3": parse_scope_3(cloud_csv=DEMO / "large_scale" / "cloud.csv"),
    }
    path, assumptions, notes = run_estimated_intake(
        persona["tier_answer"], uploaded, org,
        output_file=OUTPUT / persona["id"] / "open_source" / "intake_output.json",
    )
    return path, assumptions, notes


def grade_bands(org_type):
    rows, lower = [], 0
    for upper, letter in GRADE_BENCHMARKS[org_type]:
        rows.append({"grade": letter, "from": lower, "to": None if upper == math.inf else upper})
        lower = upper
    return rows


def path_fixture(persona, path_key, intake_path, estimates):
    intake = json.loads(Path(intake_path).read_text(encoding="utf-8"))
    calc = run_calculator(intake)
    problems = check_calc_output(calc)
    if problems:
        raise SystemExit(f"{persona['id']} {path_key}: contract problems: {problems}")
    full_report = generate_report(calc)
    report = full_report["report"]

    out = OUTPUT / persona["id"] / path_key
    out.mkdir(parents=True, exist_ok=True)
    (out / "calc.json").write_text(json.dumps(calc, indent=2), encoding="utf-8")
    (out / "report.json").write_text(json.dumps(full_report, indent=2), encoding="utf-8")
    (out / "report.txt").write_text(render_text(full_report), encoding="utf-8")

    scopes, total_low, total_high = [], 0.0, 0.0
    by_scope = report["by_scope"]
    for scope_id in ("scope_1", "scope_2", "scope_3"):
        block = calc["scopes"][scope_id]
        low = block["co2e_range_kg"]["low"] / 1000
        high = block["co2e_range_kg"]["high"] / 1000
        total_low += low
        total_high += high
        scopes.append({
            "id": scope_id,
            "label": SCOPE_LABELS[scope_id],
            "tons": round(block["total_co2e_tons"], 2),
            "low": round(low, 2),
            "high": round(high, 2),
            "confidence": f"±{block['uncertainty_pct']}%",
            "drivers": [
                {"name": item["name"], "tons": round(item["tons"], 2)}
                for item in by_scope[scope_id]["categories"]
            ],
            "formula": SCOPE_FORMULAS[scope_id],
        })

    notes = [
        "Reduction savings and costs are planning assumptions from the knowledge base. Verify them before relying on them.",
    ]
    for scope_id, block in calc["scopes"].items():
        if block["unverified_inputs"]:
            notes.append(
                f"{SCOPE_LABELS[scope_id]}: {len(block['unverified_inputs'])} input(s) use placeholder factors "
                "and count as zero."
            )
    illustrative = calc.get("illustrative_inputs", [])
    if illustrative:
        notes.append(
            "Demo uses illustrative factors for Scope 3 (" + str(len(illustrative)) +
            " inputs). Real submissions use verified sources."
        )
    if path_key == "closed_source":
        notes.append("Totals only: Scope 3 is not available, and the ±40% range is a rough estimate.")

    actions = [
        {
            "scope": item["scope"],
            "action": item["action"],
            "description": item["description"],
            "tons": item["carbon_saved"],
            "cost_inr": item["cost_inr"],
            "payback": item["payback"],
            "roi": item["roi"],
            "placeholder": False,
        }
        for item in report["top_5_actions"]
    ]

    return {
        "label": PATH_INFO[path_key]["label"],
        "summary": PATH_INFO[path_key]["summary"],
        "sources": [
            {"tracker": t, "format": f, "detail": d, "scope": s}
            for t, f, d, s in persona["open_sources" if path_key == "open_source" else "closed_sources"]
        ],
        "intake": {
            "data_path": intake["data_path"],
            "confidence_metadata": intake["confidence_metadata"],
            "estimates": {scope: estimates.get(scope, []) for scope in intake["scopes"]},
        },
        "scopes": scopes,
        "total": {
            "tons": round(calc["total"]["co2e_tons"], 2),
            "low": round(total_low, 2),
            "high": round(total_high, 2),
        },
        "grade": report["grade"],
        "grade_bands": grade_bands(persona["org_type"]),
        "actions": actions,
        "notes": notes,
        "illustrative": illustrative,
        "assumptions": [item for items in intake.get("assumptions", {}).values() for item in items],
    }


def build():
    fixtures = []
    est_path, est_assumptions, est_notes = run_estimated(PARTIAL_PERSONA)
    fixtures.append({
        "id": PARTIAL_PERSONA["id"],
        "tier": PARTIAL_PERSONA["tier"],
        "label": PARTIAL_PERSONA["label"],
        "sublabel": PARTIAL_PERSONA["sublabel"],
        "description": PARTIAL_PERSONA["description"],
        "paths": {"open_source": path_fixture(PARTIAL_PERSONA, "open_source", est_path, est_assumptions)},
    })
    for persona in PERSONAS:
        open_path, open_estimates = run_open(persona)
        closed_path, closed_estimates = run_closed(persona)
        fixtures.append({
            "id": persona["id"],
            "tier": persona["tier"],
            "label": persona["label"],
            "sublabel": persona["sublabel"],
            "description": persona["description"],
            "paths": {
                "open_source": path_fixture(persona, "open_source", open_path, open_estimates),
                "closed_source": path_fixture(persona, "closed_source", closed_path, closed_estimates),
            },
        })
    return fixtures


def main():
    fixtures = build()
    FRONTEND_DATA.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(fixtures, indent=2, ensure_ascii=False)
    FRONTEND_DATA.write_text(
        "// Generated by integration/build_demo.py from the pipeline outputs. Do not edit by hand.\n"
        f"window.DEMO_FIXTURES = {body};\n",
        encoding="utf-8",
    )
    for persona in fixtures:
        for key, path in persona["paths"].items():
            print(f"{persona['id']:<12} {key:<14} {path['total']['tons']:>9.2f} t  grade {path['grade']}  actions {len(path['actions'])}")
    print(f"wrote {FRONTEND_DATA}")


if __name__ == "__main__":
    sys.exit(main())
