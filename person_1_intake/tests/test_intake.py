"""Person 1 tests. Run from person_1_intake/: python -m unittest discover tests"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from intake import run_intake, tier_selector, validate_and_route  # noqa: E402
from parsers import parse_scope_1, parse_scope_2, parse_scope_3  # noqa: E402
from validators import IntakeError, validate_scope_1, validate_scope_3  # noqa: E402

SAMPLE = HERE.parent / "sample_data"
DEMO = HERE.parent.parent / "shared" / "demo_data"


def load_demo(name):
    return json.loads((DEMO / name).read_text(encoding="utf-8"))["scopes"]


class TierSelectorTests(unittest.TestCase):
    def test_form_answers_map_to_tiers(self):
        self.assertEqual(tier_selector("Individual"), "tier_1")
        self.assertEqual(tier_selector("School/Small Company"), "tier_2")
        self.assertEqual(tier_selector("school"), "tier_2")
        self.assertEqual(tier_selector("Large Enterprise"), "tier_3")

    def test_unknown_answer_is_rejected(self):
        with self.assertRaises(IntakeError):
            tier_selector("startup")


class ParserTests(unittest.TestCase):
    def test_vehicles_use_aliases_and_numbers(self):
        vehicles, dg = parse_scope_1(SAMPLE / "vehicles.csv", None)
        self.assertEqual(len(vehicles), 2)
        self.assertEqual(vehicles[0]["annual_distance_km"], 80000)
        self.assertEqual(vehicles[0]["year"], 2020)
        self.assertEqual(vehicles[1]["fuel_type"], "diesel")
        self.assertIsNone(dg)

    def test_energy_meter_averages_months(self):
        meter = parse_scope_2(SAMPLE / "energy_meter.csv")
        self.assertEqual(meter, {"monthly_kwh": 4900.0, "region_state": "Karnataka"})

    def test_commute_percent_strings_become_fractions(self):
        commute = parse_scope_3(None, None, {"total_employees": "200", "car_pct": "40%",
                                             "bus_pct": "35%", "bike_pct": "10%",
                                             "wfh_pct": "15%", "avg_distance_km": "12"},
                                None)["commute"]
        self.assertAlmostEqual(commute["mode_split"]["car"], 0.4)
        self.assertEqual(commute["total_employees"], 200)

    def test_missing_column_is_reported(self):
        bad = HERE / "_bad_vehicles.csv"
        bad.write_text("make,model\nTata,Coach\n", encoding="utf-8")
        try:
            with self.assertRaises(IntakeError) as ctx:
                parse_scope_1(bad, None)
            self.assertIn("fuel_type", str(ctx.exception))
        finally:
            bad.unlink()

    def test_empty_file_is_reported(self):
        empty = HERE / "_empty.csv"
        empty.write_text("", encoding="utf-8")
        try:
            with self.assertRaises(IntakeError) as ctx:
                parse_scope_2(empty)
            self.assertIn("empty", str(ctx.exception))
        finally:
            empty.unlink()

    def test_non_number_is_reported_with_line(self):
        bad = HERE / "_bad_energy.csv"
        bad.write_text("month,kwh\n2024-01,lots\n", encoding="utf-8")
        try:
            with self.assertRaises(IntakeError) as ctx:
                parse_scope_2(bad)
            self.assertIn("line 2", str(ctx.exception))
        finally:
            bad.unlink()


class CloudExportTests(unittest.TestCase):
    def test_json_export_is_read_like_csv(self):
        cloud = parse_scope_3(SAMPLE / "cloud_export.json", None, None, None)["cloud"]
        self.assertEqual(len(cloud), 2)
        self.assertEqual(cloud[0], {"instance_type": "p3.8xlarge", "region": "us-east-1",
                                    "usage_hours": 1000, "cost": 15000})

    def test_json_export_without_items_is_reported(self):
        bad = HERE / "_bad_cloud.json"
        bad.write_text('{"Other": []}', encoding="utf-8")
        try:
            with self.assertRaises(IntakeError) as ctx:
                parse_scope_3(bad, None, None, None)
            self.assertIn("no Items", str(ctx.exception))
        finally:
            bad.unlink()


class ValidatorTests(unittest.TestCase):
    def test_missing_distance_is_estimated_and_lowers_confidence(self):
        report = validate_scope_1({"vehicles": [{"make": "Tata", "fuel_type": "diesel"}]})
        self.assertEqual(report["data"]["vehicles"][0]["annual_distance_km"], 15000)
        self.assertEqual(report["completeness"], "partial")
        self.assertTrue(report["estimates_made"])

    def test_vehicle_without_fuel_type_is_an_error(self):
        report = validate_scope_1({"vehicles": [{"make": "Tata"}]})
        self.assertFalse(report["valid"])

    def test_commute_shares_that_do_not_add_up_are_normalised(self):
        report = validate_scope_3({"commute": {"total_employees": 100,
                                               "mode_split": {"car": 2, "bus": 2}}})
        split = report["data"]["commute"]["mode_split"]
        self.assertAlmostEqual(sum(split.values()), 1.0)
        self.assertTrue(report["estimates_made"])

    def test_budget_only_scope_is_overview(self):
        report = validate_scope_1({"annual_fuel_budget_inr": 500000})
        self.assertEqual(report["completeness"], "overview")


class RouteTests(unittest.TestCase):
    def test_no_scopes_is_an_error(self):
        with self.assertRaises(IntakeError):
            validate_and_route("tier_2", None, None, None)

    def test_full_demo_routes_with_expected_confidence(self):
        demo = load_demo("demo_data_full.json")
        payload, _ = validate_and_route("tier_2", demo["scope_1"], demo["scope_2"], demo["scope_3"])
        self.assertEqual(payload["confidence_metadata"]["scope_1"], "full_data")
        self.assertEqual(payload["confidence_metadata"]["scope_2"], "full_data")
        self.assertEqual(payload["confidence_metadata"]["scope_3"], "partial_data")
        self.assertEqual(set(payload["scopes"]["scope_3"]), {"cloud", "hardware", "commute", "waste"})

    def test_budget_demo_routes_as_overview(self):
        demo = load_demo("demo_data_budget.json")
        payload, _ = validate_and_route("tier_2", demo["scope_1"], demo["scope_2"], demo["scope_3"])
        self.assertEqual(set(payload["confidence_metadata"].values()), {"overview_only"})


class EndToEndTests(unittest.TestCase):
    def test_run_intake_writes_contract_shaped_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "intake_output.json"
            path, estimates = run_intake(
                "School/Small Company",
                vehicles_csv=SAMPLE / "vehicles.csv",
                dg_set={"capacity_kva": 50, "fuel_type": "diesel",
                        "hours_per_year": 500, "fuel_consumption_per_hour": 15},
                energy_meter_csv=SAMPLE / "energy_meter.csv",
                cloud_csv=SAMPLE / "cloud.csv",
                hardware_csv=SAMPLE / "hardware.csv",
                commute_survey=SAMPLE / "commute.csv",
                waste_csv=SAMPLE / "waste.csv",
                output_file=out,
            )
            written = json.loads(Path(path).read_text(encoding="utf-8"))
        self.assertEqual(written["tier"], "tier_2")
        self.assertEqual(set(written), {"tier", "timestamp", "scopes", "confidence_metadata", "data_path"})
        self.assertEqual(set(written["scopes"]), {"scope_1", "scope_2", "scope_3"})
        self.assertEqual(written["confidence_metadata"]["scope_2"], "full_data")
        self.assertEqual(set(written["data_path"].values()), {"open_source"})

    def test_budget_demo_is_marked_closed_source(self):
        demo = load_demo("demo_data_budget.json")
        payload, _ = validate_and_route("tier_2", demo["scope_1"], demo["scope_2"], demo["scope_3"])
        self.assertEqual(set(payload["data_path"].values()), {"closed_source"})


if __name__ == "__main__":
    unittest.main()
