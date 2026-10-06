"""Independent Draft 2020-12 check of emitted readings and forbidden carriers."""
import copy
import json
from pathlib import Path
import subprocess
import unittest
from jsonschema import Draft202012Validator, FormatChecker, ValidationError

ROOT = Path(__file__).resolve().parents[3]

class SchemaConformance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = ROOT / 'schemas/metascope-fieldoscopy-reading.json'
        assert path.exists(), 'Fieldoscopy Draft 2020-12 schema must exist'
        schema = json.loads(path.read_text())
        Draft202012Validator.check_schema(schema)
        cls.validator = Draft202012Validator(schema, format_checker=FormatChecker())
        source = """
        import {evaluate} from './gateway/local-field/meteorology/evaluator.mjs';
        import {fixtureSignals,currentWindow} from './gateway/tests/cognitive-meteorology/fixtures.mjs';
        const s=await fixtureSignals(), timestamp=currentWindow.end;
        console.log(JSON.stringify([evaluate(s,{timestamp}),evaluate([],{timestamp}),
          evaluate(s.slice(0,3),{timestamp}),evaluate(s,{timestamp:'2026-10-08T00:00:00.000Z'})]));
        """
        cls.readings = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', source], cwd=ROOT))

    def test_actual_pressure_empty_partial_and_stale_readings_conform(self):
        for reading in self.readings:
            with self.subTest(reading=reading['reading_id']): self.validator.validate(reading)

    def test_raw_content_and_constitutional_dispositions_are_forbidden(self):
        for key in ['description', 'message_body', 'source_code', 'pr_body', 'banking_description', 'biometric_trace', 'disposition']:
            for manifest in [False, True]:
                reading = copy.deepcopy(self.readings[0])
                target = reading['signal_manifest'][0] if manifest else reading
                target[key] = 'PRIVATE_SENTINEL'
                with self.subTest(key=key, manifest=manifest):
                    with self.assertRaises(ValidationError): self.validator.validate(reading)

    def test_direction_velocity_and_source_binding_are_required(self):
        for patch in [{'direction': 'RISING', 'rate_of_change': -1}, {'source_domain': 'MAIL'}, {'magnitude': 1.1}]:
            reading = copy.deepcopy(self.readings[0]); reading['signal_manifest'][0].update(patch)
            with self.assertRaises(ValidationError): self.validator.validate(reading)
        reading = copy.deepcopy(self.readings[0]); del reading['signal_manifest'][0]['comparison_window']
        with self.assertRaises(ValidationError): self.validator.validate(reading)

if __name__ == '__main__': unittest.main(verbosity=2)
