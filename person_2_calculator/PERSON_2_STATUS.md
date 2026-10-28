# Person 2 Calculator Status

## Completed

- Implemented Scope 1 calculations in `calculator.py`:
  - Vehicle fuel emissions
  - DG-set fuel emissions
  - Per-vehicle fuel-efficiency override
  - Vehicle-type and fuel-default lookup fallback
- Implemented Scope 2 calculations:
  - Monthly-to-annual electricity conversion
  - One all-India grid factor
  - No state-wise grid factors
  - No WUE/data-centre water calculation
- Implemented Scope 3 calculation structure:
  - Cloud
  - Hardware
  - Commute
  - Waste
- Implemented confidence and uncertainty ranges.
- Implemented budget-estimation support when a verified price/tariff factor is available.
- Implemented unverified-input tracking.
- Implemented the combined `calculate_all_scopes()` output.
- Added factor metadata with:
  - `value`
  - `unit`
  - `low`
  - `high`
  - `source`
  - `year`
  - `status`
- Added `list_unverified()` for factor placeholders.
- Added calculator and factor tests.

## Validation

```text
7 passed
```

The full demo-data smoke test produced:

```text
Scope 1: 87100.0 kg CO2e
Scope 2: 47400.0 kg CO2e
Scope 3: 0.0 kg CO2e
Total: 134500.0 kg CO2e
```

## Remaining work or limitations

- Scope 3 currently returns zero for hardware, commute, waste, and cloud inputs
  whose factors are placeholders or missing.
- Verified values and citations were not supplied for:
  - LPG and CNG litre-based fuel factors
  - Vehicle fuel-efficiency defaults
  - Hardware embodied carbon
  - Commute modes
  - Waste categories and disposal methods
  - Fuel prices
  - Electricity tariff
- CNG is intentionally `None` for litre-based emissions because it is sold by
  mass, not litres.
- Budget estimation remains unavailable until verified fuel-price and tariff
  factors are supplied.
- The calculator does not write `output/calc_output.json` automatically yet;
  `calculate_all_scopes()` returns the payload for the integration layer.
- Person 3 should confirm the final additional output fields for confidence,
  uncertainty, and unverified inputs before the shared integration step.

## Integration notes

- Files changed by Person 2 are limited to this folder.
- Shared contracts were not modified.
- The all-India grid factor is:
  `0.79 kg CO2e/kWh`, source:
  `CEA CO2 Baseline Database, weighted average`, year `FY2019-20`.
- A TODO remains to update the grid factor to the latest approved CEA version.
- Person 3 should consume the result returned by:
  `calculate_all_scopes(intake_data)`.
