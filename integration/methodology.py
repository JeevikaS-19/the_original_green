"""The methodology the AI reads on every call: factors, formulas, categories, report template.

Built from the calculator's own factor registry, so it cannot drift from the numbers used.
Written to frontend/data/methodology.json by build_demo.py.
"""

from factors import conversion_factors  # person_2_calculator
from calculator import COMMUTING_DAYS_PER_YEAR
from person_3_reporting.reporting import GRADE_BASIS, GRADE_BENCHMARKS, INDIA_PER_CAPITA_T


def _factor(entry):
    return {k: entry.get(k) for k in ("value", "unit", "source", "year", "status")}


def _factors():
    out = {}
    for group, value in conversion_factors.items():
        if isinstance(value, dict) and "value" in value:
            out[group] = _factor(value)
        elif isinstance(value, dict):
            out[group] = {
                (" / ".join(k) if isinstance(k, tuple) else k): _factor(v)
                for k, v in value.items()
                if isinstance(v, dict)
            }
    return out


FORMULAS = {
    "scope_1.vehicle": "annual_km x (L per 100 km / 100) x fuel factor (kg CO2e/L)",
    "scope_1.fuel_total": "litres per year x fuel factor (kg CO2e/L)",
    "scope_1.dg_set": "run hours per year x litres per hour x fuel factor",
    "scope_2.electricity": "kWh per year x grid factor (kg CO2e/kWh), location-based, one all-India factor",
    "scope_3.hardware": "device count x embodied-carbon factor per device per year",
    "scope_3.commute": (
        f"one-way km x 2 (return trip) x {COMMUTING_DAYS_PER_YEAR} working days x employees x mode share x mode factor"
    ),
    "scope_3.waste": "kg per year x waste factor for that category and disposal route",
    "scope_3.cloud": "GPU hours x cloud GPU factor",
    "confidence": "full data ±10%, partial ±25%, totals only ±40%, missing ±50%; total range is the sum of scope ranges",
    "intensity": "total t CO2e / employees (organisations) or / 1 (individuals)",
}

CATEGORIES = {
    "scope_1": {
        "vehicles": "Company-owned or leased vehicles: fuel logs, fleet km, fuel cards",
        "dg_set": "Diesel generators: run-hour logs, diesel purchases for backup power",
        "fuel_total": "Any other fuel burnt on site: LPG/PNG for canteens, boilers",
        "refrigerants": "AC/chiller gas top-ups (HFCs). No factor in this calculator: flag, do not calculate",
    },
    "scope_2": {
        "energy_meter": "Purchased grid electricity: meter readings, electricity bills (kWh)",
    },
    "scope_3": {
        "cloud": "Cloud compute bills, GPU hours (Cat. 1 purchased services)",
        "hardware": "Laptops, desktops, servers, GPUs bought (Cat. 2 capital goods)",
        "commute": "Staff travel between home and work: commute surveys (Cat. 7)",
        "waste": "Solid waste, e-waste, wastewater from vendor logs (Cat. 5)",
        "business_travel": "Flights, trains, hotels for work (Cat. 6). Not calculated here: flag",
        "purchased_goods": "Other purchases (Cat. 1). Not calculated here: flag",
    },
    "out_of_scope": "Personal spending, revenue, salaries, anything that is not an emission activity",
}

REPORT_TEMPLATE = [
    {"section": "Summary", "contents": "Total t CO2e, range, intensity per employee, grade and grade basis"},
    {"section": "Scope 1", "contents": "Measured sources, estimated sources, formula, inputs, result, confidence"},
    {"section": "Scope 2", "contents": "kWh, grid factor, location-based result, renewable share if known"},
    {"section": "Scope 3", "contents": "Each category: measured, estimated or illustrative, with formula and inputs"},
    {"section": "Assumptions", "contents": "Every assumed value: what, why, formula, effect on the total, how to replace it"},
    {"section": "Other reportable items", "contents": "Energy use, fuel use, waste by type, intensity, data quality mix"},
    {"section": "Reduction plan", "contents": "Ranked actions with t saved, cost, payback; what to change and where"},
    {"section": "Sources", "contents": "Every factor with its source, year and status (sourced or illustrative)"},
]

RULES = [
    "Never invent a source. Factors marked illustrative_assumption must be called illustrative.",
    "Never override uploaded data; only fill fields that are missing.",
    "Every estimated value needs a one-sentence assumption with the reasoning and the numbers used.",
    "Use India-specific, mid-range defaults. Be conservative.",
    "If something cannot be calculated with these factors, say so instead of guessing a number.",
]


def build():
    return {
        "version": 1,
        "factors": _factors(),
        "formulas": FORMULAS,
        "categories": CATEGORIES,
        "grading": {
            "basis": GRADE_BASIS,
            "india_per_capita_t": INDIA_PER_CAPITA_T,
            "bands": {k: [[None if b == float("inf") else b, g] for b, g in v] for k, v in GRADE_BENCHMARKS.items()},
        },
        "report_template": REPORT_TEMPLATE,
        "rules": RULES,
    }


def compact(method):
    """Short text form for prompts: one line per factor, plus formulas and rules."""
    lines = ["Factors (value unit, status):"]
    for group, value in method["factors"].items():
        items = {group: value} if "value" in value else {f"{group}.{k}": v for k, v in value.items()}
        for name, f in items.items():
            lines.append(f"- {name}: {f['value']} {f['unit']} ({f['status']})")
    lines.append("Formulas:")
    lines += [f"- {k}: {v}" for k, v in method["formulas"].items()]
    lines.append("Rules:")
    lines += [f"- {r}" for r in method["rules"]]
    return "\n".join(lines)
