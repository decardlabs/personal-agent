"""Core personal agent that orchestrates LLM calls and tool execution."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import OpenAI

from src.config import Config
from src.memory.conversation import ConversationMemory
from src.tools import CalculatorTool, DatetimeTool, NotesTool, TasksTool
from src.tools.base import BaseTool

_SYSTEM_PROMPT = """\
You are {agent_name}, a helpful personal AI assistant.
You help the user manage notes, tasks, and answer questions.
Always be concise and friendly.
When using tools, always act on the user's behalf without asking for confirmation \
unless the action is irreversible (like deleting data).
Today's context will be provided by the get_datetime tool when needed.
"""


class PersonalAgent:
    """Personal AI agent backed by an OpenAI chat-completion model.

    Parameters
    ----------
    api_key:
        OpenAI API key. Falls back to ``Config.OPENAI_API_KEY``.
    model:
        OpenAI model name. Falls back to ``Config.OPENAI_MODEL``.
    agent_name:
        Display name of the agent. Falls back to ``Config.AGENT_NAME``.
    history_path:
        Optional path for persisting conversation history.
    tools:
        Optional list of :class:`BaseTool` instances to register.
        Defaults to all built-in tools.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        agent_name: Optional[str] = None,
        history_path: Optional[Path] = None,
        tools: Optional[List[BaseTool]] = None,
    ) -> None:
        self._model = model or Config.OPENAI_MODEL
        self._agent_name = agent_name or Config.AGENT_NAME

        self._client = OpenAI(api_key=api_key or Config.OPENAI_API_KEY)

        self._memory = ConversationMemory(history_path=history_path)

        # Register tools
        self._tools: Dict[str, BaseTool] = {}
        for tool in tools or self._default_tools():
            self._tools[tool.name] = tool

        # Seed system message if memory is empty
        if len(self._memory) == 0:
            self._memory.add(
                "system",
                _SYSTEM_PROMPT.format(agent_name=self._agent_name),
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def chat(self, user_message: str) -> str:
        """Send *user_message* to the agent and return the assistant reply."""
        self._memory.add("user", user_message)
        response = self._call_llm()
        return response

    def reset(self) -> None:
        """Clear conversation history."""
        self._memory.clear()
        self._memory.add(
            "system",
            _SYSTEM_PROMPT.format(agent_name=self._agent_name),
        )

    @property
    def tools(self) -> Dict[str, BaseTool]:
        return dict(self._tools)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _default_tools(self) -> List[BaseTool]:
        return [
            CalculatorTool(),
            DatetimeTool(),
            NotesTool(),
            TasksTool(),
        ]

    def _openai_tools(self) -> List[Dict[str, Any]]:
        return [t.to_openai_function() for t in self._tools.values()]

    def _call_llm(self) -> str:
        """Run the LLM loop, executing tool calls until a final answer is ready."""
        while True:
            completion = self._client.chat.completions.create(
                model=self._model,
                messages=self._memory.get_messages(),  # type: ignore[arg-type]
                tools=self._openai_tools(),
                tool_choice="auto",
            )
            message = completion.choices[0].message

            # No tool call – we have a final text response
            if not message.tool_calls:
                content = message.content or ""
                self._memory.add("assistant", content)
                return content

            # Process tool calls
            tool_calls_data: List[Dict[str, Any]] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in message.tool_calls
            ]
            self._memory.add_raw(
                {"role": "assistant", "content": message.content, "tool_calls": tool_calls_data}
            )

            for tc in message.tool_calls:
                result = self._invoke_tool(tc.function.name, tc.function.arguments)
                self._memory.add_raw(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    }
                )

    def _invoke_tool(self, name: str, arguments_json: str) -> str:
        """Invoke a registered tool by name with JSON-encoded arguments."""
        tool = self._tools.get(name)
        if tool is None:
            return f"Error: tool '{name}' is not available."
        try:
            kwargs = json.loads(arguments_json)
            return tool.run(**kwargs)
        except Exception as exc:  # pylint: disable=broad-except
            return f"Error running tool '{name}': {exc}"
