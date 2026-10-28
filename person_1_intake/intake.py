"""Person 1: tier selection, routing, and the handoff to Person 2.

Output contract: ../shared/contracts/intake_output.example.json
"""


def tier_selector(answer):
    """Return "tier_1", "tier_2", or "tier_3" for the user's answer."""
    raise NotImplementedError


def validate_and_route(tier, scope_1, scope_2, scope_3):
    """Combine validated scopes into the intake payload. Returns {"scopes": {...}}."""
    raise NotImplementedError


def send_to_calculator(intake_data):
    """Write intake_output.json to output/ for Person 2 to read."""
    raise NotImplementedError
