from factors import conversion_factors, list_unverified


REQUIRED_FIELDS = {"value", "unit", "low", "high", "source", "year", "status"}


def _factor_values(value):
    if isinstance(value, dict) and REQUIRED_FIELDS <= value.keys():
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from _factor_values(child)


def test_every_factor_has_the_required_fields():
    factors = list(_factor_values(conversion_factors))

    assert factors
    assert all(set(factor) == REQUIRED_FIELDS for factor in factors)


def test_cng_factor_has_no_litre_value():
    assert conversion_factors["fuel"]["cng"]["value"] is None


def test_list_unverified_excludes_the_verified_grid_factor(capsys):
    placeholders = list_unverified()
    output = capsys.readouterr().out

    assert "grid" not in placeholders
    assert "grid" not in output
