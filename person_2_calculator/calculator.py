"""Person 2: Scope 1/2/3 calculations and the master function.

Input contract: ../shared/contracts/intake_output.example.json
Output contract: ../shared/contracts/calc_output.example.json
"""


def calculate_scope_1(vehicles, dg_set, conversion_factors):
    """Direct fuel emissions only (vehicles + DG set)."""
    raise NotImplementedError


def calculate_scope_2(energy_meter, conversion_factors):
    """Purchased grid electricity (carbon and water)."""
    raise NotImplementedError


def calculate_scope_3(cloud, hardware, commute, waste, conversion_factors):
    """Scope 3 categories 3.1 (cloud), 3.2 (hardware), 3.3 (commute), 3.4 (waste)."""
    raise NotImplementedError


def adjust_confidence(scope_result, data_completeness):
    """Attach a ±% confidence based on data completeness: "full", "partial", or "missing"."""
    raise NotImplementedError


def calculate_all_scopes(intake_data):
    """Run all scope calculators and return the calc output payload."""
    raise NotImplementedError
