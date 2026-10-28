"""Normalize calculator output and produce deterministic footprint reports."""

import argparse
import html
import json
import math
import sys
from pathlib import Path
from typing import Any

try:
    from .knowledge_base import CONDITIONS, reduction_knowledge_base
except ImportError:
    from knowledge_base import CONDITIONS, reduction_knowledge_base


SCOPE_NAMES = {
    "scope_1": "Scope 1 (Direct emissions)",
    "scope_2": "Scope 2 (Purchased energy)",
    "scope_3": "Scope 3 (Other indirect emissions)",
}
SCOPE_KEYS = ("scope_1", "scope_2", "scope_3")
TIER_ORG_TYPE = {"tier_1": "individual", "tier_2": "school", "tier_3": "enterprise"}
GRADE_BENCHMARKS = {
    "individual": ((2, "A"), (5, "B"), (10, "C"), (15, "D"), (math.inf, "F")),
    "school": ((50, "A"), (150, "B"), (300, "C"), (500, "D"), (math.inf, "F")),
    "enterprise": ((500, "A"), (1500, "B"), (3000, "C"), (5000, "D"), (math.inf, "F")),
}
GRADE_BASIS = "Illustrative benchmarks - replace with sourced data."
TIER_CONFIDENCE = {
    "tier_1": "±40% (default for tier)",
    "tier_2": "±15-30% (default for tier)",
    "tier_3": "±10-15% (default for tier)",
}
CURRENCY_FORMATS = "INR amounts are rounded to the nearest rupee."


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _amount_in_tons(value: Any) -> float | None:
    if isinstance(value, dict):
        for key in ("co2e_tons", "total_co2e_tons", "tons"):
            result = _number(value.get(key))
            if result is not None:
                return result
        for key in ("co2e_kg", "total_co2e_kg", "annual_co2e_kg", "kg"):
            result = _number(value.get(key))
            if result is not None:
                return result / 1000
        for key in ("total", "emissions"):
            result = _amount_in_tons(value.get(key))
            if result is not None:
                return result
    return _number(value)


def clean_label(label: Any) -> str:
    """Make contract category keys and vehicle identifiers reader-friendly."""
    value = str(label).strip()
    normalized = value.lower().replace(" ", "_").replace("-", "_").replace(".", "")
    aliases = {
        "32_hardware": "Hardware (embodied)",
        "3_2_hardware": "Hardware (embodied)",
        "hardware": "Hardware (embodied)",
        "33_commute": "Commute",
        "3_3_commute": "Commute",
        "commute": "Commute",
        "34_waste": "Waste",
        "3_4_waste": "Waste",
        "waste": "Waste",
    }
    return aliases.get(normalized, value)


def _display_name(key: str, item: Any) -> str:
    if isinstance(item, dict):
        vehicle_id = item.get("vehicle_id")
        if vehicle_id:
            return f"Fleet vehicle ({vehicle_id})"
        for name_key in ("name", "category", "source", "device_type", "fuel_type"):
            name = item.get(name_key)
            if name:
                return clean_label(name)
    return clean_label(key.replace("_", " ").strip())


def _collect_items(container: Any, label: str = "") -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if isinstance(container, list):
        for index, value in enumerate(container):
            items.extend(_collect_items(value, f"{label} {index + 1}".strip()))
    elif isinstance(container, dict):
        amount = _amount_in_tons(container)
        if amount is not None:
            items.append({**container, "name": _display_name(label, container), "tons": amount})
        else:
            for key, value in container.items():
                if key in ("water_metrics", "water_total_liters"):
                    continue
                items.extend(_collect_items(value, str(key)))
    return items


def _scope_items(scope: dict[str, Any]) -> list[dict[str, Any]]:
    containers: list[tuple[str, Any]] = []
    for key in (
        "breakdown",
        "breakdown_by_vehicle",
        "breakdown_by_device",
        "categories",
        "cloud",
        "office",
        "commute",
        "waste",
    ):
        if key in scope and scope[key] is not None:
            containers.append((key, scope[key]))
    collected: list[dict[str, Any]] = []
    for key, value in containers:
        collected.extend(_collect_items(value, key))
    return collected


def _normalize_tier(value: Any) -> tuple[str | None, str | None]:
    if value is None:
        return None, None
    normalized = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "tier_1": "tier_1",
        "tier1": "tier_1",
        "1": "tier_1",
        "overview": "tier_1",
        "basic": "tier_1",
        "tier_2": "tier_2",
        "tier2": "tier_2",
        "2": "tier_2",
        "standard": "tier_2",
        "tier_3": "tier_3",
        "tier3": "tier_3",
        "3": "tier_3",
        "detailed": "tier_3",
    }
    return aliases.get(normalized), normalized


def _normalize_org_type(value: Any) -> tuple[str | None, str | None]:
    if value is None:
        return None, None
    normalized = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "individual": "individual",
        "person": "individual",
        "school": "school",
        "college": "school",
        "campus": "school",
        "enterprise": "enterprise",
        "company": "enterprise",
        "organization": "enterprise",
        "organisation": "enterprise",
        "business": "enterprise",
    }
    return aliases.get(normalized), normalized


def _activity_value(activity: dict[str, Any], names: tuple[str, ...]) -> Any:
    for name in names:
        if name in activity:
            return activity[name]
    return None


def _waste_masses(value: Any, label: str = "") -> dict[str, float]:
    masses: dict[str, float] = {}
    if isinstance(value, list):
        for item in value:
            found = _waste_masses(item, label)
            for key, amount in found.items():
                masses[key] = masses.get(key, 0) + amount
    elif isinstance(value, dict):
        category = value.get("category") or value.get("name") or value.get("source") or label
        mass = _number(value.get("mass_kg_per_month"))
        if mass is not None:
            normalized_category = str(category).lower()
            if "e-waste" in normalized_category or "ewaste" in normalized_category:
                masses["e_waste_kg_per_month"] = mass
            elif "solid" in normalized_category and "waste" in normalized_category:
                masses["solid_waste_kg_per_month"] = mass
        for key, child in value.items():
            if isinstance(child, (dict, list)):
                found = _waste_masses(child, str(key))
                for mass_key, amount in found.items():
                    masses[mass_key] = masses.get(mass_key, 0) + amount
    return masses


def normalize_calc_results(raw: Any) -> dict[str, Any]:
    """Convert supported calculator payloads to a safe canonical representation."""
    warnings: list[str] = []
    if not isinstance(raw, dict):
        warnings.append("Input was not a JSON object; using an empty calculation.")
        raw = {}
    raw_scopes = raw.get("scopes")
    if not isinstance(raw_scopes, dict):
        warnings.append("Missing or invalid scopes object.")
        raw_scopes = {}

    scopes: dict[str, dict[str, Any]] = {}
    for scope_key in SCOPE_KEYS:
        source = raw_scopes.get(scope_key)
        if not isinstance(source, dict):
            warnings.append(f"Missing or invalid {scope_key}; using zero emissions.")
            source = {}
        categories = _scope_items(source)
        tons = None
        for key in ("total_co2e_tons", "total"):
            if key in source:
                tons = _amount_in_tons(source[key])
                if tons is not None:
                    break
        if tons is None:
            for key in ("total_co2e_kg",):
                value = _number(source.get(key))
                if value is not None:
                    tons = value / 1000
                    break
        if tons is None:
            tons = sum(item["tons"] for item in categories)
            if not categories:
                warnings.append(f"No emissions total or breakdown found for {scope_key}; using zero.")
        if tons < 0:
            warnings.append(f"Negative emissions for {scope_key} were clamped to zero.")
            tons = 0

        confidence = source.get("confidence")
        if confidence is None:
            metadata = raw.get("confidence_metadata")
            if isinstance(metadata, dict):
                confidence = metadata.get(scope_key)
        unverified = source.get("unverified_inputs")
        scopes[scope_key] = {
            "tons": tons,
            "confidence": str(confidence) if confidence is not None else None,
            "categories": categories,
            "unverified_inputs": [str(path) for path in unverified] if isinstance(unverified, list) else [],
            "has_data": bool(
                categories
                or any(
                    key in source and _amount_in_tons(source[key]) is not None
                    for key in ("total_co2e_tons", "total_co2e_kg", "total")
                )
            ),
        }

    tier_value = raw.get("tier")
    tier, legacy = _normalize_tier(tier_value)
    org_value = raw.get("org_type", raw.get("organization_type"))
    if org_value is None and legacy in ("school", "enterprise", "individual", "company", "college"):
        org_value = legacy
        tier = None
    org_type, raw_org_type = _normalize_org_type(org_value)
    if tier is None:
        tier = "tier_2"
        warnings.append("Tier was missing or unrecognized; defaulted to tier_2.")
    if org_type is None and org_value is None:
        org_type = TIER_ORG_TYPE[tier]
    if org_type is None:
        org_type = "school"
        warnings.append(
            f"Organization type {raw_org_type!r} is missing or unrecognized; using school benchmarks."
            if raw_org_type
            else "Organization type missing; using school benchmarks."
        )

    for scope_key in SCOPE_KEYS:
        if scopes[scope_key]["confidence"] is None:
            scopes[scope_key]["confidence"] = TIER_CONFIDENCE[tier]
        unverified = scopes[scope_key]["unverified_inputs"]
        if unverified:
            warnings.append(
                f"{SCOPE_NAMES[scope_key]}: {len(unverified)} input(s) use placeholder or missing factors "
                "and count as zero; the confidence label may overstate certainty."
            )
    missing_paths = [str(path) for path in raw.get("unverified_inputs") or []]
    if missing_paths:
        warnings.append(f"Missing or unverified inputs: {', '.join(missing_paths)}.")
    illustrative_paths = [str(path) for path in raw.get("illustrative_inputs") or []]
    if illustrative_paths:
        warnings.append(
            "Demo uses illustrative factors for "
            f"{len(illustrative_paths)} input(s). Real submissions use verified sources."
        )
    assumption_map = raw.get("assumptions") if isinstance(raw.get("assumptions"), dict) else {}
    assumption_count = sum(len(items) for items in assumption_map.values() if isinstance(items, list))
    if assumption_count:
        warnings.append(f"{assumption_count} input(s) were estimated from partial data; see the assumptions list.")

    activity = raw.get("activity_summary")
    if not isinstance(activity, dict):
        activity = {}
    all_items = [(scope_key, item) for scope_key in SCOPE_KEYS for item in scopes[scope_key]["categories"]]
    name_tons: dict[str, float] = {}
    for scope_key, item in all_items:
        name = item["name"].lower()
        for term in ("commute", "waste", "e-waste", "ewaste"):
            if term in name:
                name_tons[term] = name_tons.get(term, 0) + item["tons"]
        if "dg" in name or "generator" in name:
            name_tons["dg_set_present"] = 1

    def fact_number(names: tuple[str, ...], fallback: float | None) -> float | None:
        value = _number(_activity_value(activity, names))
        return value if value is not None else fallback

    dg_explicit = _activity_value(activity, ("dg_set_present", "has_dg_set"))
    dg_fact: bool | None
    if isinstance(dg_explicit, bool):
        dg_fact = dg_explicit
    elif "dg_set_present" in name_tons:
        dg_fact = True
    else:
        dg_fact = None

    facts: dict[str, Any] = {
        "scope_1_tons": scopes["scope_1"]["tons"],
        "scope_2_tons": scopes["scope_2"]["tons"],
        "scope_3_tons": scopes["scope_3"]["tons"],
        "commute_tons": fact_number(
            ("commute_tons", "scope_3_commute_tons"),
            name_tons.get("commute"),
        ),
        "waste_tons": fact_number(("waste_tons", "scope_3_waste_tons"), name_tons.get("waste")),
        "dg_set_present": dg_fact,
        "e_waste_kg_per_month": fact_number(
            ("e_waste_kg_per_month", "ewaste_kg_per_month"),
            None,
        ),
        "solid_waste_kg_per_month": fact_number(("solid_waste_kg_per_month",), None),
    }
    inferred_masses = _waste_masses(raw_scopes)
    for mass_key, mass in inferred_masses.items():
        if facts[mass_key] is None:
            facts[mass_key] = mass
    for _, item in all_items:
        name = item["name"].lower()
        if "e-waste" in name or "ewaste" in name:
            mass = _number(item.get("mass_kg_per_month"))
            if mass is not None and facts["e_waste_kg_per_month"] is None:
                facts["e_waste_kg_per_month"] = mass
        if "solid" in name and "waste" in name:
            mass = _number(item.get("mass_kg_per_month"))
            if mass is not None and facts["solid_waste_kg_per_month"] is None:
                facts["solid_waste_kg_per_month"] = mass

    total_tons = sum(scopes[key]["tons"] for key in SCOPE_KEYS)
    provided_total = _amount_in_tons(raw.get("total"))
    if provided_total is not None and abs(provided_total - total_tons) > max(abs(total_tons), 0.000001) * 0.01:
        warnings.append(
            f"Provided total ({provided_total:g} t) differs from scope sum ({total_tons:g} t) by more than 1%; scope sum used."
        )

    return {
        "timestamp": raw.get("timestamp"),
        "tier": tier,
        "org_type": org_type,
        "organization": raw.get("organization") or "Not provided",
        "period": raw.get("period") or "Not provided",
        "scopes": scopes,
        "total_tons": total_tons,
        "facts": facts,
        "warnings": warnings,
        "raw": raw,
    }


def format_inr(amount: Any) -> str:
    """Format a rupee amount with Indian digit grouping."""
    value = _number(amount)
    if value is None:
        value = 0
    rounded = int(round(value))
    sign = "-" if rounded < 0 else ""
    digits = str(abs(rounded))
    if len(digits) <= 3:
        grouped = digits
    else:
        grouped = digits[-3:]
        prefix = digits[:-3]
        groups: list[str] = []
        while prefix:
            groups.insert(0, prefix[-2:])
            prefix = prefix[:-2]
        grouped = ",".join(groups + [grouped])
    return f"₹{sign}{grouped}"


def format_inr_short(amount: Any) -> str:
    """Return a compact Indian rupee amount in lakh or crore."""
    value = _number(amount)
    if value is None:
        value = 0
    sign = "-" if value < 0 else ""
    value = abs(value)
    if value >= 10_000_000:
        return f"₹{sign}{value / 10_000_000:.1f} crore"
    if value >= 100_000:
        return f"₹{sign}{value / 100_000:.1f} lakh"
    return format_inr(-value if sign else value)


def _scope_for_category(category: str) -> str:
    if category.startswith("scope_1"):
        return "scope_1"
    if category.startswith("scope_2"):
        return "scope_2"
    if category.startswith("scope_3"):
        return "scope_3"
    return ""


def rank_suggestions(calculation_results: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    """Rank applicable planning actions by annual tons saved per lakh spent."""
    normalized = (
        calculation_results
        if (
            isinstance(calculation_results, dict)
            and isinstance(calculation_results.get("facts"), dict)
            and isinstance(calculation_results.get("scopes"), dict)
            and "total_tons" in calculation_results
        )
        else normalize_calc_results(calculation_results)
    )
    skipped: list[str] = []
    candidates: list[dict[str, Any]] = []
    for action in reduction_knowledge_base:
        scope_key = _scope_for_category(action["category"])
        scope_tons = normalized["scopes"].get(scope_key, {}).get("tons", 0)
        if scope_tons < 0.5:
            skipped.append(f"{action['action']}: {scope_key} is below 0.5 t.")
            continue
        condition_id = action["applicable_when"]
        predicate = CONDITIONS.get(condition_id)
        if predicate is None:
            skipped.append(f"{action['action']}: unknown condition {condition_id!r}.")
            continue
        applicable, reason = predicate(normalized["facts"])
        if not applicable:
            skipped.append(f"{action['action']}: {reason}.")
            continue
        saved = min(float(action["carbon_saved_tons_per_year"]), float(scope_tons))
        notes = action["notes"]
        if saved < action["carbon_saved_tons_per_year"]:
            notes = f"{notes} Savings capped at the scope total ({scope_tons:g} t/year)."
        cost = float(action["cost_inr"])
        roi = saved / (cost / 100_000) if cost > 0 else 0
        candidates.append(
            {
                **action,
                "scope": scope_key,
                "carbon_saved": round(saved, 1),
                "cost_display": (
                    f"{format_inr(cost)} (recurring annual cost)"
                    if action["cost_type"] == "annual_opex"
                    else format_inr(cost)
                ),
                "cost_display_short": format_inr_short(cost),
                "payback_display": (
                    "N/A (recurring cost)"
                    if action["cost_type"] == "annual_opex"
                    else f"{action['payback_months']} months"
                ),
                "roi": round(roi, 3),
                "notes": notes,
            }
        )
    candidates.sort(
        key=lambda item: (
            -item["roi"],
            item["payback_months"] if item["payback_months"] is not None else math.inf,
            -item["carbon_saved"],
        )
    )
    suggestions = candidates[:5]
    for rank, suggestion in enumerate(suggestions, 1):
        suggestion["rank"] = rank
    return suggestions, skipped


def calculate_grade(co2e_tons: Any, org_type: str = "school") -> str:
    """Assign an illustrative A-F grade using organization-specific thresholds."""
    tons = _number(co2e_tons)
    tons = max(0, tons if tons is not None else 0)
    normalized_org, _ = _normalize_org_type(org_type)
    benchmarks = GRADE_BENCHMARKS.get(normalized_org or "school", GRADE_BENCHMARKS["school"])
    for upper_bound, grade in benchmarks:
        if tons < upper_bound:
            return grade
    return "F"


def _top_drivers(normalized: dict[str, Any]) -> list[dict[str, Any]]:
    total = normalized["total_tons"]
    drivers: list[dict[str, Any]] = []
    for scope_key in SCOPE_KEYS:
        categories = normalized["scopes"][scope_key]["categories"]
        if categories:
            for item in categories:
                if item["tons"] > 0:
                    drivers.append(
                        {
                            "name": item["name"] or SCOPE_NAMES[scope_key],
                            "scope": scope_key,
                            "tons": _round_tons(item["tons"]),
                            "pct": round(item["tons"] / total * 100, 1) if total > 0 else 0,
                        }
                    )
        elif normalized["scopes"][scope_key]["tons"] > 0:
            tons = normalized["scopes"][scope_key]["tons"]
            drivers.append(
                {
                    "name": SCOPE_NAMES[scope_key],
                    "scope": scope_key,
                    "tons": _round_tons(tons),
                    "pct": round(tons / total * 100, 1) if total > 0 else 0,
                }
            )
    drivers.sort(key=lambda item: (-item["tons"], item["name"].lower()))
    return drivers[:3]


def _report_categories(categories: list[dict[str, Any]]) -> list[dict[str, Any]]:
    amount_keys = {
        "co2e_tons",
        "total_co2e_tons",
        "tons",
        "co2e_kg",
        "total_co2e_kg",
        "annual_co2e_kg",
        "kg",
    }
    return [
        {
            **{key: value for key, value in category.items() if key not in amount_keys},
            "name": clean_label(category.get("name", "Category")),
            "tons": _round_tons(category["tons"]),
        }
        for category in categories
    ]


def generate_report(
    calc_results: dict[str, Any],
    org_type: str | None = None,
    use_llm: bool = False,
) -> dict[str, Any]:
    """Build the report using deterministic rules; LLM phrasing is not enabled."""
    del use_llm
    normalized = normalize_calc_results(calc_results)
    warnings = list(normalized["warnings"])
    if org_type is not None:
        parsed_org, invalid_org = _normalize_org_type(org_type)
        if parsed_org is None:
            warnings.append(f"CLI organization type {invalid_org!r} is unrecognized; using school.")
            normalized["org_type"] = "school"
        else:
            normalized["org_type"] = parsed_org

    suggestions, skipped = rank_suggestions(normalized)
    total = normalized["total_tons"]
    # A zero total usually means nothing could be calculated, not that emissions are zero.
    grade = calculate_grade(total, normalized["org_type"]) if total > 0 else "N/A"
    by_scope: dict[str, dict[str, Any]] = {}
    for scope_key in SCOPE_KEYS:
        scope = normalized["scopes"][scope_key]
        by_scope[scope_key] = {
            "tons": _round_tons(scope["tons"]),
            "pct": round(scope["tons"] / total * 100, 1) if total > 0 else 0,
            "confidence": scope["confidence"],
            "categories": _report_categories(scope["categories"]),
            "has_data": scope["has_data"],
        }
    top_drivers = _top_drivers(normalized)
    if top_drivers:
        summary = (
            f"Annual emissions are {total:.1f} tCO2e, earning grade {grade}; "
            f"the largest reported driver is {top_drivers[0]['name']}."
        )
    else:
        summary = (
            f"No emissions could be calculated from the data provided, so no grade is assigned "
            f"(grade {grade})."
        )
    report = {
        "meta": {
            "organization": normalized["organization"],
            "period": normalized["period"],
            "tier": normalized["tier"],
            "org_type": normalized["org_type"],
            "generated_at": normalized["timestamp"] or "Not provided",
        },
        "summary": summary,
        "total_emissions": _round_tons(total),
        "grade": grade,
        "grade_basis": GRADE_BASIS,
        "by_scope": by_scope,
        "top_drivers": top_drivers,
        "top_5_actions": [
            {
                "rank": item["rank"],
                "action": item["action"],
                "description": item["description"],
                "scope": item["scope"],
                "carbon_saved": item["carbon_saved"],
                "cost_inr": int(item["cost_inr"]),
                "cost_display": item["cost_display"],
                "payback_months": item["payback_months"],
                "payback": item["payback_display"],
                "roi": item["roi"],
                "cost_type": item["cost_type"],
                "basis": item["basis"],
                "notes": item["notes"],
            }
            for item in suggestions
        ],
        "actions_message": (
            "No actions applied: emissions are below the action thresholds, or the activity data needed "
            "(for example DG set, waste or commute details) was not provided. See diagnostics."
            if not suggestions
            else None
        ),
        "top_drivers_comparisons": {
            "basis": "Rough approximations only.",
            "flights": round(total / 0.5, 1),
            "cars": round(total / 4, 1),
            "trees": round(total / 0.025, 1),
        },
        "improvement_vs_last_period": "N/A (no previous period provided)",
        "methodology": {
            "assumptions": [
                "Knowledge-base savings and costs are planning estimates, not guarantees.",
                "Action savings overlap and should not be summed.",
                GRADE_BASIS,
                "Flights, cars, and trees are rough approximations for comparison only.",
                CURRENCY_FORMATS,
            ],
            "confidence_notes": "Scope confidence is passed through from the calculator or defaulted by tier.",
            "sources": [
                "Hardcoded Person 3 reduction knowledge base; every value requires verification before use.",
                GRADE_BASIS,
            ],
        },
        "diagnostics": {"skipped": skipped},
        "warnings": warnings,
    }
    return {"report": report}


def _report_body(report: dict[str, Any]) -> dict[str, Any]:
    if isinstance(report, dict) and isinstance(report.get("report"), dict):
        return report["report"]
    return report if isinstance(report, dict) else {}


def _value(value: Any, default: str = "N/A") -> str:
    return default if value is None or value == "" else str(value)


def _tons(value: Any) -> str:
    amount = _number(value)
    return f"{(amount if amount is not None else 0):.1f}"


def _round_tons(value: Any) -> float:
    amount = _number(value)
    return round(amount if amount is not None else 0.0, 1)


def render_text(report: dict[str, Any]) -> str:
    """Render a plain-text report with readable, compact sections."""
    body = _report_body(report)
    lines = [
        "CARBON FOOTPRINT REPORT",
        "=" * 78,
        f"Organization: {_value(body.get('meta', {}).get('organization'))}",
        f"Period: {_value(body.get('meta', {}).get('period'))}",
        f"Tier / organization type: {_value(body.get('meta', {}).get('tier'))} / "
        f"{_value(body.get('meta', {}).get('org_type'))}",
        "",
        "EXECUTIVE SUMMARY",
        "-" * 78,
        _value(body.get("summary")),
        f"Annual total: {_tons(body.get('total_emissions'))} tCO2e",
        f"Grade: {_value(body.get('grade'))} ({_value(body.get('grade_basis'))})",
        f"Improvement vs last period: {_value(body.get('improvement_vs_last_period'))}",
        "",
        "SCOPE BREAKDOWN",
        "-" * 78,
    ]
    for key in SCOPE_KEYS:
        scope = body.get("by_scope", {}).get(key, {})
        lines.append(
            f"{SCOPE_NAMES[key]:38.38} {_tons(scope.get('tons', 0)):>9} t "
            f"({scope.get('pct', 0):>5}%)  confidence: {_value(scope.get('confidence'))}"
        )
    lines.extend(["", "TOP DRIVERS", "-" * 78])
    drivers = body.get("top_drivers", [])
    if drivers:
        for driver in drivers:
            lines.append(
                f"- {_value(driver.get('name'))}: {_tons(driver.get('tons', 0))} t "
                f"({driver.get('pct', 0)}%; {_value(driver.get('scope'))})"
            )
    else:
        lines.append("No emissions drivers were available.")
    lines.extend(["", "TOP REDUCTION OPPORTUNITIES", "-" * 78])
    actions = body.get("top_5_actions", [])
    if actions:
        for item in actions:
            lines.extend(
                [
                    f"{item.get('rank', '-')}. {_value(item.get('action'))} "
                    f"[{_value(item.get('scope'))}]",
                    f"   Save: {_tons(item.get('carbon_saved', 0))} t/year | "
                    f"Cost: {_value(item.get('cost_display'))} | "
                    f"Payback: {_value(item.get('payback'))} | ROI: "
                    f"{item.get('roi', 0)} t/lakh",
                    f"   {_value(item.get('description'))}",
                ]
            )
    else:
        lines.append(_value(body.get("actions_message")))
    lines.extend(["", "DETAILED BREAKDOWN", "-" * 78])
    for key in SCOPE_KEYS:
        scope = body.get("by_scope", {}).get(key, {})
        lines.append(f"{SCOPE_NAMES[key]}: {_tons(scope.get('tons', 0))} tCO2e")
        if not scope.get("has_data", bool(scope.get("categories"))):
            lines.append("  No data provided")
        for category in scope.get("categories", []):
            lines.append(f"  - {_value(category.get('name'))}: {_tons(category.get('tons', 0))} t")
    lines.extend(
        [
            "",
            "METHODOLOGY AND ASSUMPTIONS",
            "-" * 78,
            "Knowledge-base values are planning estimates; verify before investment decisions.",
            "Benchmarks are illustrative and should be replaced with sourced data.",
            _value(body.get("methodology", {}).get("confidence_notes")),
            "Comparisons to flights, cars, and trees are rough approximations.",
            "Action savings overlap and should not be summed.",
            "Assumptions:",
        ]
    )
    lines.extend(f"- {assumption}" for assumption in body.get("methodology", {}).get("assumptions", []))
    if body.get("warnings"):
        lines.extend(["", "WARNINGS", "-" * 78])
        lines.extend(f"- {warning}" for warning in body["warnings"])
    return "\n".join(lines) + "\n"


def render_markdown(report: dict[str, Any]) -> str:
    """Render the report as Markdown with scope and action tables."""
    body = _report_body(report)
    lines = [
        "# Carbon Footprint Report",
        "",
        f"- **Organization:** {_value(body.get('meta', {}).get('organization'))}",
        f"- **Period:** {_value(body.get('meta', {}).get('period'))}",
        f"- **Tier / organization type:** {_value(body.get('meta', {}).get('tier'))} / "
        f"{_value(body.get('meta', {}).get('org_type'))}",
        "",
        "## Executive Summary",
        "",
        _value(body.get("summary")),
        "",
        f"**Total:** {_tons(body.get('total_emissions', 0))} tCO2e/year  ",
        f"**Grade:** {body.get('grade', 'N/A')} — {_value(body.get('grade_basis'))}",
        "",
        f"**Improvement vs last period:** {_value(body.get('improvement_vs_last_period'))}",
        "",
        "## Scope Breakdown",
        "",
        "| Scope | Emissions (tCO2e) | Share | Confidence |",
        "|---|---:|---:|---|",
    ]
    for key in SCOPE_KEYS:
        scope = body.get("by_scope", {}).get(key, {})
        lines.append(
            f"| {SCOPE_NAMES[key]} | {_tons(scope.get('tons', 0))} | {scope.get('pct', 0)}% | "
            f"{_value(scope.get('confidence'))} |"
        )
    lines.extend(["", "## Top Drivers", ""])
    for driver in body.get("top_drivers", []):
        lines.append(f"- **{_value(driver.get('name'))}:** {_tons(driver.get('tons', 0))} t ({driver.get('pct', 0)}%)")
    if not body.get("top_drivers"):
        lines.append("No emissions drivers were available.")
    lines.extend(
        [
            "",
            "## Top Reduction Opportunities",
            "",
            "| # | Action | Scope | Save (t/year) | Cost | Payback | ROI (t/lakh) |",
            "|---:|---|---|---:|---:|---|---:|",
        ]
    )
    for item in body.get("top_5_actions", []):
        lines.append(
            f"| {item.get('rank', '-')} | {_value(item.get('action'))} | "
            f"{_value(item.get('scope'))} | {_tons(item.get('carbon_saved', 0))} | "
            f"{_value(item.get('cost_display'))} | {_value(item.get('payback'))} | "
            f"{item.get('roi', 0)} |"
        )
    if not body.get("top_5_actions"):
        lines.append(f"| | {_value(body.get('actions_message'))} | | | | | |")
    lines.extend(["", "## Detailed Breakdown", ""])
    for key in SCOPE_KEYS:
        scope = body.get("by_scope", {}).get(key, {})
        lines.append(f"### {SCOPE_NAMES[key]} — {_tons(scope.get('tons', 0))} tCO2e")
        if not scope.get("has_data", bool(scope.get("categories"))):
            lines.append("- No data provided")
        for category in scope.get("categories", []):
            lines.append(f"- {_value(category.get('name'))}: {_tons(category.get('tons', 0))} t")
        lines.append("")
    lines.extend(
        [
            "## Methodology and Assumptions",
            "",
            "Knowledge-base values are planning estimates; verify before investment decisions. "
            "Benchmarks are illustrative, not sourced, and should be replaced with sourced data. "
            "Flight, car, and tree comparisons are rough approximations. "
            "Action savings overlap and should not be summed.",
            "",
        ]
    )
    lines.extend(f"- {assumption}" for assumption in body.get("methodology", {}).get("assumptions", []))
    if body.get("warnings"):
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {warning}" for warning in body["warnings"])
    return "\n".join(lines).rstrip() + "\n"


def render_html(report: dict[str, Any]) -> str:
    """Render a self-contained, escaped, print-friendly HTML report."""
    body = _report_body(report)
    esc = lambda value: html.escape(_value(value), quote=True)
    scope_rows: list[str] = []
    for key in SCOPE_KEYS:
        scope = body.get("by_scope", {}).get(key, {})
        pct = _number(scope.get("pct")) or 0
        width = min(100, max(0, pct))
        scope_rows.append(
            "<tr><th>"
            + esc(SCOPE_NAMES[key])
            + "</th><td>"
            + esc(_tons(scope.get("tons", 0)))
            + "</td><td>"
            + esc(pct)
            + "%</td><td>"
            + esc(scope.get("confidence"))
            + f'</td><td><div class="bar" style="width:{width:.1f}%"></div></td></tr>'
        )
    driver_rows = "".join(
        "<li>"
        + esc(item.get("name"))
        + f": {esc(_tons(item.get('tons')))} t ({esc(item.get('pct'))}%)</li>"
        for item in body.get("top_drivers", [])
    ) or "<li>No emissions drivers were available.</li>"
    action_rows = "".join(
        "<tr>"
        + f"<td>{esc(item.get('rank'))}</td><td>{esc(item.get('action'))}</td>"
        + f"<td>{esc(item.get('scope'))}</td><td>{esc(item.get('carbon_saved'))}</td>"
        + f"<td>{esc(item.get('cost_display'))}</td><td>{esc(item.get('payback'))}</td>"
        + f"<td>{esc(item.get('roi'))}</td></tr>"
        for item in body.get("top_5_actions", [])
    ) or f'<tr><td colspan="7">{esc(body.get("actions_message"))}</td></tr>'
    details: list[str] = []
    for key in SCOPE_KEYS:
        scope = body.get("by_scope", {}).get(key, {})
        details.append(f"<h3>{esc(SCOPE_NAMES[key])} — {esc(_tons(scope.get('tons', 0)))} tCO2e</h3><ul>")
        if not scope.get("has_data", bool(scope.get("categories"))):
            details.append("<li>No data provided</li>")
        for category in scope.get("categories", []):
            details.append(f"<li>{esc(category.get('name'))}: {esc(_tons(category.get('tons', 0)))} t</li>")
        details.append("</ul>")
    assumptions = "".join(
        f"<li>{esc(value)}</li>" for value in body.get("methodology", {}).get("assumptions", [])
    )
    warnings = "".join(f"<li>{esc(value)}</li>" for value in body.get("warnings", []))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Carbon Footprint Report</title>
<style>
body{{font:16px/1.5 Arial,sans-serif;color:#20312b;max-width:1000px;margin:2rem auto;padding:0 1rem}}
h1,h2{{color:#176b4d}} table{{border-collapse:collapse;width:100%;margin:1rem 0}}
th,td{{border:1px solid #cbd8d1;padding:.55rem;text-align:left}} th{{background:#eef5f0}}
.bar{{height:12px;background:#48a879}} .summary{{border-left:4px solid #48a879;padding:.8rem 1rem;background:#f4f8f5}}
@media print{{body{{max-width:none;margin:0}} a{{color:inherit}}}}
</style></head><body>
<h1>Carbon Footprint Report</h1>
<p>Organization: {esc(body.get('meta', {}).get('organization'))} |
Period: {esc(body.get('meta', {}).get('period'))} |
Tier: {esc(body.get('meta', {}).get('tier'))}</p>
<h2>Executive Summary</h2><p class="summary">{esc(body.get('summary'))}</p>
<p>Total: <strong>{esc(_tons(body.get('total_emissions')))} tCO2e/year</strong> |
Grade: <strong>{esc(body.get('grade'))}</strong> — {esc(body.get('grade_basis'))}</p>
<p>Improvement vs last period: {esc(body.get('improvement_vs_last_period'))}</p>
<h2>Scope Breakdown</h2><table><thead><tr><th>Scope</th><th>tCO2e</th><th>Share</th><th>Confidence</th><th></th></tr></thead>
<tbody>{''.join(scope_rows)}</tbody></table>
<h2>Top Drivers</h2><ul>{driver_rows}</ul>
<h2>Top Reduction Opportunities</h2><table><thead><tr><th>#</th><th>Action</th><th>Scope</th>
<th>Save (t/year)</th><th>Cost</th><th>Payback</th><th>ROI (t/lakh)</th></tr></thead>
<tbody>{action_rows}</tbody></table>
<h2>Detailed Breakdown</h2>{''.join(details)}
<h2>Methodology and Assumptions</h2><p>Knowledge-base values are planning estimates;
benchmarks are illustrative and should be replaced with sourced data. Comparisons are rough approximations.
Action savings overlap and should not be summed.</p>
<ul>{assumptions}</ul>{f'<h2>Warnings</h2><ul>{warnings}</ul>' if warnings else ''}
</body></html>"""


def run(
    input_path: str | Path,
    out_dir: str | Path,
    org_type: str | None = None,
    formats: tuple[str, ...] | list[str] = ("json", "txt", "md", "html"),
) -> dict[str, Any]:
    """Read calculation JSON, create a report, and write selected UTF-8 formats."""
    input_file = Path(input_path)
    if not input_file.is_file():
        raise FileNotFoundError(f"Input calculation file not found: {input_file}")
    with input_file.open("r", encoding="utf-8") as file:
        calc_results = json.load(file)
    report = generate_report(calc_results, org_type=org_type)
    output_dir = Path(out_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    format_writers = {
        "json": lambda: json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        "txt": lambda: render_text(report),
        "md": lambda: render_markdown(report),
        "html": lambda: render_html(report),
    }
    for output_format in formats:
        normalized_format = output_format.strip().lower()
        if normalized_format not in format_writers:
            raise ValueError(f"Unsupported output format: {output_format}")
        file_name = {"json": "output.json", "txt": "output.txt", "md": "output.md", "html": "output.html"}[
            normalized_format
        ]
        with (output_dir / file_name).open("w", encoding="utf-8", newline="\n") as file:
            file.write(format_writers[normalized_format]())
    return report


def main(argv: list[str] | None = None) -> int:
    """Run the command-line interface."""
    parser = argparse.ArgumentParser(description="Generate a carbon footprint report.")
    parser.add_argument("--input", required=True, help="Path to Person 2 calculation JSON.")
    parser.add_argument("--out-dir", required=True, help="Directory for generated report files.")
    parser.add_argument("--org-type", help="Override organization type: individual, school, enterprise.")
    parser.add_argument("--formats", default="json,txt,md,html", help="Comma-separated: json,txt,md,html.")
    parser.add_argument("--llm", action="store_true", help="Reserved; numbers remain deterministic.")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        formats = tuple(part.strip() for part in args.formats.split(",") if part.strip())
        run(args.input, args.out_dir, org_type=args.org_type, formats=formats)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
