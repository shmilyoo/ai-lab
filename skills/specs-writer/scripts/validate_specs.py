#!/usr/bin/env python3
"""Validate design/plan/progress specs against references/contract.md."""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CONTRACT_JSON = SCRIPT_DIR / "specs_contract.json"
FIELD = re.compile(r"^(?P<indent>\s*)-\s+(?P<name>[^：:]+?)\s*[：:]\s*(?P<value>.*)$")
STEP = re.compile(r"^\s*-\s+\[([ xX])\]\s+")
SUBHEADING = re.compile(r"^###\s+(.+?)\s*$")
TASK = re.compile(r"^##\s+Task\s+(\d+)\s*:(.*?)(?:\s*\[(\w+)\])?\s*$")
GATE = re.compile(r"^##\s+Gate\s+([\w.-]+)\s*:(.*?)(?:\s*\[(\w+)\])?\s*$")
FINAL = re.compile(r"^##\s+Final Gate\s*:(.*?)(?:\s*\[(\w+)\])?\s*$")
MANUAL = re.compile(r"^##\s+Manual Gate\s*:(.*?)(?:\s*\[(\w+)\])?\s*$")
TASK_PROGRESS = re.compile(r"^###\s+Task\s+(\d+)\s+[—–-]\s+\[(\w+)\]\s*$")
GATE_PROGRESS = re.compile(
    r"^###\s+((?:Gate\s+[\w.-]+)|Final Gate|Manual Gate)\s+[—–-]\s+\[(\w+)\]\s*$"
)
REVIEW_HEADING = re.compile(
    r"^###\s+方案review(?:\s+[—–-]\s+\d{4}-\d{2}-\d{2})?\s*$"
)
VERIFIER_IDENTITY = re.compile(
    r"^Verifier Worker\s+(?P<worker>[\w.-]+)\s*/\s*Context\s+(?P<context>[\w.-]+)$"
)
PLACEHOLDERS = {"true", "false", ":", "echo", "echo ok", "exit 0"}
SEPARATORS = re.compile(r"<br\s*/?>|[,;，；、]")


@dataclass
class Section:
    kind: str
    identifier: str
    status: str
    line: int
    fields: dict[str, str] = field(default_factory=dict)
    nested: dict[str, list[tuple[str, str]]] = field(default_factory=dict)
    subsections: dict[str, str] = field(default_factory=dict)
    checked: int = 0
    unchecked: int = 0

    def value(self, name: str) -> str:
        return self.fields.get(name, "").strip()

    def child(self, parent: str, name: str) -> str:
        return next((v.strip() for n, v in self.nested.get(parent, []) if n == name), "")

    def subsection(self, name: str) -> str:
        return self.subsections.get(name, "").strip()

    def has(self, name: str) -> bool:
        return bool(self.value(name)) or any(v.strip() for _, v in self.nested.get(name, []))


@dataclass
class Block:
    identifier: str
    status: str
    line: int
    fields: dict[str, str]

    def value(self, name: str) -> str:
        return self.fields.get(name, "").strip()


@dataclass
class Row:
    cells: list[str]
    task: int
    dependencies: set[int]
    values: dict[str, str]


@dataclass
class Model:
    directory: Path
    contract: dict
    design: bool
    plan: bool
    progress: bool
    plan_lines: list[str]
    strategy: str
    headers: list[str] | None
    rows: list[Row]
    tasks: list[Section]
    gates: list[Section]
    finals: list[Section]
    manuals: list[Section]
    task_blocks: list[Block]
    gate_blocks: list[Block]
    reviews: list[Block]
    review_markers: set[str]


@dataclass
class Result:
    errors: list[str] = field(default_factory=list)

    def error(self, message: str) -> None:
        self.errors.append(message)


def parse_fields(raw: str) -> tuple[dict[str, str], dict[str, list[tuple[str, str]]]]:
    fields: dict[str, str] = {}
    nested: dict[str, list[tuple[str, str]]] = defaultdict(list)
    parent = ""
    in_subsection = False
    for line in raw.splitlines():
        if heading := SUBHEADING.match(line):
            parent = heading.group(1).strip()
            in_subsection = True
            continue
        match = FIELD.match(line)
        if not match:
            continue
        name, value = match.group("name").strip(), match.group("value").strip()
        if in_subsection or match.group("indent"):
            nested[parent].append((name, value))
        else:
            fields[name] = value
            parent = name
    return fields, dict(nested)


def parse_workflow(directory: Path, contract: dict) -> Model:
    plan_lines = _lines(directory / "plan.md")
    progress_lines = _lines(directory / "progress.md")
    strategy = _named_section(plan_lines, contract["parallel_section"])
    headers, rows = _schedule(strategy, contract["schedule_table_heading"])
    tasks, gates, finals, manuals = _work_sections(plan_lines)
    task_blocks, gate_blocks, reviews, markers = _progress(
        progress_lines, contract["review_skip_markers"]
    )
    return Model(
        directory, contract, (directory / "design.md").exists(),
        (directory / "plan.md").exists(), (directory / "progress.md").exists(),
        plan_lines, strategy, headers, rows, tasks, gates, finals, manuals,
        task_blocks, gate_blocks, reviews, markers,
    )


def _lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines() if path.exists() else []


def _named_section(lines: list[str], heading: str) -> str:
    start = next((i for i, line in enumerate(lines) if line.strip() == heading), None)
    if start is None:
        return ""
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"^##\s+", lines[i])), len(lines))
    return "\n".join(lines[start:end])


def _schedule(section: str, heading: str) -> tuple[list[str] | None, list[Row]]:
    lines = section.splitlines()
    start = next((i for i, line in enumerate(lines) if line.strip() == heading), None)
    if start is None:
        return None, []
    table = []
    for line in lines[start + 1 :]:
        if line.strip().startswith("|"):
            table.append(line)
        elif table:
            break
    if not table:
        return None, []
    headers = _cells(table[0])
    rows: list[Row] = []
    for line in table[1:]:
        cells = _cells(line)
        if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            continue
        values = dict(zip(headers, cells))
        match = re.fullmatch(r"Task\s+(\d+)", values.get("Task", ""))
        number = int(match.group(1)) if match else -1
        deps = {int(v) for v in re.findall(r"Task\s+(\d+)", values.get("硬依赖", ""))}
        rows.append(Row(cells, number, deps, values))
    return headers, rows


def _cells(line: str) -> list[str]:
    text = line.strip()
    if not (text.startswith("|") and text.endswith("|")):
        return []
    return [cell.strip().strip("`") for cell in text[1:-1].split("|")]


def _work_sections(lines: list[str]) -> tuple[list[Section], list[Section], list[Section], list[Section]]:
    found: list[Section] = []
    for index, line in enumerate(lines):
        kind = identifier = status = ""
        title = ""
        if match := TASK.match(line):
            kind, identifier, title, status = "task", match.group(1), match.group(2), match.group(3) or ""
        elif match := FINAL.match(line):
            kind, identifier, title, status = "final", "Final Gate", match.group(1), match.group(2) or ""
        elif match := MANUAL.match(line):
            kind, identifier, title, status = "manual", "Manual Gate", match.group(1), match.group(2) or ""
        elif match := GATE.match(line):
            kind, identifier, title, status = "gate", match.group(1), match.group(2), match.group(3) or ""
        if not kind:
            continue
        raw = _heading_section(lines, index)
        fields, nested = parse_fields(raw)
        subsections = _subsections(raw)
        found.append(
            Section(
                kind, identifier, status, index + 1, fields, nested, subsections,
                sum(1 for item in raw.splitlines() if (step := STEP.match(item)) and step.group(1).lower() == "x"),
                sum(1 for item in raw.splitlines() if (step := STEP.match(item)) and step.group(1) == " "),
            )
        )
    return (
        [item for item in found if item.kind == "task"],
        [item for item in found if item.kind == "gate"],
        [item for item in found if item.kind == "final"],
        [item for item in found if item.kind == "manual"],
    )


def _heading_section(lines: list[str], start: int) -> str:
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"^##\s+", lines[i])), len(lines))
    return "\n".join(lines[start:end])


def _subsections(raw: str) -> dict[str, str]:
    lines = raw.splitlines()
    result: dict[str, str] = {}
    index = 0
    while index < len(lines):
        match = SUBHEADING.match(lines[index])
        if not match:
            index += 1
            continue
        name = match.group(1).strip()
        start = index + 1
        index = start
        while index < len(lines) and not SUBHEADING.match(lines[index]):
            index += 1
        result[name] = "\n".join(lines[start:index]).strip()
    return result


def _progress(lines: list[str], markers: list[str]) -> tuple[list[Block], list[Block], list[Block], set[str]]:
    tasks: list[Block] = []
    gates: list[Block] = []
    reviews: list[Block] = []
    skipped = {line.strip() for line in lines if line.strip() in markers}
    index = 0
    while index < len(lines):
        line = lines[index]
        kind = identifier = status = ""
        if REVIEW_HEADING.match(line):
            kind, identifier = "review", "方案review"
        elif match := TASK_PROGRESS.match(line):
            kind, identifier, status = "task", match.group(1), match.group(2)
        elif match := GATE_PROGRESS.match(line):
            kind, identifier, status = "gate", match.group(1), match.group(2)
            identifier = identifier[5:] if identifier.startswith("Gate ") else identifier
        if not kind:
            index += 1
            continue
        start = index
        raw = [line]
        index += 1
        while index < len(lines) and not re.match(r"^#{2,3}\s+", lines[index]):
            raw.append(lines[index])
            index += 1
        fields, _ = parse_fields("\n".join(raw[1:]))
        block = Block(identifier, status, start + 1, fields)
        (tasks if kind == "task" else gates if kind == "gate" else reviews).append(block)
    return tasks, gates, reviews, skipped


def validate_model(
    model: Model, *, schedule_only: bool = False, require_review_record: bool = False
) -> Result:
    result = Result()
    if not any((model.design, model.plan, model.progress)):
        result.error(f"no design.md, plan.md, or progress.md found in {model.directory}")
        return result
    if not model.plan:
        if not model.design:
            result.error("decision-only workflow must contain design.md")
        elif not any(line.startswith("## ") for line in _lines(model.directory / "design.md")):
            result.error("design.md must contain at least one '## ' section")
        return result
    if not model.design:
        result.error("an execution plan must also contain design.md")

    _validate_strategy(model, result)
    _validate_schedule(model, result)
    if schedule_only:
        return result
    if not model.progress:
        result.error("an execution plan must also contain progress.md")
    _validate_headings(model, result)
    _validate_tasks(model, result)
    _validate_gates(model, result)
    _validate_order(model, result)
    _validate_evidence(model, result)
    _validate_review(model, require_review_record, result)
    return result


def _validate_strategy(model: Model, result: Result) -> None:
    contract = model.contract
    if any(term in "\n".join(model.plan_lines) for term in (
        "compact-plan", "AI 预估(min)", "编排前纯串行基线", "编排后关键路径", "| 波次 |"
    )):
        result.error("legacy plan format detected; regenerate with current execution-plan template")
    heading = contract["parallel_section"]
    if sum(line.strip() == heading for line in model.plan_lines) != 1:
        result.error(f"plan.md must contain exactly one '{heading}' section")
    if not model.strategy:
        result.error(f"plan.md is missing '{heading}'")
        return
    fields, _ = parse_fields(model.strategy)
    for name in contract["required_parallel_fields"]:
        if not fields.get(name, "").strip():
            result.error(f"parallel strategy is missing '- {name}：'")
    for name in ("Worker 输入", "Worker 回传", "日志边界"):
        if any(term in fields.get(name, "") for term in ("无限制", "完整对话", "源码全文")):
            result.error(f"'{name}' allows unbounded context transfer")


def _validate_schedule(model: Model, result: Result) -> None:
    contract = model.contract
    heading = contract["schedule_table_heading"]
    if sum(line.strip() == heading for line in model.plan_lines) != 1:
        result.error(f"plan.md must contain exactly one '{heading}'")
    if model.headers is None:
        result.error(f"plan.md is missing scheduling table '{heading}'")
        return
    expected = contract["schedule_headers"]
    if model.headers != expected:
        result.error("scheduling table headers must be exactly: " + " | ".join(expected))

    seen: set[int] = set()
    rows: list[Row] = []
    for row in model.rows:
        if len(row.cells) != len(expected):
            result.error(f"scheduling row must contain {len(expected)} cells")
            continue
        for name, value in zip(expected, row.cells):
            if not value:
                result.error(f"scheduling cell '{name}' must be non-empty")
        if row.task < 0:
            result.error(f"scheduling Task cell must be 'Task N': {row.cells[0]}")
        elif row.task in seen:
            result.error(f"duplicate scheduling row for Task {row.task}")
        else:
            seen.add(row.task)
            rows.append(row)
    if not rows:
        result.error("scheduling table must contain at least one Task")
        return

    graph = {row.task: row.dependencies for row in rows}
    for task, dependencies in graph.items():
        for dependency in dependencies:
            if dependency not in graph:
                result.error(f"Task {task} depends on missing Task {dependency}")
            if dependency == task:
                result.error(f"Task {task} cannot depend on itself")
    if cycle := _cycle(graph):
        result.error("scheduling dependencies contain a cycle: " + " -> ".join(map(str, cycle)))
        return

    fields, _ = parse_fields(model.strategy)
    execution = fields.get("执行能力", "")
    boundary = fields.get("主代理边界", "")
    capacity = _capacity(execution)
    if capacity is None or capacity <= 0:
        result.error("执行能力 must include a positive '最多并发：N'")
    if len(rows) > 1:
        if contract["multi_task_execution_marker"] not in execution:
            result.error("multi-Task plan must state '每个 Task 使用独立 Worker/上下文'")
        if contract["multi_task_boundary_marker"] not in boundary:
            result.error("multi-Task plan must prohibit the main agent from implementing Tasks")
        _validate_handoff(fields, contract, result)

    frozen = fields.get("契约冻结", "")
    for row in rows:
        for identifier in _items(row.values.get("契约", "")):
            if identifier not in frozen:
                result.error(
                    f"Task {row.task} contract {identifier} is not declared in 契约冻结"
                )
    if any(_items(row.values.get("契约", "")) for row in rows) and "已冻结" not in frozen:
        result.error("契约冻结 must state that consumed contracts are 已冻结")
    _validate_contract_artifacts(fields, rows, result)

    if len(rows) >= 3 or model.gates:
        if not re.search(r"```mermaid\s*\n\s*flowchart\s+LR\b", "\n".join(model.plan_lines)):
            result.error("complex plan must contain a Mermaid flowchart LR")


def _validate_handoff(fields: dict[str, str], contract: dict, result: Result) -> None:
    required = {
        "Worker 输入": contract["worker_input_required"],
        "Worker 回传": contract["worker_return_required"],
        "日志边界": contract["worker_log_required"],
        "禁止回传": contract["worker_forbidden_required"],
    }
    for name, terms in required.items():
        value = fields.get(name, "")
        missing = [term for term in terms if term not in value]
        if missing:
            result.error(f"'{name}' is missing: {', '.join(missing)}")
    boundaries = f"{fields.get('日志边界', '')} {fields.get('禁止回传', '')}"
    positive_full_context = re.compile(
        r"(?<!不)(?:允许|可以|可|需要|应).{0,12}"
        r"(?:回传|传输|返回|读取|接收).{0,20}"
        r"(?:完整源码|源码全文|完整对话|完整日志|完整 diff)"
    )
    if positive_full_context.search(boundaries):
        result.error("日志边界/禁止回传 must not permit sending full context back")


def _validate_contract_artifacts(fields: dict[str, str], rows: list[Row], result: Result) -> None:
    identifiers = {
        identifier
        for row in rows
        for identifier in _items(row.values.get("契约", ""))
    }
    if not identifiers:
        return

    artifacts = fields.get("契约产物", "")
    missing = sorted(identifier for identifier in identifiers if identifier not in artifacts)
    if missing:
        result.error("契约产物 is missing: " + ", ".join(missing))

    temporary = "临时过程契约" in artifacts
    long_term = "长期测试 fixture" in artifacts
    if not temporary and not long_term:
        result.error("契约产物 must declare 临时过程契约 or 长期测试 fixture")
    if temporary:
        if "work/contracts/" not in artifacts:
            result.error("临时过程契约 path must stay under work/contracts/")
        if "test-support/" in artifacts:
            result.error("临时过程契约 must not be placed in a project test-support directory")
        if "删除" not in artifacts:
            result.error("临时过程契约 must declare its cleanup after acceptance")
    if long_term and "work/" in artifacts:
        result.error("长期测试 fixture must not depend on the workflow work/ directory")


def _validate_headings(model: Model, result: Result) -> None:
    task_statuses = set(model.contract["task_statuses"])
    gate_statuses = set(model.contract["gate_statuses"])
    for index, line in enumerate(model.plan_lines, start=1):
        if re.match(r"^##\s+Task\b", line):
            match = TASK.match(line)
            if not match or match.group(3) not in task_statuses:
                result.error(f"plan.md:{index}: Task heading has an invalid status")
        elif re.match(r"^##\s+(Gate|Final Gate|Manual Gate)\b", line):
            match = GATE.match(line) or FINAL.match(line) or MANUAL.match(line)
            status = match.group(match.lastindex) if match and match.lastindex else None
            if not status or status not in gate_statuses:
                result.error(f"plan.md:{index}: Gate heading has an invalid status")


def _validate_tasks(model: Model, result: Result) -> None:
    if not model.tasks:
        result.error("plan.md must contain at least one Task card")
    numbers: set[int] = set()
    for task in model.tasks:
        number = int(task.identifier)
        if number in numbers:
            result.error(f"duplicate Task {number}")
        numbers.add(number)
        for name in model.contract["required_task_sections"]:
            if not task.subsection(name):
                result.error(f"plan.md:{task.line}: Task is missing non-empty '### {name}'")
        for name in model.contract["required_task_constraint_fields"]:
            if not task.child("约束", name):
                result.error(f"plan.md:{task.line}: 约束 requires '- {name}：'")
        if task.value("硬依赖") or task.value("契约") or task.value("独占资源"):
            result.error(f"plan.md:{task.line}: Task card must not duplicate scheduling facts")
        if not task.child("验证", "新增信号"):
            result.error(f"plan.md:{task.line}: 验证 requires '- 新增信号：'")
        command = task.child("验证", "命令")
        gate_ref = task.child("验证", "归口")
        if not command and not gate_ref:
            result.error(f"plan.md:{task.line}: 验证 requires '- 命令：' or '- 归口：'")
        if command and _placeholder(command):
            result.error(f"plan.md:{task.line}: Task command is a placeholder")
        if task.status == "AUTO_VERIFIED" and not command:
            result.error(f"plan.md:{task.line}: AUTO_VERIFIED Task requires a local command")
        if task.status == "GATE_VERIFIED":
            identifier = _gate_id(gate_ref)
            gate = next((item for item in model.gates if item.identifier == identifier), None)
            if not identifier:
                result.error(f"plan.md:{task.line}: GATE_VERIFIED Task requires '- 归口：Gate X'")
            elif gate is None or gate.status != "PASSED":
                result.error(f"plan.md:{task.line}: owning Gate {identifier} must be PASSED")
        if task.checked + task.unchecked == 0:
            result.error(f"plan.md:{task.line}: Task needs a checklist")
        if task.status in model.contract["task_terminal_statuses"] and task.unchecked:
            result.error(f"plan.md:{task.line}: terminal Task has unchecked steps")

    scheduled = {row.task for row in model.rows}
    for number in sorted(numbers - scheduled):
        result.error(f"Task {number} is missing from the scheduling table")
    for number in sorted(scheduled - numbers):
        result.error(f"scheduling table references missing Task {number}")

    fields, _ = parse_fields(model.strategy)
    capacity = _capacity(fields.get("执行能力", ""))
    if capacity is None or capacity <= 1:
        return
    graph = {row.task: row.dependencies for row in model.rows}
    if _cycle(graph):
        return
    depths = _depths(graph)
    task_map = {int(task.identifier): task for task in model.tasks}
    groups: dict[int, list[Row]] = defaultdict(list)
    for row in model.rows:
        groups[depths[row.task]].append(row)
    for group in groups.values():
        for i, left in enumerate(group):
            for right in group[i + 1 :]:
                left_task, right_task = task_map.get(left.task), task_map.get(right.task)
                if left_task is None or right_task is None:
                    continue
                if _scope_overlap(
                    left_task.child("约束", "写入范围"),
                    right_task.child("约束", "写入范围"),
                ):
                    result.error(f"Tasks {left.task}/{right.task} have overlapping write scopes")
                if _resource_overlap(
                    left.values.get("独占资源", ""), right.values.get("独占资源", "")
                ):
                    result.error(f"Tasks {left.task}/{right.task} share an exclusive resource")


def _validate_gates(model: Model, result: Result) -> None:
    if len(model.finals) != 1:
        result.error("plan.md must contain exactly one Final Gate")
    seen: set[str] = set()
    for gate in model.gates:
        if gate.identifier in seen:
            result.error(f"duplicate Gate identifier {gate.identifier}")
        seen.add(gate.identifier)
        _gate_fields(gate, model.contract["required_integration_gate_fields"], result)
        _verifier(gate, result)
        _command(gate, "验证命令", result)
        if gate.status == "PASSED":
            _gate_dependencies(gate, model, result)
    for gate in model.finals:
        _gate_fields(gate, model.contract["required_final_gate_fields"], result)
        _verifier(gate, result)
        _command(gate, "最终命令", result)
    _validate_verifier_identities(model, result)
    for gate in model.manuals:
        _gate_fields(gate, model.contract["required_manual_gate_fields"], result)
        executor = gate.value("执行者")
        if not executor or "Verifier Worker" in executor or "主 Agent" in executor:
            result.error(f"plan.md:{gate.line}: Manual Gate needs a human executor")


def _gate_fields(gate: Section, required: list[str], result: Result) -> None:
    for name in required:
        if not gate.has(name):
            result.error(f"plan.md:{gate.line}: {gate.identifier} is missing '- {name}：'")
    if gate.checked + gate.unchecked == 0:
        result.error(f"plan.md:{gate.line}: {gate.identifier} needs a checklist")
    if gate.status == "PASSED" and gate.unchecked:
        result.error(f"plan.md:{gate.line}: PASSED {gate.identifier} has unchecked steps")


def _verifier(gate: Section, result: Result) -> None:
    executor = gate.value("执行者")
    if not VERIFIER_IDENTITY.fullmatch(executor):
        result.error(
            f"plan.md:{gate.line}: {gate.identifier} executor must be "
            "'Verifier Worker X / Context Y'"
        )


def _validate_verifier_identities(model: Model, result: Result) -> None:
    workers: dict[str, str] = {}
    identities: dict[str, str] = {}
    for gate in [*model.gates, *model.finals]:
        identity = gate.value("执行者")
        match = VERIFIER_IDENTITY.fullmatch(identity)
        if not match:
            continue
        worker = match.group("worker")
        if worker in workers:
            result.error(
                f"plan.md:{gate.line}: {gate.identifier} reuses Verifier Worker "
                f"{worker} from {workers[worker]}"
            )
        else:
            workers[worker] = gate.identifier
        if identity in identities:
            result.error(
                f"plan.md:{gate.line}: {gate.identifier} reuses verification context "
                f"from {identities[identity]}"
            )
        else:
            identities[identity] = gate.identifier


def _command(gate: Section, name: str, result: Result) -> None:
    if _placeholder(gate.value(name)):
        result.error(f"plan.md:{gate.line}: {gate.identifier} {name} is a placeholder")


def _gate_dependencies(gate: Section, model: Model, result: Result) -> None:
    for number in map(int, re.findall(r"Task\s+(\d+)", gate.value("依赖"))):
        task = next((item for item in model.tasks if item.identifier == str(number)), None)
        if task is None or task.status not in {"CODE_DONE", *model.contract["task_terminal_statuses"]}:
            result.error(f"plan.md:{gate.line}: Gate {gate.identifier} has an unfinished Task {number}")
    for identifier in re.findall(r"Gate\s+([\w.-]+)", gate.value("依赖")):
        dependency = next((item for item in model.gates if item.identifier == identifier), None)
        if dependency is None or dependency.status != "PASSED":
            result.error(f"plan.md:{gate.line}: Gate {gate.identifier} depends on open Gate {identifier}")


def _validate_order(model: Model, result: Result) -> None:
    if not model.finals:
        return
    final = model.finals[0]
    if any(task.line > final.line for task in model.tasks):
        result.error("all Task cards must precede the Final Gate")
    if any(gate.line > final.line for gate in model.gates):
        result.error("all Integration Gates must precede the Final Gate")
    if any(gate.line < final.line for gate in model.manuals):
        result.error("Manual Gate must follow the Final Gate")
    if any(gate.status in {"RUNNING", "PASSED"} for gate in model.manuals) and final.status != "PASSED":
        result.error("Manual Gate cannot start before the Final Gate is PASSED")
    if final.status != "PASSED":
        return
    unfinished = [task.identifier for task in model.tasks if task.status not in model.contract["task_terminal_statuses"]]
    open_gates = [gate.identifier for gate in model.gates if gate.status != "PASSED"]
    if unfinished or open_gates:
        result.error("PASSED Final Gate has unfinished Tasks or Integration Gates")


def _validate_evidence(model: Model, result: Result) -> None:
    for task in model.tasks:
        if task.status not in {"CODE_DONE", *model.contract["task_terminal_statuses"]}:
            continue
        block = _latest(model.task_blocks, task.identifier)
        if block is None:
            result.error(f"progress.md: Task {task.identifier} [{task.status}] has no handoff block")
            continue
        if block.status != task.status:
            result.error(f"progress.md:{block.line}: Task {task.identifier} status mismatch")
        for name in model.contract["task_progress_required_fields"]:
            if not block.value(name):
                result.error(f"progress.md:{block.line}: Task {task.identifier} missing '- {name}：'")
        if task.status in model.contract["task_terminal_statuses"] and block.value("验证结果") in {
            "", "未验证", "失败", "未通过",
        }:
            result.error(f"progress.md:{block.line}: terminal Task {task.identifier} lacks verification")

    for gate in [*model.gates, *model.finals, *model.manuals]:
        if gate.status != "PASSED":
            continue
        block = _latest(model.gate_blocks, gate.identifier)
        label = _gate_label(gate.identifier)
        if block is None:
            result.error(f"progress.md: {label} [PASSED] has no evidence block")
            continue
        if block.status != "PASSED":
            result.error(f"progress.md:{block.line}: {label} status mismatch")
        if gate.value("执行者") and block.value("执行者") != gate.value("执行者"):
            result.error(f"progress.md:{block.line}: {label} evidence executor does not match plan")
        required = (
            model.contract["manual_gate_progress_required_fields"]
            if gate.kind == "manual"
            else model.contract["gate_progress_required_fields"]
        )
        for name in required:
            if not block.value(name):
                result.error(f"progress.md:{block.line}: {label} missing '- {name}：'")


def _validate_review(model: Model, required: bool, result: Result) -> None:
    if model.reviews and model.review_markers:
        result.error("progress.md mixes a review block with a skip/self-review marker")
    if required and not model.reviews and not model.review_markers:
        result.error("progress.md has no review record or explicit skip/self-review marker")
    for block in model.reviews:
        for name in model.contract["review_required_fields"]:
            if not block.value(name):
                result.error(f"progress.md:{block.line}: review missing '- {name}：'")
        conclusion, decision = block.value("Reviewer 结论"), block.value("用户决定")
        if conclusion and conclusion not in model.contract["reviewer_conclusions"]:
            result.error(f"progress.md:{block.line}: invalid Reviewer conclusion")
        if decision and decision not in model.contract["user_decisions"]:
            result.error(f"progress.md:{block.line}: invalid user decision")
        if (decision == "保持当前方案" or conclusion == "BLOCKED") and not block.value("保留"):
            result.error(f"progress.md:{block.line}: unresolved risk requires '- 保留：'")
        reviewer = block.value("评审者")
        if any(term in reviewer for term in ("主 Agent", "自查", "Self")):
            result.error(
                f"progress.md:{block.line}: self-review must use a marker, not a review block"
            )


def _capacity(value: str) -> int | None:
    match = re.search(r"最多并发(?:数)?\s*[：:]\s*(\d+)", value)
    return int(match.group(1)) if match else None


def _placeholder(value: str) -> bool:
    text = value.strip().lower()
    return text in PLACEHOLDERS or text.startswith("echo ")


def _gate_id(value: str) -> str:
    match = re.search(r"Gate\s+([\w.-]+)", value)
    return match.group(1) if match else ""


def _latest(blocks: list[Block], identifier: str) -> Block | None:
    matches = [block for block in blocks if block.identifier == identifier]
    return max(matches, key=lambda block: block.line) if matches else None


def _gate_label(identifier: str) -> str:
    return identifier if identifier in {"Final Gate", "Manual Gate"} else f"Gate {identifier}"


def _depths(graph: dict[int, set[int]]) -> dict[int, int]:
    memo: dict[int, int] = {}
    def depth(node: int) -> int:
        if node not in memo:
            deps = [dep for dep in graph[node] if dep in graph]
            memo[node] = 1 + max((depth(dep) for dep in deps), default=0)
        return memo[node]
    for node in graph:
        depth(node)
    return memo


def _cycle(graph: dict[int, set[int]]) -> list[int] | None:
    active: list[int] = []
    done: set[int] = set()
    def visit(node: int) -> list[int] | None:
        if node in active:
            return active[active.index(node) :] + [node]
        if node in done:
            return None
        active.append(node)
        for dependency in sorted(graph[node]):
            if dependency in graph and (found := visit(dependency)):
                return found
        active.pop()
        done.add(node)
        return None
    for node in sorted(graph):
        if found := visit(node):
            return found
    return None


def _items(value: str) -> list[str]:
    return [
        item.strip().strip("`").rstrip("/")
        for item in SEPARATORS.split(value)
        if item.strip() and item.strip() not in {"无", "不适用", "N/A", "n/a"}
    ]


def _scope_overlap(left: str, right: str) -> bool:
    for a in _items(left):
        for b in _items(right):
            if a == b or a.startswith(f"{b}/") or b.startswith(f"{a}/"):
                return True
            if any(char in a for char in "*?[") and fnmatch.fnmatch(b, a):
                return True
            if any(char in b for char in "*?[") and fnmatch.fnmatch(a, b):
                return True
    return False


def _resource_overlap(left: str, right: str) -> bool:
    for a in {item.casefold() for item in _items(left)}:
        for b in {item.casefold() for item in _items(right)}:
            if a == b or a.startswith(f"{b}:") or b.startswith(f"{a}:"):
                return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workflow_dir", type=Path)
    parser.add_argument("--schedule-only", action="store_true")
    parser.add_argument("--require-review-record", action="store_true")
    args = parser.parse_args()
    if args.schedule_only and args.require_review_record:
        print("ERROR: --schedule-only cannot be combined with --require-review-record")
        return 1
    contract = json.loads(CONTRACT_JSON.read_text(encoding="utf-8"))
    result = validate_model(
        parse_workflow(args.workflow_dir, contract),
        schedule_only=args.schedule_only,
        require_review_record=args.require_review_record,
    )
    for message in result.errors:
        print(f"ERROR: {message}")
    if result.errors:
        print(f"Validation failed with {len(result.errors)} error(s).")
        return 1
    print("Specs workflow validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
