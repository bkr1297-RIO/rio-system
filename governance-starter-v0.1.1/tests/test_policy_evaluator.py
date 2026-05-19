import json
import unittest
from pathlib import Path

from src.governance.policy_evaluator import PolicyEvaluator, most_restrictive_verdict


REPO_ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = REPO_ROOT / "policy-schema.yaml"
CASES_PATH = REPO_ROOT / "tests" / "policy_cases.json"


class TestVerdictPrecedence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.evaluator = PolicyEvaluator(POLICY_PATH)

    def test_yaml_declares_expected_precedence(self):
        self.assertEqual(
            self.evaluator.rule_precedence,
            [
                "DENY",
                "REQUIRE_HUMAN_APPROVAL",
                "PREAUTHORIZED_EXTERNAL",
                "ALLOW_WITH_RECEIPT",
                "ALLOW_INTERNAL",
            ],
        )

    def test_most_restrictive_verdict_wins(self):
        verdicts = [
            "ALLOW_INTERNAL",
            "ALLOW_WITH_RECEIPT",
            "PREAUTHORIZED_EXTERNAL",
            "REQUIRE_HUMAN_APPROVAL",
            "DENY",
        ]
        self.assertEqual(
            most_restrictive_verdict(verdicts, self.evaluator.rule_precedence),
            "DENY",
        )

    def test_preauthorized_beats_allow_with_receipt(self):
        verdicts = ["ALLOW_INTERNAL", "ALLOW_WITH_RECEIPT", "PREAUTHORIZED_EXTERNAL"]
        self.assertEqual(
            most_restrictive_verdict(verdicts, self.evaluator.rule_precedence),
            "PREAUTHORIZED_EXTERNAL",
        )

    def test_human_approval_beats_preauthorized(self):
        verdicts = ["PREAUTHORIZED_EXTERNAL", "REQUIRE_HUMAN_APPROVAL"]
        self.assertEqual(
            most_restrictive_verdict(verdicts, self.evaluator.rule_precedence),
            "REQUIRE_HUMAN_APPROVAL",
        )


class TestPolicyEvaluator(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.evaluator = PolicyEvaluator(POLICY_PATH)
        with open(CASES_PATH, "r", encoding="utf-8") as fh:
            cls.cases = json.load(fh)

    def test_policy_cases(self):
        for case in self.cases:
            with self.subTest(case=case["name"]):
                result = self.evaluator.evaluate(case["request"])
                expected = case["expected"]

                self.assertEqual(result["policy_verdict"], expected["policy_verdict"])
                self.assertEqual(result["execution_allowed"], expected["execution_allowed"])
                self.assertEqual(result["approval_satisfied"], expected["approval_satisfied"])
                self.assertEqual(result["governance_state"], expected["governance_state"])
                self.assertEqual(result["receipt_required"], expected["receipt_required"])
                self.assertEqual(result["advisory_only"], expected["advisory_only"])

    def test_invariant_language_output_is_not_authority(self):
        result = self.evaluator.evaluate(self._case_by_name("language output is not authority")["request"])
        self.assertIn("Language output is not authority.", result["reasons"])

    def test_invariant_confidence_is_not_consent(self):
        result = self.evaluator.evaluate(self._case_by_name("confidence is not consent")["request"])
        self.assertIn("Confidence is not consent.", result["reasons"])

    def test_invariant_memory_is_not_scope(self):
        result = self.evaluator.evaluate(self._case_by_name("memory is not scope")["request"])
        self.assertIn("Memory is not scope.", result["reasons"])

    def test_invariant_receipt_is_not_future_authorization(self):
        result = self.evaluator.evaluate(self._case_by_name("receipt is not future authorization")["request"])
        self.assertIn("Receipt is not future authorization.", result["reasons"])

    def test_invariant_quantum_result_is_not_execution_permission(self):
        result = self.evaluator.evaluate(self._case_by_name("quantum result is not execution permission")["request"])
        self.assertIn("Quantum result is not execution permission.", result["reasons"])

    def test_hardware_quantum_with_explicit_approval_sets_clear_governance_state(self):
        result = self.evaluator.evaluate(
            self._case_by_name("hardware quantum proceeds only with explicit human approval")["request"]
        )
        self.assertEqual(result["policy_verdict"], "REQUIRE_HUMAN_APPROVAL")
        self.assertTrue(result["execution_allowed"])
        self.assertTrue(result["approval_satisfied"])
        self.assertEqual(result["governance_state"], "APPROVED_AFTER_HUMAN_REVIEW")

    def _case_by_name(self, name):
        for case in self.cases:
            if case["name"] == name:
                return case
        raise KeyError(f"Unknown test case: {name}")


if __name__ == "__main__":
    unittest.main()
