# Personal Agent

A personal AI assistant built with Python and the OpenAI API.  
It runs as an interactive CLI and can manage your notes, tasks, do calculations, and answer general questions — all in one conversation.

## Features

| Capability | Description |
|---|---|
| 💬 **Conversational memory** | Remembers the full conversation (persisted to disk between sessions) |
| 📝 **Notes** | Add, list, read, and delete personal notes |
| ✅ **Tasks / To-dos** | Add tasks with optional due dates, mark complete, delete |
| 🔢 **Calculator** | Evaluate arithmetic expressions |
| 🕐 **Date & Time** | Get the current date, time, or both |

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/decardlabs/personal-agent.git
cd personal-agent
pip install -r requirements.txt
```

### 2. Configure your API key

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=<your key>
```

### 3. Run

**Interactive chat session:**

```bash
python main.py chat
```

**Single one-shot question:**

```bash
python main.py ask "What tasks do I have pending?"
```

During an interactive session type:

- `reset` – clear conversation history
- `quit` / `exit` – stop the agent

## Configuration

All settings live in `.env` (copy from `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *(required)* | Your OpenAI secret key |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use |
| `AGENT_NAME` | `PersonalAgent` | Display name in the chat |
| `DATA_DIR` | `data` | Directory for persisted notes/tasks/history |

## Project structure

```
personal-agent/
├── main.py              # CLI entry point (typer + rich)
├── requirements.txt
├── .env.example
├── src/
│   ├── agent.py         # Core agent – LLM loop + tool dispatch
│   ├── config.py        # Environment-based configuration
│   ├── memory/
│   │   └── conversation.py   # JSON-backed conversation memory
│   └── tools/
│       ├── base.py           # Abstract BaseTool
│       ├── calculator.py
│       ├── datetime_tool.py
│       ├── notes.py
│       └── tasks.py
└── tests/
    ├── test_agent.py
    ├── test_memory.py
    └── test_tools.py
```

## Running tests

```bash
pytest tests/ -v
```

## Adding custom tools

Subclass `BaseTool`, implement `name`, `description`, `parameters`, and `run`, then pass it to `PersonalAgent`:

```python
from src.tools.base import BaseTool
from src.agent import PersonalAgent

class WeatherTool(BaseTool):
    @property
    def name(self): return "get_weather"
    @property
    def description(self): return "Get the current weather for a city."
    @property
    def parameters(self):
        return {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        }
    def run(self, city: str, **_) -> str:
        return f"It is sunny in {city}."  # replace with real API call

agent = PersonalAgent(tools=[WeatherTool()])
```
