"""Integration tests. Run from integration/: python tests/test_intake_to_calc.py"""

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

from intake_to_calc import check_calc_output, run_calculator, to_calculator_input  # noqa: E402

from intake import validate_and_route  # noqa: E402  (person_1_intake, added by intake_to_calc)
from person_3_reporting.reporting import generate_report  # noqa: E402

DEMO = HERE.parent / "shared" / "demo_data"


def intake_from_demo(name):
    scopes = json.loads((DEMO / name).read_text(encoding="utf-8"))["scopes"]
    payload, _ = validate_and_route("tier_2", scopes["scope_1"], scopes["scope_2"], scopes["scope_3"])
    return payload


class LabelMappingTests(unittest.TestCase):
    def test_labels_map_to_person_2_vocabulary(self):
        intake = {"confidence_metadata": {"scope_1": "full_data", "scope_2": "partial_data",
                                          "scope_3": "overview_only"}}
        mapped = to_calculator_input(intake)["confidence_metadata"]
        self.assertEqual(mapped, {"scope_1": "full", "scope_2": "partial", "scope_3": "missing"})

    def test_input_is_not_mutated(self):
        intake = {"confidence_metadata": {"scope_1": "full_data"}}
        to_calculator_input(intake)
        self.assertEqual(intake["confidence_metadata"], {"scope_1": "full_data"})

    def test_unknown_label_is_rejected(self):
        with self.assertRaises(ValueError):
            to_calculator_input({"confidence_metadata": {"scope_1": "guess"}})


class ContractCheckTests(unittest.TestCase):
    def test_real_output_matches_contract(self):
        calc = run_calculator(intake_from_demo("demo_data_full.json"))
        self.assertEqual(check_calc_output(calc), [])

    def test_missing_scope_is_reported(self):
        calc = run_calculator(intake_from_demo("demo_data_full.json"))
        del calc["scopes"]["scope_3"]
        self.assertIn("missing scope_3", check_calc_output(calc))

    def test_total_mismatch_is_reported(self):
        calc = run_calculator(intake_from_demo("demo_data_full.json"))
        calc["total"]["co2e_kg"] += 1000
        self.assertTrue(any("does not match" in p for p in check_calc_output(calc)))


class OpenSourceRunTests(unittest.TestCase):
    def setUp(self):
        self.calc = run_calculator(intake_from_demo("demo_data_full.json"))

    def test_scope_1_and_2_are_calculated(self):
        self.assertGreater(self.calc["scopes"]["scope_1"]["total_co2e_kg"], 0)
        self.assertGreater(self.calc["scopes"]["scope_2"]["total_co2e_kg"], 0)

    def test_scope_3_is_zero_until_person_2_has_verified_factors(self):
        # Person 2's status note: Scope 3 returns zero for placeholder factors.
        self.assertEqual(self.calc["scopes"]["scope_3"]["total_co2e_kg"], 0)
        self.assertTrue(self.calc["scopes"]["scope_3"]["unverified_inputs"])

    def test_unverified_factors_are_visible_not_hidden(self):
        # Person 1 labels scope 1 full_data, but Person 2 has placeholder fuel factors.
        # The integration must keep those visible.
        self.assertTrue(self.calc["scopes"]["scope_1"]["unverified_inputs"])


class EndToEndReportTests(unittest.TestCase):
    def test_open_source_reaches_a_graded_report_with_warnings(self):
        report = generate_report(run_calculator(intake_from_demo("demo_data_full.json")))["report"]
        self.assertEqual(report["grade"], "B")
        self.assertEqual(report["meta"]["org_type"], "school")
        self.assertTrue(any("Scope 1" in w and "overstate" in w for w in report["warnings"]))

    def test_closed_source_reports_no_grade(self):
        report = generate_report(run_calculator(intake_from_demo("demo_data_budget.json")))["report"]
        self.assertEqual(report["grade"], "N/A")
        self.assertTrue(any("Missing or unverified inputs" in w for w in report["warnings"]))


class ClosedSourceRunTests(unittest.TestCase):
    def test_budget_only_gives_zero_and_flags_inputs(self):
        calc = run_calculator(intake_from_demo("demo_data_budget.json"))
        self.assertEqual(calc["total"]["co2e_kg"], 0)
        self.assertIn("scope_1", calc["unverified_inputs"])
        self.assertIn("scope_2", calc["unverified_inputs"])


if __name__ == "__main__":
    unittest.main()
