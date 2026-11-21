#!/usr/bin/env python3
"""Render fixed contract fragments from specs_contract.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

JSON_PATH = Path(__file__).with_name("specs_contract.json")
DOC_PATH = Path(__file__).resolve().parents[1] / "references" / "contract.md"


def fragments(contract: dict) -> dict[str, str]:
    inline = lambda values: "、".join(f"`{value}`" for value in values)
    statuses = lambda key, definitions: "；".join(
        f"`{name}`：{contract[definitions][name]}"
        for name in contract[key]
    )
    header = "| " + " | ".join(contract["schedule_headers"]) + " |"
    structure = (
        "`plan.md` 必须包含且仅包含一个以下二级章节：\n\n"
        f"```text\n{contract['parallel_section']}\n```\n\n"
        f"必须包含非空字段：{inline(contract['required_parallel_fields'])}。\n\n"
        f"随后必须包含唯一的 `{contract['schedule_table_heading']}`，表头精确为：\n\n"
        f"```text\n{header}\n```\n\n"
        f"每个 Task 卡必须包含非空子章节：{inline(contract['required_task_sections'])}；"
        f"`### 约束` 必须包含：{inline(contract['required_task_constraint_fields'])}。"
    )
    return {
        "plan_structure": structure,
        "task_statuses": statuses("task_statuses", "task_status_definitions"),
        "gate_statuses": statuses("gate_statuses", "gate_status_definitions"),
        "reviewer_conclusions": inline(contract["reviewer_conclusions"]),
        "user_decisions": inline(contract["user_decisions"]),
        "task_progress_fields": inline(contract["task_progress_required_fields"]),
        "gate_progress_fields": inline(contract["gate_progress_required_fields"]),
        "manual_gate_progress_fields": inline(contract["manual_gate_progress_required_fields"]),
        "review_record_fields": inline(contract["review_required_fields"]),
    }


def render(text: str, body: str, name: str) -> str:
    begin, end = f"<!-- BEGIN GENERATED: {name} -->", f"<!-- END GENERATED: {name} -->"
    start, finish = text.find(begin), text.find(end)
    if start < 0 or finish <= start:
        raise ValueError(f"missing generated markers for {name}")
    return text[:start] + begin + "\n" + body.rstrip() + "\n" + end + text[finish + len(end) :]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    contract = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    current = DOC_PATH.read_text(encoding="utf-8")
    rendered = current
    for name, body in fragments(contract).items():
        rendered = render(rendered, body, name)
    if args.check:
        if rendered != current:
            print("contract.md generated fragments are stale; run render_contract.py")
            return 1
        print("contract.md generated fragments are current.")
        return 0
    DOC_PATH.write_text(rendered, encoding="utf-8")
    print(f"updated {DOC_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
