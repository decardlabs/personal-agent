"""Tests for the PersonalAgent class (LLM calls are mocked)."""
from __future__ import annotations

import json
import types
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.agent import PersonalAgent
from src.tools.base import BaseTool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_text_completion(text: str) -> MagicMock:
    """Build a minimal mock of an OpenAI completion with a text response."""
    message = MagicMock()
    message.content = text
    message.tool_calls = None
    choice = MagicMock()
    choice.message = message
    completion = MagicMock()
    completion.choices = [choice]
    return completion


def _make_tool_completion(tool_name: str, arguments: dict, call_id: str = "call_1") -> MagicMock:
    """Build a minimal mock of an OpenAI completion that requests a tool call."""
    tc = MagicMock()
    tc.id = call_id
    tc.function = MagicMock()
    tc.function.name = tool_name
    tc.function.arguments = json.dumps(arguments)

    message = MagicMock()
    message.content = None
    message.tool_calls = [tc]
    choice = MagicMock()
    choice.message = message
    completion = MagicMock()
    completion.choices = [choice]
    return completion


# ---------------------------------------------------------------------------
# AgentTests
# ---------------------------------------------------------------------------

class TestPersonalAgent:
    def _agent(self, **kwargs) -> PersonalAgent:
        """Create an agent with a fake API key (no real HTTP calls)."""
        return PersonalAgent(api_key="sk-fake", **kwargs)

    def test_chat_returns_text_response(self):
        agent = self._agent()
        with patch.object(
            agent._client.chat.completions,
            "create",
            return_value=_make_text_completion("Hello, human!"),
        ):
            response = agent.chat("Hi")
        assert response == "Hello, human!"

    def test_chat_appends_to_memory(self):
        agent = self._agent()
        with patch.object(
            agent._client.chat.completions,
            "create",
            return_value=_make_text_completion("Reply"),
        ):
            agent.chat("Question")
        msgs = agent._memory.get_messages()
        roles = [m["role"] for m in msgs]
        assert "user" in roles
        assert "assistant" in roles

    def test_reset_clears_history(self):
        agent = self._agent()
        with patch.object(
            agent._client.chat.completions,
            "create",
            return_value=_make_text_completion("Reply"),
        ):
            agent.chat("Something")
        agent.reset()
        # After reset only the system message should be present
        msgs = agent._memory.get_messages()
        assert all(m["role"] == "system" for m in msgs)

    def test_tool_call_is_executed(self):
        """Agent should invoke calculator and then get a final text answer."""
        agent = self._agent()

        completions = [
            _make_tool_completion("calculator", {"expression": "2 + 2"}),
            _make_text_completion("The answer is 4."),
        ]
        call_count = 0

        def fake_create(**kwargs):
            nonlocal call_count
            result = completions[call_count]
            call_count += 1
            return result

        with patch.object(agent._client.chat.completions, "create", side_effect=fake_create):
            response = agent.chat("What is 2+2?")

        assert response == "The answer is 4."

    def test_unknown_tool_returns_error(self):
        agent = self._agent()
        result = agent._invoke_tool("nonexistent_tool", "{}")
        assert "not available" in result

    def test_tool_bad_json_returns_error(self):
        agent = self._agent()
        result = agent._invoke_tool("calculator", "NOT JSON")
        assert "Error" in result

    def test_tools_registered(self):
        agent = self._agent()
        assert "calculator" in agent.tools
        assert "get_datetime" in agent.tools
        assert "notes" in agent.tools
        assert "tasks" in agent.tools

    def test_custom_tool_registered(self):
        class EchoTool(BaseTool):
            @property
            def name(self):
                return "echo"

            @property
            def description(self):
                return "Echoes input."

            @property
            def parameters(self):
                return {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                }

            def run(self, text: str = "", **_):
                return text

        agent = self._agent(tools=[EchoTool()])
        assert "echo" in agent.tools
        assert agent._invoke_tool("echo", json.dumps({"text": "hello"})) == "hello"
