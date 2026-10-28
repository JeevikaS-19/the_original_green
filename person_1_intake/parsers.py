"""Person 1: parsers that turn tracker files into standard dicts."""


def parse_scope_1(vehicles_csv, dg_set):
    """Return (vehicles, dg_set) in standard units."""
    raise NotImplementedError


def parse_scope_2(energy_meter_csv):
    """Return {"monthly_kwh": ..., "region_state": ...}, averaged across months."""
    raise NotImplementedError


def parse_scope_3(cloud_csv, hardware_csv, commute_survey, waste_csv):
    """Return {"cloud", "hardware", "commute", "waste"}."""
    raise NotImplementedError
