"""Personal Agent – CLI entry point.

Usage::

    python main.py

Interactive chat loop.  Type 'quit' or 'exit' to stop, 'reset' to clear history.
"""
from __future__ import annotations

import sys
from pathlib import Path

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt

from src.agent import PersonalAgent
from src.config import Config

app = typer.Typer(add_completion=False, help="Personal AI Agent – your smart assistant.")
console = Console()


def _make_agent(persist: bool) -> PersonalAgent:
    history_path = Config.data_path("history.json") if persist else None
    return PersonalAgent(history_path=history_path)


@app.command()
def chat(
    persist: bool = typer.Option(
        True, "--persist/--no-persist", help="Persist conversation history between sessions."
    ),
) -> None:
    """Start an interactive chat session with the personal agent."""
    if not Config.OPENAI_API_KEY:
        console.print(
            "[bold red]Error:[/bold red] OPENAI_API_KEY is not set. "
            "Copy .env.example to .env and fill in your key."
        )
        raise typer.Exit(code=1)

    agent = _make_agent(persist)

    console.print(
        Panel(
            f"[bold green]{Config.AGENT_NAME}[/bold green] is ready!\n"
            "Type [bold]quit[/bold] or [bold]exit[/bold] to stop.\n"
            "Type [bold]reset[/bold] to clear conversation history.",
            title="Personal Agent",
            border_style="green",
        )
    )

    while True:
        try:
            user_input = Prompt.ask("[bold cyan]You[/bold cyan]")
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye![/dim]")
            break

        stripped = user_input.strip()
        if not stripped:
            continue
        if stripped.lower() in ("quit", "exit"):
            console.print("[dim]Goodbye![/dim]")
            break
        if stripped.lower() == "reset":
            agent.reset()
            console.print("[dim]Conversation history cleared.[/dim]")
            continue

        try:
            response = agent.chat(stripped)
        except Exception as exc:  # pylint: disable=broad-except
            console.print(f"[bold red]Error:[/bold red] {exc}")
            continue

        console.print(Panel(Markdown(response), title=Config.AGENT_NAME, border_style="blue"))


@app.command()
def ask(
    message: str = typer.Argument(..., help="Single message to send to the agent."),
    persist: bool = typer.Option(
        False, "--persist/--no-persist", help="Load/save conversation history."
    ),
) -> None:
    """Send a single message and print the response (non-interactive)."""
    if not Config.OPENAI_API_KEY:
        console.print("[bold red]Error:[/bold red] OPENAI_API_KEY is not set.")
        raise typer.Exit(code=1)

    agent = _make_agent(persist)
    try:
        response = agent.chat(message)
    except Exception as exc:  # pylint: disable=broad-except
        console.print(f"[bold red]Error:[/bold red] {exc}")
        raise typer.Exit(code=1) from exc

    console.print(Markdown(response))


if __name__ == "__main__":
    app()
