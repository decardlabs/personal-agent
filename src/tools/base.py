"""Abstract base class for agent tools."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseTool(ABC):
    """Every tool must declare its name, description, and parameter schema."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique tool identifier used by the agent."""

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description shown to the LLM."""

    @property
    @abstractmethod
    def parameters(self) -> Dict[str, Any]:
        """JSON-Schema object describing the tool's arguments."""

    @abstractmethod
    def run(self, **kwargs: Any) -> str:
        """Execute the tool and return a plain-text result."""

    def to_openai_function(self) -> Dict[str, Any]:
        """Serialise to the OpenAI *function* format used in chat completions."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }
