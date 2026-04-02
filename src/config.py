"""Configuration management for the personal agent."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


class Config:
    """Centralised configuration loaded from environment variables."""

    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    AGENT_NAME: str = os.getenv("AGENT_NAME", "PersonalAgent")
    DATA_DIR: Path = Path(os.getenv("DATA_DIR", "data"))

    @classmethod
    def data_path(cls, filename: str) -> Path:
        """Return an absolute path inside the data directory."""
        cls.DATA_DIR.mkdir(parents=True, exist_ok=True)
        return cls.DATA_DIR / filename
