"""Estimation tests. Run from person_1_intake/: python tests/test_estimation.py"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from estimation import (  # noqa: E402
    LLMProposer,
    ProposalRejected,
    RuleProposer,
    detect_missing,
    estimate,
    merge,
    validate_proposal,
)
from intake import run_estimated_intake  # noqa: E402
from validators import IntakeError  # noqa: E402

ORG = {"employee_count": 500, "state": "Karnataka", "energy_bill_inr": 5600000}


def empty_uploads():
    return {"scope_1": {}, "scope_2": {}, "scope_3": {}}


def good_llm_response(missing):
    return json.dumps({
        "scope_3": {
            "commute": {
                "value": {"total_employees": 500, "mode_split": {"car": 0.4, "bus": 0.35, "bike": 0.15, "wfh": 0.1},
                          "avg_distance_km": 12},
                "assumption": "Typical split for the city.",
            }
        }
    })


class DetectTests(unittest.TestCase):
    def test_nothing_missing_when_everything_is_uploaded(self):
        uploaded = {
            "scope_1": {"vehicles": [{"fuel_type": "diesel"}]},
            "scope_2": {"energy_meter": {"monthly_kwh": 100}},
            "scope_3": {"hardware": [{}], "commute": {"total_employees": 10}, "waste": [{}]},
        }
        self.assertEqual(detect_missing(uploaded, ORG), {})

    def test_empty_uploads_are_fully_missing(self):
        missing = detect_missing(empty_uploads(), ORG)
        self.assertEqual(missing["scope_1"], ["vehicles", "dg_set"])
        self.assertEqual(missing["scope_2"], ["energy_meter"])
        self.assertEqual(missing["scope_3"], ["hardware", "commute", "waste"])


class RuleProposerTests(unittest.TestCase):
    def test_every_proposed_field_has_an_assumption(self):
        missing = detect_missing(empty_uploads(), ORG)
        proposal = RuleProposer().propose(missing, ORG)
        for scope, fields in proposal.items():
            for field, item in fields.items():
                self.assertTrue(item["assumption"].strip(), f"{scope}.{field} has no assumption")

    def test_rule_proposal_passes_validation(self):
        missing = detect_missing(empty_uploads(), ORG)
        validate_proposal(RuleProposer().propose(missing, ORG), missing)

    def test_bill_converts_to_monthly_kwh_at_the_illustrative_tariff(self):
        meter = RuleProposer()._scope_2(ORG)["energy_meter"]["value"]
        self.assertAlmostEqual(meter["monthly_kwh"], 5600000 / 7.5 / 12, places=0)

    def test_no_employee_count_is_an_error(self):
        with self.assertRaises(IntakeError):
            RuleProposer().propose(detect_missing(empty_uploads(), {}), {})


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.missing = {"scope_3": ["commute"]}

    def test_good_proposal_is_accepted(self):
        proposal = json.loads(good_llm_response(self.missing))
        self.assertIs(validate_proposal(proposal, self.missing), proposal)

    def test_non_json_is_rejected(self):
        with self.assertRaises(ProposalRejected):
            LLMProposer(lambda prompt: "not json").propose(self.missing, ORG)

    def test_missing_assumption_is_rejected(self):
        proposal = {"scope_3": {"commute": {"value": {"mode_split": {"car": 1, "bus": 0, "bike": 0, "wfh": 0}}}}}
        with self.assertRaises(ProposalRejected):
            validate_proposal(proposal, self.missing)

    def test_overriding_an_uploaded_field_is_rejected(self):
        proposal = {"scope_1": {"vehicles": {"value": [], "assumption": "x"}}}
        with self.assertRaises(ProposalRejected):
            validate_proposal(proposal, {"scope_3": ["commute"]})

    def test_out_of_range_distance_is_rejected(self):
        missing = {"scope_1": ["vehicles"]}
        proposal = {"scope_1": {"vehicles": {"value": [{"annual_distance_km": 10**7,
                                                        "fuel_efficiency_l_per_100km": 7}],
                                             "assumption": "x"}}}
        with self.assertRaises(ProposalRejected):
            validate_proposal(proposal, missing)

    def test_commute_shares_that_do_not_add_up_are_rejected(self):
        proposal = {"scope_3": {"commute": {"value": {"mode_split": {"car": 0.9, "bus": 0.9, "bike": 0, "wfh": 0}},
                                            "assumption": "x"}}}
        with self.assertRaises(ProposalRejected):
            validate_proposal(proposal, self.missing)


class MergeTests(unittest.TestCase):
    def test_uploads_win_and_only_blanks_are_filled(self):
        uploaded = {"scope_3": {"commute": {"total_employees": 40}}}
        proposal = {"scope_3": {"commute": {"value": {"total_employees": 500}, "assumption": "x"},
                                "waste": {"value": [], "assumption": "y"}}}
        merged, assumptions = merge(uploaded, proposal)
        self.assertEqual(merged["scope_3"]["commute"], {"total_employees": 40})
        self.assertEqual(merged["scope_3"]["waste"], [])
        self.assertEqual(assumptions, {"scope_3": ["y"]})


class EstimateTests(unittest.TestCase):
    def test_llm_rejection_falls_back_to_rules_and_says_so(self):
        merged, assumptions, notes = estimate(empty_uploads(), ORG, client=lambda prompt: "garbage")
        self.assertTrue(notes)
        self.assertIn("scope_1", assumptions)
        self.assertTrue(merged["scope_1"]["vehicles"])

    def test_valid_llm_proposal_is_used(self):
        uploaded = {"scope_1": {"vehicles": [{"fuel_type": "diesel"}]},
                    "scope_2": {"energy_meter": {"monthly_kwh": 100}},
                    "scope_3": {"hardware": [{}], "waste": [{}]}}
        merged, assumptions, notes = estimate(uploaded, ORG, client=lambda prompt: good_llm_response({}))
        self.assertEqual(notes, [])
        self.assertEqual(merged["scope_3"]["commute"]["avg_distance_km"], 12)
        self.assertIn("Typical split for the city.", assumptions["scope_3"])


class EstimatedIntakeTests(unittest.TestCase):
    def test_estimated_output_is_labelled_and_partial(self):
        with tempfile.TemporaryDirectory() as tmp:
            path, assumptions, notes = run_estimated_intake(
                "Large Enterprise", empty_uploads(), ORG, output_file=Path(tmp) / "intake.json")
            payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(set(payload["confidence_metadata"].values()), {"partial_data"})
        self.assertEqual(set(payload["assumptions"]), {"scope_1", "scope_2", "scope_3"})
        self.assertEqual(payload["assumptions"], assumptions)

    def test_no_employee_count_and_no_data_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(IntakeError):
                run_estimated_intake("Large Enterprise", empty_uploads(), {}, output_file=Path(tmp) / "x.json")


if __name__ == "__main__":
    unittest.main()
