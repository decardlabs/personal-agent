"""Tasks tool – manage a simple to-do list."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from src.tools.base import BaseTool


class TasksTool(BaseTool):
    """Manage personal tasks / to-dos stored in a local JSON file."""

    def __init__(self, tasks_path: Path | None = None) -> None:
        from src.config import Config

        self._path = tasks_path or Config.data_path("tasks.json")
        self._tasks: List[Dict[str, Any]] = []
        self._load()

    # ------------------------------------------------------------------
    # BaseTool interface
    # ------------------------------------------------------------------

    @property
    def name(self) -> str:
        return "tasks"

    @property
    def description(self) -> str:
        return (
            "Manage a personal to-do list. Actions: "
            "'add' (title, optional due_date), "
            "'list' (optional status filter: 'pending'|'done'|'all'), "
            "'complete' (task_id), "
            "'delete' (task_id)."
        )

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["add", "list", "complete", "delete"],
                    "description": "The action to perform.",
                },
                "title": {
                    "type": "string",
                    "description": "Task title (required for 'add').",
                },
                "due_date": {
                    "type": "string",
                    "description": "Optional due date in YYYY-MM-DD format.",
                },
                "task_id": {
                    "type": "string",
                    "description": "Task ID (required for 'complete' and 'delete').",
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "done", "all"],
                    "description": "Filter tasks by status when using 'list'.",
                },
            },
            "required": ["action"],
        }

    def run(  # type: ignore[override]
        self,
        action: str,
        title: str = "",
        due_date: str = "",
        task_id: str = "",
        status: str = "all",
        **_: Any,
    ) -> str:
        if action == "add":
            return self._add(title, due_date)
        if action == "list":
            return self._list(status)
        if action == "complete":
            return self._complete(task_id)
        if action == "delete":
            return self._delete(task_id)
        return f"Unknown action: {action}"

    # ------------------------------------------------------------------
    # Internal operations
    # ------------------------------------------------------------------

    def _add(self, title: str, due_date: str) -> str:
        if not title:
            return "Error: 'title' is required for adding a task."
        task: Dict[str, Any] = {
            "id": str(uuid.uuid4())[:8],
            "title": title,
            "status": "pending",
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
            "due_date": due_date or None,
        }
        self._tasks.append(task)
        self._save()
        return f"Task added with ID: {task['id']}"

    def _list(self, status: str = "all") -> str:
        tasks = self._tasks
        if status in ("pending", "done"):
            tasks = [t for t in tasks if t["status"] == status]
        if not tasks:
            return "No tasks found."
        lines: List[str] = []
        for t in tasks:
            due = f" (due: {t['due_date']})" if t.get("due_date") else ""
            mark = "✓" if t["status"] == "done" else "○"
            lines.append(f"[{t['id']}] {mark} {t['title']}{due}")
        return "\n".join(lines)

    def _complete(self, task_id: str) -> str:
        task = self._find(task_id)
        if task is None:
            return f"Task '{task_id}' not found."
        task["status"] = "done"
        self._save()
        return f"Task '{task_id}' marked as done."

    def _delete(self, task_id: str) -> str:
        task = self._find(task_id)
        if task is None:
            return f"Task '{task_id}' not found."
        self._tasks = [t for t in self._tasks if t["id"] != task_id]
        self._save()
        return f"Task '{task_id}' deleted."

    def _find(self, task_id: str) -> Dict[str, Any] | None:
        for t in self._tasks:
            if t["id"] == task_id:
                return t
        return None

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._tasks, indent=2), encoding="utf-8")

    def _load(self) -> None:
        if self._path.exists():
            try:
                self._tasks = json.loads(self._path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                self._tasks = []
