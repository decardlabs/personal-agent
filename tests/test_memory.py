"""Tests for conversation memory."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from src.memory.conversation import ConversationMemory


class TestConversationMemory:
    def test_add_and_get(self):
        mem = ConversationMemory()
        mem.add("user", "Hello")
        mem.add("assistant", "Hi there")
        msgs = mem.get_messages()
        assert len(msgs) == 2
        assert msgs[0] == {"role": "user", "content": "Hello"}
        assert msgs[1] == {"role": "assistant", "content": "Hi there"}

    def test_len(self):
        mem = ConversationMemory()
        assert len(mem) == 0
        mem.add("user", "test")
        assert len(mem) == 1

    def test_clear(self):
        mem = ConversationMemory()
        mem.add("user", "Hello")
        mem.clear()
        assert len(mem) == 0

    def test_persistence(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "history.json"
            mem = ConversationMemory(history_path=path)
            mem.add("user", "Remember me")
            mem.add("assistant", "OK")

            # Reload from disk
            mem2 = ConversationMemory(history_path=path)
            msgs = mem2.get_messages()
            assert len(msgs) == 2
            assert msgs[0]["content"] == "Remember me"

    def test_clear_deletes_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "history.json"
            mem = ConversationMemory(history_path=path)
            mem.add("user", "hi")
            assert path.exists()
            mem.clear()
            assert not path.exists()

    def test_trim_keeps_max_turns(self):
        mem = ConversationMemory(max_turns=4)
        for i in range(10):
            mem.add("user", f"msg {i}")
        # Should only keep last 4 non-system messages
        msgs = mem.get_messages()
        assert len(msgs) == 4
        assert msgs[-1]["content"] == "msg 9"

    def test_system_message_preserved_during_trim(self):
        mem = ConversationMemory(max_turns=2)
        mem.add("system", "You are an assistant.")
        for i in range(5):
            mem.add("user", f"msg {i}")
        msgs = mem.get_messages()
        system_msgs = [m for m in msgs if m["role"] == "system"]
        assert len(system_msgs) == 1
        assert system_msgs[0]["content"] == "You are an assistant."

    def test_get_messages_returns_copy(self):
        mem = ConversationMemory()
        mem.add("user", "test")
        msgs = mem.get_messages()
        msgs.clear()  # modifying the returned list should not affect memory
        assert len(mem) == 1

    def test_load_corrupt_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "history.json"
            path.write_text("NOT VALID JSON", encoding="utf-8")
            mem = ConversationMemory(history_path=path)
            assert len(mem) == 0
