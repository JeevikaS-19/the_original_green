"""Planning estimates for carbon-reduction actions; verify before use."""

from typing import Any, Callable


CONDITION_IDS = (
    "scope_1_gt_50_tons",
    "scope_1_gt_20_tons",
    "dg_set_present",
    "scope_2_gt_20_tons",
    "scope_3_commute_gt_5_tons",
    "e_waste_present",
    "solid_waste_gt_300_kg_month",
    "individual_scope_1_gt_1_ton",
    "individual_scope_2_gt_1_ton",
    "individual_commute_gt_0_5_ton",
    "individual_solid_waste_gt_10_kg_month",
)


def _greater_than(fact: str, threshold: float) -> Callable[[dict[str, Any]], tuple[bool, str]]:
    def predicate(facts: dict[str, Any]) -> tuple[bool, str]:
        value = facts.get(fact)
        if value is None:
            return False, f"{fact} is unknown"
        if value > threshold:
            return True, ""
        return False, f"{fact} ({value:g}) does not exceed {threshold:g}"

    return predicate


def _all_of(*predicates: Callable[[dict[str, Any]], tuple[bool, str]]) -> Callable[[dict[str, Any]], tuple[bool, str]]:
    def predicate(facts: dict[str, Any]) -> tuple[bool, str]:
        for check in predicates:
            ok, reason = check(facts)
            if not ok:
                return False, reason
        return True, ""

    return predicate


def _individual(facts: dict[str, Any]) -> tuple[bool, str]:
    if facts.get("org_type") == "individual":
        return True, ""
    return False, "not an individual profile"


def _dg_set_present(facts: dict[str, Any]) -> tuple[bool, str]:
    value = facts.get("dg_set_present")
    if value is None:
        return False, "dg_set_present is unknown"
    if value:
        return True, ""
    return False, "no DG set was identified"


def _e_waste_present(facts: dict[str, Any]) -> tuple[bool, str]:
    value = facts.get("e_waste_kg_per_month")
    if value is None:
        return False, "e_waste_kg_per_month is unknown"
    if value > 0:
        return True, ""
    return False, "no e-waste was identified"


CONDITIONS: dict[str, Callable[[dict[str, Any]], tuple[bool, str]]] = {
    "scope_1_gt_50_tons": _greater_than("scope_1_tons", 50),
    "scope_1_gt_20_tons": _greater_than("scope_1_tons", 20),
    "dg_set_present": _dg_set_present,
    "scope_2_gt_20_tons": _greater_than("scope_2_tons", 20),
    "scope_3_commute_gt_5_tons": _greater_than("commute_tons", 5),
    "e_waste_present": _e_waste_present,
    "solid_waste_gt_300_kg_month": _greater_than("solid_waste_kg_per_month", 300),
    "individual_scope_1_gt_1_ton": _all_of(_individual, _greater_than("scope_1_tons", 1)),
    "individual_scope_2_gt_1_ton": _all_of(_individual, _greater_than("scope_2_tons", 1)),
    "individual_commute_gt_0_5_ton": _all_of(_individual, _greater_than("commute_tons", 0.5)),
    "individual_solid_waste_gt_10_kg_month": _all_of(_individual, _greater_than("solid_waste_kg_per_month", 10)),
}


reduction_knowledge_base: list[dict[str, Any]] = [
    {
        "id": "cng_buses",
        "category": "scope_1_vehicle",
        "action": "CNG buses",
        "description": "Replace suitable diesel buses with CNG buses.",
        "carbon_saved_tons_per_year": 8,
        "cost_inr": 3_000_000,
        "cost_type": "capex",
        "payback_months": 48,
        "applicable_when": "scope_1_gt_50_tons",
        "region": "India",
        "notes": "Savings depend on the buses replaced and local fuel supply.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "route_optimization",
        "category": "scope_1_vehicle",
        "action": "Route optimization",
        "description": "Review routes and schedules to reduce vehicle distance and fuel use.",
        "carbon_saved_tons_per_year": 3,
        "cost_inr": 200_000,
        "cost_type": "capex",
        "payback_months": 12,
        "applicable_when": "scope_1_gt_20_tons",
        "region": "India",
        "notes": "Savings depend on baseline routes and implementation.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "dg_set_efficiency",
        "category": "scope_1_vehicle",
        "action": "DG set efficiency",
        "description": "Maintain and right-size generator operations to reduce fuel use.",
        "carbon_saved_tons_per_year": 2,
        "cost_inr": 500_000,
        "cost_type": "capex",
        "payback_months": 36,
        "applicable_when": "dg_set_present",
        "region": "India",
        "notes": "Savings depend on generator load and operating hours.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "renewable_procurement",
        "category": "scope_2_energy",
        "action": "Renewable energy procurement",
        "description": "Procure renewable electricity through a suitable contract or instrument.",
        "carbon_saved_tons_per_year": 15,
        "cost_inr": 2_000_000,
        "cost_type": "annual_opex",
        "payback_months": None,
        "applicable_when": "scope_2_gt_20_tons",
        "region": "India",
        "notes": "Cost is an annual premium; confirm the applicable grid accounting rules.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "rooftop_solar",
        "category": "scope_2_energy",
        "action": "Install rooftop solar",
        "description": "Assess rooftop solar generation for on-site electricity demand.",
        "carbon_saved_tons_per_year": 10,
        "cost_inr": 2_000_000,
        "cost_type": "capex",
        "payback_months": 72,
        "applicable_when": "scope_2_gt_20_tons",
        "region": "India",
        "notes": "Actual yield and payback depend on location, tariff, and roof conditions.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "commute_carpool",
        "category": "scope_3_commute",
        "action": "Carpooling and public transport",
        "description": "Support lower-carbon commuting through carpooling and public transit.",
        "carbon_saved_tons_per_year": 5,
        "cost_inr": 500_000,
        "cost_type": "capex",
        "payback_months": 24,
        "applicable_when": "scope_3_commute_gt_5_tons",
        "region": "India",
        "notes": "Savings depend on employee participation and commute patterns.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "e_waste_recycling",
        "category": "scope_3_waste",
        "action": "E-waste recycling",
        "description": "Use an authorized e-waste recycler and track material recovery.",
        "carbon_saved_tons_per_year": 1,
        "cost_inr": 200_000,
        "cost_type": "capex",
        "payback_months": 24,
        "applicable_when": "e_waste_present",
        "region": "India",
        "notes": "Use authorized handlers and verify the treatment route.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "composting",
        "category": "scope_3_waste",
        "action": "Composting",
        "description": "Separate suitable organic waste for composting.",
        "carbon_saved_tons_per_year": 2,
        "cost_inr": 300_000,
        "cost_type": "capex",
        "payback_months": 18,
        "applicable_when": "solid_waste_gt_300_kg_month",
        "region": "India",
        "notes": "Savings depend on waste composition and the current disposal route.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "individual_commute_transit",
        "category": "scope_3_commute",
        "action": "Commute by bus, metro or shared ride",
        "description": "Replace some car trips to work with bus, metro or a shared ride.",
        "carbon_saved_tons_per_year": 0.5,
        "cost_inr": 12_000,
        "cost_type": "annual_opex",
        "payback_months": None,
        "applicable_when": "individual_commute_gt_0_5_ton",
        "region": "India",
        "notes": "Saving assumes a 12 km one-way commute by car moved to transit; scales with distance and days.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "individual_efficient_appliances",
        "category": "scope_2_electricity",
        "action": "Five-star appliances and LED lighting",
        "description": "Replace the most-used appliances and bulbs with efficient models.",
        "carbon_saved_tons_per_year": 0.3,
        "cost_inr": 15_000,
        "cost_type": "capex",
        "payback_months": 24,
        "applicable_when": "individual_scope_2_gt_1_ton",
        "region": "India",
        "notes": "Saving assumes about 10% of home electricity; depends on the appliances replaced.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "individual_green_power",
        "category": "scope_2_electricity",
        "action": "Renewable power plan from your supplier",
        "description": "Choose a green power tariff for home electricity.",
        "carbon_saved_tons_per_year": 1.5,
        "cost_inr": 3_000,
        "cost_type": "annual_opex",
        "payback_months": None,
        "applicable_when": "individual_scope_2_gt_1_ton",
        "region": "India",
        "notes": "Availability and the extra annual cost depend on the supplier and state.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "individual_eco_driving",
        "category": "scope_1_vehicle",
        "action": "Eco-driving and tyre pressure checks",
        "description": "Smooth acceleration, steady speeds and correct tyre pressure cut fuel use.",
        "carbon_saved_tons_per_year": 0.1,
        "cost_inr": 4_000,
        "cost_type": "capex",
        "payback_months": 6,
        "applicable_when": "individual_scope_1_gt_1_ton",
        "region": "India",
        "notes": "Savings are typically small and depend on driving habits.",
        "basis": "assumption - verify before demo",
    },
    {
        "id": "individual_home_composting",
        "category": "scope_3_waste",
        "action": "Home composting of kitchen waste",
        "description": "Compost food and garden waste at home instead of sending it to landfill.",
        "carbon_saved_tons_per_year": 0.1,
        "cost_inr": 3_000,
        "cost_type": "capex",
        "payback_months": 12,
        "applicable_when": "individual_solid_waste_gt_10_kg_month",
        "region": "India",
        "notes": "Savings depend on how much of the waste is organic and how it was disposed of.",
        "basis": "assumption - verify before demo",
    },
]
