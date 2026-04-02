"""Datetime tool – returns the current date and/or time."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from src.tools.base import BaseTool


class DatetimeTool(BaseTool):
    """Return the current date and time in the requested format."""

    @property
    def name(self) -> str:
        return "get_datetime"

    @property
    def description(self) -> str:
        return "Return the current date and/or time."

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "format": {
                    "type": "string",
                    "enum": ["date", "time", "datetime"],
                    "description": "Which part to return: 'date', 'time', or 'datetime'.",
                }
            },
            "required": ["format"],
        }

    def run(self, format: str = "datetime", **_: Any) -> str:  # type: ignore[override]
        now = datetime.now(tz=timezone.utc)
        if format == "date":
            return now.strftime("%Y-%m-%d")
        if format == "time":
            return now.strftime("%H:%M:%S UTC")
        return now.strftime("%Y-%m-%d %H:%M:%S UTC")
