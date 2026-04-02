"""Conversation memory backed by a JSON file."""
from __future__ import annotations

import json
from pathlib import Path
from typing import List


class ConversationMemory:
    """Persist and retrieve conversation history.

    Messages are stored in the OpenAI chat-completion format::

        {"role": "user" | "assistant" | "system", "content": "..."}
    """

    def __init__(self, history_path: Path | None = None, max_turns: int = 50) -> None:
        self._path = history_path
        self._max_turns = max_turns
        self._messages: List[dict] = []
        if history_path and history_path.exists():
            self._load()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add(self, role: str, content: str) -> None:
        """Append a simple text message and persist to disk if a path was provided."""
        self.add_raw({"role": role, "content": content})

    def add_raw(self, message: dict) -> None:
        """Append an arbitrary message dict (e.g. tool-call or tool-result messages).

        Trimming and persistence are applied in the same way as :meth:`add`.
        """
        self._messages.append(message)
        self._trim()
        if self._path:
            self._save()

    def get_messages(self) -> List[dict]:
        """Return the full message list (a shallow copy)."""
        return list(self._messages)

    def clear(self) -> None:
        """Remove all messages and delete the backing file if present."""
        self._messages = []
        if self._path and self._path.exists():
            self._path.unlink()

    def __len__(self) -> int:
        return len(self._messages)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _trim(self) -> None:
        """Keep at most *max_turns* messages (excluding the system message)."""
        system_msgs = [m for m in self._messages if m["role"] == "system"]
        other_msgs = [m for m in self._messages if m["role"] != "system"]
        if len(other_msgs) > self._max_turns:
            other_msgs = other_msgs[-self._max_turns :]
        self._messages = system_msgs + other_msgs

    def _save(self) -> None:
        assert self._path is not None
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._messages, indent=2), encoding="utf-8")

    def _load(self) -> None:
        assert self._path is not None
        try:
            self._messages = json.loads(self._path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            self._messages = []
