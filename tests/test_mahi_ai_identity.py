import os
import unittest
from unittest.mock import patch

from mahi_ai import _active_reasoning_effort, _agent_chat


class MahiAIIdentityTests(unittest.TestCase):
    def test_gpt6_reasoning_defaults_to_medium_for_latency(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual("medium", _active_reasoning_effort("gpt-6-astra"))

    def test_owner_can_override_reasoning_effort(self):
        with patch.dict(os.environ, {"MAHI_AI_REASONING_EFFORT": "low"}):
            self.assertEqual("low", _active_reasoning_effort("gpt-6-astra"))

    def test_agent_uses_mahicloud_identity_without_volunteering_provider_names(self):
        response = {
            "output": [{
                "type": "message",
                "content": [{"type": "output_text", "text": "I'm MahiCloud AI. How can I help?"}],
            }],
        }
        with patch("mahi_ai._require_ai", return_value="test-key"), \
             patch("mahi_ai._openai_request", return_value=response) as request:
            result = _agent_chat("Who are you?", [], "chat")

        self.assertIn("MahiCloud AI", result["reply"])
        instructions = request.call_args.args[0]["instructions"]
        self.assertIn("Do not volunteer internal model, API, or provider/vendor names", instructions)
        self.assertIn("Never falsely claim a model runs locally", instructions)


if __name__ == "__main__":
    unittest.main()
