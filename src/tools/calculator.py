"""Calculator tool – evaluates safe arithmetic expressions."""
from __future__ import annotations

import ast
import operator
from typing import Any, Dict

from src.tools.base import BaseTool

_SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
    ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv,
}


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.BinOp):
        op_fn = _SAFE_OPS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported operator: {node.op}")
        return op_fn(_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp):
        op_fn = _SAFE_OPS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported unary operator: {node.op}")
        return op_fn(_eval(node.operand))
    raise ValueError(f"Unsupported expression type: {type(node)}")


class CalculatorTool(BaseTool):
    """Evaluate a mathematical expression and return the result."""

    @property
    def name(self) -> str:
        return "calculator"

    @property
    def description(self) -> str:
        return (
            "Evaluate a mathematical expression and return the numeric result. "
            "Supports +, -, *, /, **, %, // operators."
        )

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "The arithmetic expression to evaluate, e.g. '2 + 3 * 4'.",
                }
            },
            "required": ["expression"],
        }

    def run(self, expression: str, **_: Any) -> str:  # type: ignore[override]
        try:
            tree = ast.parse(expression, mode="eval")
            result = _eval(tree.body)
            if isinstance(result, float) and result.is_integer():
                return str(int(result))
            return str(result)
        except Exception as exc:
            return f"Error: {exc}"
