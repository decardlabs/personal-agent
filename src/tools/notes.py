"""Notes tool – create, read, list and delete plain-text notes."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from src.tools.base import BaseTool


class NotesTool(BaseTool):
    """Manage personal notes stored in a local JSON file."""

    def __init__(self, notes_path: Path | None = None) -> None:
        from src.config import Config

        self._path = notes_path or Config.data_path("notes.json")
        self._notes: List[Dict[str, str]] = []
        self._load()

    # ------------------------------------------------------------------
    # BaseTool interface
    # ------------------------------------------------------------------

    @property
    def name(self) -> str:
        return "notes"

    @property
    def description(self) -> str:
        return (
            "Manage personal notes. Actions: "
            "'add' (title, content), "
            "'list' (no args), "
            "'read' (note_id), "
            "'delete' (note_id)."
        )

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["add", "list", "read", "delete"],
                    "description": "The action to perform.",
                },
                "title": {
                    "type": "string",
                    "description": "Title of the note (required for 'add').",
                },
                "content": {
                    "type": "string",
                    "description": "Content of the note (required for 'add').",
                },
                "note_id": {
                    "type": "string",
                    "description": "The ID of the note (required for 'read' and 'delete').",
                },
            },
            "required": ["action"],
        }

    def run(  # type: ignore[override]
        self,
        action: str,
        title: str = "",
        content: str = "",
        note_id: str = "",
        **_: Any,
    ) -> str:
        if action == "add":
            return self._add(title, content)
        if action == "list":
            return self._list()
        if action == "read":
            return self._read(note_id)
        if action == "delete":
            return self._delete(note_id)
        return f"Unknown action: {action}"

    # ------------------------------------------------------------------
    # Internal operations
    # ------------------------------------------------------------------

    def _add(self, title: str, content: str) -> str:
        if not title or not content:
            return "Error: 'title' and 'content' are required for adding a note."
        note = {
            "id": str(uuid.uuid4())[:8],
            "title": title,
            "content": content,
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        self._notes.append(note)
        self._save()
        return f"Note saved with ID: {note['id']}"

    def _list(self) -> str:
        if not self._notes:
            return "No notes found."
        lines = [f"[{n['id']}] {n['title']} ({n['created_at'][:10]})" for n in self._notes]
        return "\n".join(lines)

    def _read(self, note_id: str) -> str:
        note = self._find(note_id)
        if note is None:
            return f"Note '{note_id}' not found."
        return f"Title: {note['title']}\n\n{note['content']}"

    def _delete(self, note_id: str) -> str:
        note = self._find(note_id)
        if note is None:
            return f"Note '{note_id}' not found."
        self._notes = [n for n in self._notes if n["id"] != note_id]
        self._save()
        return f"Note '{note_id}' deleted."

    def _find(self, note_id: str) -> Dict[str, str] | None:
        for n in self._notes:
            if n["id"] == note_id:
                return n
        return None

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._notes, indent=2), encoding="utf-8")

    def _load(self) -> None:
        if self._path.exists():
            try:
                self._notes = json.loads(self._path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                self._notes = []
