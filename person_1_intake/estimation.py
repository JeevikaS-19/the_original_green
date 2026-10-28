"""Person 1: estimate missing inputs, label every estimate, and merge without overriding uploads.

Flow:
    detect_missing -> propose -> validate -> merge

- Uploaded data always wins. A proposal only fills a field that is missing or blank.
- Every filled field carries an assumption sentence and is listed in the output.
- Proposals come from one of two sources:
    * RuleProposer: India-oriented planning defaults in this file, each with its reason.
      Used when no LLM client is configured, and always in tests.
    * LLMProposer: asks a client (for example Gemini) for proposals. The response is
      validated; a rejected response falls back to RuleProposer.
- Estimates are never presented as measured. Scopes with estimates are at most "partial".
"""

import json
import math

from validators import COMMUTE_MODES, IntakeError

# ---- Planning defaults. Each one is an assumption, not a sourced value. ----

VEHICLES_PER_EMPLOYEE = 0.04  # 20 vehicles for 500 people
VEHICLE_FUEL_SPLIT = {"diesel": 0.8, "petrol": 0.2}  # CNG left out: the calculator is per litre
ANNUAL_KM_PER_VEHICLE = 20000  # mid-range for company cars and vans
VEHICLE_EFFICIENCY_L_PER_100KM = {"diesel": 11.0, "petrol": 7.0}  # close to the demo vans and cars
DG_SET_DEFAULT = {"capacity_kva": 50, "fuel_type": "diesel", "hours_per_year": 500, "fuel_consumption_per_hour": 15}
DG_MIN_EMPLOYEES = 100  # below this, assume no backup generator

ILLUSTRATIVE_TARIFF_INR_PER_KWH = 7.5  # shared assumption, also used by the closed-source path
COMMUTE_SPLIT_DEFAULT = {"car": 0.40, "bus": 0.35, "bike": 0.15, "wfh": 0.10}  # typical urban India split
COMMUTE_KM_DEFAULT = 12
WORKING_DAYS = 250

LAPTOP_PER_EMPLOYEE = 1.0
DESKTOP_SHARE = 0.20
SERVERS_PER_EMPLOYEE = 0.005
LAPTOP_LIFESPAN_YEARS = 5
DESKTOP_LIFESPAN_YEARS = 6
SERVER_LIFESPAN_YEARS = 5

SOLID_WASTE_KG_PER_EMPLOYEE_DAY = 0.3
E_WASTE_KG_PER_EMPLOYEE_YEAR = 0.25
OFFICE_DAYS_PER_MONTH = 20

# Bounds for LLM proposals. Anything outside is rejected, not clipped.
BOUNDS = {
    "vehicles_count": (0, 5000),
    "annual_distance_km": (1000, 200000),
    "efficiency": (2, 60),
    "monthly_kwh": (1, 1e8),
    "hardware_quantity": (0, 1e6),
    "waste_kg_per_month": (0, 1e8),
}

SCOPE_FIELDS = {
    "scope_1": ("vehicles", "dg_set"),
    "scope_2": ("energy_meter",),
    "scope_3": ("hardware", "commute", "waste"),
}


class ProposalRejected(ValueError):
    """An LLM proposal failed validation."""


def _blank(value):
    return value is None or value == "" or value == [] or value == {}


def _count(value):
    return int(round(value))


def detect_missing(uploaded, org):
    """Return {scope: [missing fields]} for fields the uploads do not give.

    uploaded: {"scope_1": {...}, "scope_2": {...}, "scope_3": {...}} as parsed by the intake.
    org: {"employee_count": int, "state": str, "energy_bill_inr": number, ...}
    """
    missing = {}
    s1 = uploaded.get("scope_1") or {}
    if _blank(s1.get("vehicles")) and _blank(s1.get("dg_set")):
        missing["scope_1"] = ["vehicles", "dg_set"]

    s2 = uploaded.get("scope_2") or {}
    if _blank(s2.get("energy_meter")):
        missing["scope_2"] = ["energy_meter"]

    s3 = uploaded.get("scope_3") or {}
    gaps = [field for field in SCOPE_FIELDS["scope_3"] if _blank(s3.get(field))]
    if gaps:
        missing["scope_3"] = gaps
    return missing


def _check_number(value, bound_name, label, problems):
    low, high = BOUNDS[bound_name]
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not (low <= value <= high):
        problems.append(f"{label} must be a number between {low} and {high}")


def validate_proposal(proposal, missing):
    """Check a proposal before it is merged. Raises ProposalRejected with every problem found.

    proposal shape: {scope: {field: {"value": ..., "assumption": "..."}}}
    """
    if not isinstance(proposal, dict):
        raise ProposalRejected("proposal is not a JSON object")
    problems = []
    for scope, fields in proposal.items():
        if scope not in missing:
            problems.append(f"{scope} was not missing; uploads must not be overridden")
            continue
        if not isinstance(fields, dict):
            problems.append(f"{scope} must be an object")
            continue
        for field, item in fields.items():
            if field not in missing[scope]:
                problems.append(f"{scope}.{field} was not missing")
                continue
            if not isinstance(item, dict) or not str(item.get("assumption", "")).strip():
                problems.append(f"{scope}.{field} needs a non-empty assumption")
                continue
            value = item.get("value")
            if field == "vehicles":
                if not isinstance(value, list):
                    problems.append("vehicles must be a list")
                    continue
                for index, vehicle in enumerate(value):
                    _check_number(vehicle.get("annual_distance_km"), "annual_distance_km", f"vehicle {index + 1} distance", problems)
                    _check_number(vehicle.get("fuel_efficiency_l_per_100km"), "efficiency", f"vehicle {index + 1} efficiency", problems)
            elif field == "commute":
                split = (value or {}).get("mode_split") or {}
                if set(split) != set(COMMUTE_MODES) or abs(sum(split.values()) - 1) > 0.01:
                    problems.append("commute mode_split must cover car, bus, bike, wfh and sum to 1")
            elif field == "energy_meter":
                _check_number((value or {}).get("monthly_kwh"), "monthly_kwh", "monthly_kwh", problems)
    if problems:
        raise ProposalRejected("; ".join(problems))
    return proposal


class RuleProposer:
    """Deterministic India-oriented defaults. Every field carries a reason."""

    def propose(self, missing, org):
        employees = org.get("employee_count")
        if not isinstance(employees, (int, float)) or employees <= 0:
            raise IntakeError("Estimation needs employee_count in the org details")
        employees = int(employees)
        proposal = {}

        if "scope_1" in missing:
            proposal["scope_1"] = self._scope_1(employees, org)
        if "scope_2" in missing:
            proposal["scope_2"] = self._scope_2(org)
        if "scope_3" in missing:
            proposal["scope_3"] = self._scope_3(missing["scope_3"], employees)
        return {scope: fields for scope, fields in proposal.items() if fields}

    def _scope_1(self, employees, org):
        fields = {}
        count = _count(employees * VEHICLES_PER_EMPLOYEE)
        if count > 0:
            vehicles = []
            for fuel, share in VEHICLE_FUEL_SPLIT.items():
                for index in range(_count(count * share)):
                    vehicles.append({
                        "vehicle_id": f"est_{fuel}_{index + 1:02d}",
                        "make": "Estimated",
                        "model": f"{fuel} fleet vehicle",
                        "fuel_type": fuel,
                        "annual_distance_km": ANNUAL_KM_PER_VEHICLE,
                        "fuel_efficiency_l_per_100km": VEHICLE_EFFICIENCY_L_PER_100KM[fuel],
                    })
            if vehicles:
                fields["vehicles"] = {
                    "value": vehicles,
                    "assumption": (
                        f"About {len(vehicles)} vehicles from {employees} employees "
                        f"({VEHICLES_PER_EMPLOYEE:.2f} per employee), split {int(VEHICLE_FUEL_SPLIT['diesel'] * 100)}% diesel "
                        f"and {int(VEHICLE_FUEL_SPLIT['petrol'] * 100)}% petrol, {ANNUAL_KM_PER_VEHICLE:,} km each a year."
                    ),
                }
        if employees >= DG_MIN_EMPLOYEES:
            fields["dg_set"] = {
                "value": dict(DG_SET_DEFAULT),
                "assumption": (
                    "Backup diesel generator assumed for an office of this size: "
                    f"{DG_SET_DEFAULT['capacity_kva']} kVA, {DG_SET_DEFAULT['hours_per_year']} hours a year at "
                    f"{DG_SET_DEFAULT['fuel_consumption_per_hour']} L/h."
                ),
            }
        return fields

    def _scope_2(self, org):
        bill = org.get("energy_bill_inr")
        if not isinstance(bill, (int, float)) or bill <= 0:
            return {}
        monthly_kwh = bill / ILLUSTRATIVE_TARIFF_INR_PER_KWH / 12
        state = org.get("state") or "default_india"
        return {
            "energy_meter": {
                "value": {"monthly_kwh": round(monthly_kwh, 1), "region_state": state},
                "assumption": (
                    f"Annual bill of ₹{bill:,.0f} at an illustrative tariff of ₹{ILLUSTRATIVE_TARIFF_INR_PER_KWH}/kWh "
                    f"gives about {monthly_kwh:,.0f} kWh a month. Check the tariff for {state}."
                ),
            }
        }

    def _scope_3(self, gaps, employees):
        fields = {}
        if "hardware" in gaps:
            devices = [
                {"device_type": "Laptop", "model": "Estimated laptop", "quantity": _count(employees * LAPTOP_PER_EMPLOYEE),
                 "purchase_year": None, "expected_lifespan_years": LAPTOP_LIFESPAN_YEARS},
                {"device_type": "Desktop", "model": "Estimated desktop", "quantity": _count(employees * DESKTOP_SHARE),
                 "purchase_year": None, "expected_lifespan_years": DESKTOP_LIFESPAN_YEARS},
                {"device_type": "Server", "model": "Estimated server", "quantity": _count(employees * SERVERS_PER_EMPLOYEE),
                 "purchase_year": None, "expected_lifespan_years": SERVER_LIFESPAN_YEARS},
            ]
            devices = [device for device in devices if device["quantity"] > 0]
            if devices:
                fields["hardware"] = {
                    "value": devices,
                    "assumption": (
                        f"One laptop per employee ({LAPTOP_PER_EMPLOYEE:g}), {int(DESKTOP_SHARE * 100)}% desktops, "
                        f"{SERVERS_PER_EMPLOYEE * 100:g} servers per 100 employees. No inventory was given."
                    ),
                }
        if "commute" in gaps:
            fields["commute"] = {
                "value": {
                    "total_employees": employees,
                    "mode_split": dict(COMMUTE_SPLIT_DEFAULT),
                    "avg_distance_km": COMMUTE_KM_DEFAULT,
                },
                "assumption": (
                    "Typical urban India commute split (40% car, 35% bus, 15% bike, 10% work from home), "
                    f"{COMMUTE_KM_DEFAULT} km average, {WORKING_DAYS} working days. Replace with a staff survey."
                ),
            }
        if "waste" in gaps:
            solid = employees * SOLID_WASTE_KG_PER_EMPLOYEE_DAY * OFFICE_DAYS_PER_MONTH
            e_waste = employees * E_WASTE_KG_PER_EMPLOYEE_YEAR / 12
            fields["waste"] = {
                "value": [
                    {"category": "Solid Waste", "mass_kg_per_month": round(solid, 1)},
                    {"category": "E-waste", "mass_kg_per_month": round(e_waste, 1)},
                ],
                "assumption": (
                    f"{SOLID_WASTE_KG_PER_EMPLOYEE_DAY} kg solid waste per employee per office day and "
                    f"{E_WASTE_KG_PER_EMPLOYEE_YEAR} kg e-waste per employee a year. No waste log was given."
                ),
            }
        return fields


class LLMProposer:
    """Asks an LLM for proposals. `client` is any callable taking a prompt and returning text.

    No client is configured in this repository, so this class is not used by default.
    """

    def __init__(self, client):
        self.client = client

    def prompt(self, missing, org):
        return (
            "You fill in missing inputs for a carbon footprint estimate. Return JSON only.\n"
            "Rules: use India-specific defaults; be conservative (mid-range); never invent sources; "
            "give every value an 'assumption' sentence with your reasoning; never override uploaded data.\n"
            f"Organisation: {json.dumps(org)}\n"
            f"Missing fields: {json.dumps(missing)}\n"
            "Format: {scope: {field: {\"value\": ..., \"assumption\": \"...\"}}}"
        )

    def propose(self, missing, org):
        text = self.client(self.prompt(missing, org))
        try:
            proposal = json.loads(text)
        except json.JSONDecodeError as error:
            raise ProposalRejected(f"response is not JSON: {error.msg}")
        return validate_proposal(proposal, missing)


def merge(uploaded, proposal):
    """Fill only missing or blank fields. Returns (merged_scopes, assumptions)."""
    merged = {scope: dict(uploaded.get(scope) or {}) for scope in ("scope_1", "scope_2", "scope_3")}
    assumptions = {}
    for scope, fields in proposal.items():
        for field, item in fields.items():
            target = merged.setdefault(scope, {})
            if not _blank(target.get(field)):
                continue
            target[field] = item["value"]
            assumptions.setdefault(scope, []).append(item["assumption"])
    return merged, assumptions


def estimate(uploaded, org, client=None):
    """Full estimation step. Returns (merged_scopes, assumptions, notes).

    notes records what happened, for example when an LLM proposal was rejected and rules were used.
    """
    missing = detect_missing(uploaded, org)
    notes = []
    if not missing:
        return {scope: dict(uploaded.get(scope) or {}) for scope in SCOPE_FIELDS}, {}, notes

    proposal = None
    if client is not None:
        try:
            proposal = LLMProposer(client).propose(missing, org)
        except ProposalRejected as error:
            notes.append(f"LLM proposal rejected ({error}); rule-based defaults used instead.")
    if proposal is None:
        proposal = RuleProposer().propose(missing, org)
        validate_proposal(proposal, missing)

    merged, assumptions = merge(uploaded, proposal)
    return merged, assumptions, notes
