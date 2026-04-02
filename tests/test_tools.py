"""Tests for individual tools."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from src.tools.calculator import CalculatorTool
from src.tools.datetime_tool import DatetimeTool
from src.tools.notes import NotesTool
from src.tools.tasks import TasksTool


# ---------------------------------------------------------------------------
# CalculatorTool
# ---------------------------------------------------------------------------

class TestCalculatorTool:
    def setup_method(self):
        self.tool = CalculatorTool()

    def test_addition(self):
        assert self.tool.run(expression="2 + 3") == "5"

    def test_multiplication(self):
        assert self.tool.run(expression="6 * 7") == "42"

    def test_power(self):
        assert self.tool.run(expression="2 ** 10") == "1024"

    def test_float_result(self):
        result = self.tool.run(expression="10 / 3")
        assert result.startswith("3.333")

    def test_modulo(self):
        assert self.tool.run(expression="17 % 5") == "2"

    def test_floor_division(self):
        assert self.tool.run(expression="17 // 5") == "3"

    def test_unary_minus(self):
        assert self.tool.run(expression="-5 + 10") == "5"

    def test_complex_expression(self):
        assert self.tool.run(expression="(2 + 3) * 4 - 1") == "19"

    def test_invalid_expression(self):
        result = self.tool.run(expression="not valid math")
        assert result.startswith("Error")

    def test_to_openai_function(self):
        spec = self.tool.to_openai_function()
        assert spec["type"] == "function"
        assert spec["function"]["name"] == "calculator"
        assert "expression" in spec["function"]["parameters"]["properties"]


# ---------------------------------------------------------------------------
# DatetimeTool
# ---------------------------------------------------------------------------

class TestDatetimeTool:
    def setup_method(self):
        self.tool = DatetimeTool()

    def test_returns_date(self):
        result = self.tool.run(format="date")
        # Should be YYYY-MM-DD
        parts = result.split("-")
        assert len(parts) == 3

    def test_returns_time(self):
        result = self.tool.run(format="time")
        assert "UTC" in result

    def test_returns_datetime(self):
        result = self.tool.run(format="datetime")
        assert "UTC" in result
        assert "-" in result

    def test_to_openai_function(self):
        spec = self.tool.to_openai_function()
        assert spec["function"]["name"] == "get_datetime"


# ---------------------------------------------------------------------------
# NotesTool
# ---------------------------------------------------------------------------

class TestNotesTool:
    def setup_method(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.path = Path(self._tmpdir.name) / "notes.json"
        self.tool = NotesTool(notes_path=self.path)

    def teardown_method(self):
        self._tmpdir.cleanup()

    def test_add_and_list(self):
        result = self.tool.run(action="add", title="Hello", content="World")
        assert "saved" in result.lower()

        listing = self.tool.run(action="list")
        assert "Hello" in listing

    def test_read_note(self):
        self.tool.run(action="add", title="My Note", content="Secret content")
        note_id = json.loads(self.path.read_text())[0]["id"]
        read_result = self.tool.run(action="read", note_id=note_id)
        assert "Secret content" in read_result

    def test_delete_note(self):
        self.tool.run(action="add", title="Delete Me", content="Bye")
        note_id = json.loads(self.path.read_text())[0]["id"]
        del_result = self.tool.run(action="delete", note_id=note_id)
        assert "deleted" in del_result.lower()
        assert self.tool.run(action="list") == "No notes found."

    def test_list_empty(self):
        assert self.tool.run(action="list") == "No notes found."

    def test_add_missing_fields(self):
        result = self.tool.run(action="add", title="", content="")
        assert "Error" in result

    def test_read_nonexistent(self):
        result = self.tool.run(action="read", note_id="abc123")
        assert "not found" in result.lower()

    def test_persistence(self):
        self.tool.run(action="add", title="Persist", content="data")
        # Re-load from same path
        tool2 = NotesTool(notes_path=self.path)
        listing = tool2.run(action="list")
        assert "Persist" in listing


# ---------------------------------------------------------------------------
# TasksTool
# ---------------------------------------------------------------------------

class TestTasksTool:
    def setup_method(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.path = Path(self._tmpdir.name) / "tasks.json"
        self.tool = TasksTool(tasks_path=self.path)

    def teardown_method(self):
        self._tmpdir.cleanup()

    def test_add_and_list(self):
        self.tool.run(action="add", title="Buy milk")
        listing = self.tool.run(action="list")
        assert "Buy milk" in listing

    def test_add_with_due_date(self):
        self.tool.run(action="add", title="Report", due_date="2026-12-31")
        listing = self.tool.run(action="list")
        assert "2026-12-31" in listing

    def test_complete_task(self):
        self.tool.run(action="add", title="Task X")
        task_id = json.loads(self.path.read_text())[0]["id"]
        result = self.tool.run(action="complete", task_id=task_id)
        assert "done" in result.lower()
        listing = self.tool.run(action="list", status="done")
        assert "Task X" in listing

    def test_delete_task(self):
        self.tool.run(action="add", title="Delete me")
        task_id = json.loads(self.path.read_text())[0]["id"]
        self.tool.run(action="delete", task_id=task_id)
        assert self.tool.run(action="list") == "No tasks found."

    def test_list_pending_filter(self):
        self.tool.run(action="add", title="Pending Task")
        self.tool.run(action="add", title="Done Task")
        task_id = json.loads(self.path.read_text())[1]["id"]
        self.tool.run(action="complete", task_id=task_id)

        pending = self.tool.run(action="list", status="pending")
        assert "Pending Task" in pending
        assert "Done Task" not in pending

    def test_add_missing_title(self):
        result = self.tool.run(action="add", title="")
        assert "Error" in result

    def test_complete_nonexistent(self):
        result = self.tool.run(action="complete", task_id="xyz")
        assert "not found" in result.lower()
