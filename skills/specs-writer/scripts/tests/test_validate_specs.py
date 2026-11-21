#!/usr/bin/env python3
"""Behavior and invariant tests for the specs validator."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
SKILL_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from validate_specs import (  # noqa: E402
    parse_workflow,
    validate_model,
)


def single_plan() -> str:
    return textwrap.dedent(
        """\
        # Fixture

        ## 任务执行与并行策略

        - 编排目标：完成局部行为修复
        - 执行能力：最多并发：1；单 Task 由主 Agent 执行；Final Gate 使用独立 Verifier 上下文
        - 主代理边界：主 Agent 负责设计、派发和验收
        - Worker 输入：Task 卡；调度表对应行；design 指定章节；依赖 progress；源码入口
        - Worker 回传：状态；产出契约；改动文件；验证结论；证据路径；下游可依赖；下游不可假设；风险
        - 日志边界：完整日志写入证据文件；主 Agent 只读摘要和路径，不接收完整源码或完整 diff
        - 禁止回传：完整源码；完整对话；完整日志；完整 diff
        - 契约冻结：无
        - 契约产物：无
        - Gate 策略：Final Gate 统一自动收口

        ### 调度编排分析表

        | Task | 范围 | 产出/消费者 | 硬依赖 | 契约 | 独占资源 |
        |---|---|---|---|---|---|
        | Task 1 | 后端 | 修复后的行为 / Final Gate | 无 | 无 | 无 |

        ## Task 1: 修复行为 [AUTO_VERIFIED]

        ### 目标

        重试次数上限为 3。

        ### 约束

        - 必读：design §1；src/service.ts
        - 写入范围：src/service.ts
        - 禁止修改：其他模块

        ### 内容

        - [x] 实现修复

        ### 验证

        - 新增信号：新增边界测试
        - 命令：python3 -m unittest tests.service

        ### 交接

        按 progress 记录证据和下游依赖。

        ## Final Gate: 自动验证收口 [PASSED]

        - 执行者：Verifier Worker F / Context F1
        - 依赖：Task 1
        - 收口范围：行为、证据和验证后变更
        - 最终命令：python3 -m unittest
        - 证据：evidence/final.log
        - [x] 核对最终结果
        """
    )


def multi_plan() -> str:
    return textwrap.dedent(
        """\
        # Fixture

        ## 任务执行与并行策略

        - 编排目标：冻结 C1 后并行完成后端和 iOS
        - 执行能力：最多并发：2；每个 Task 使用独立 Worker/上下文
        - 主代理边界：仅编排、派发和验收；主 Agent 不实现 Task
        - Worker 输入：Task 卡；调度表对应行；design 指定章节；依赖 progress；源码入口
        - Worker 回传：状态；产出契约；改动文件；验证结论；证据路径；下游可依赖；下游不可假设；风险
        - 日志边界：完整日志写入证据文件；主 Agent 只读结果和路径摘要
        - 禁止回传：完整源码；完整对话；完整日志；完整 diff
        - 契约冻结：C1 见 design §2，已冻结；Task 1、Task 2 只读消费
        - 契约产物：C1（临时过程契约）：docs/specs/order/work/contracts/c1.json；Task 1、Task 2；全部验收后随 work/ 删除
        - Gate 策略：Gate A 和 Final Gate 使用独立 Verifier

        ### 调度编排分析表

        | Task | 范围 | 产出/消费者 | 硬依赖 | 契约 | 独占资源 |
        |---|---|---|---|---|---|
        | Task 1 | 后端 | 服务端行为 / Gate A、Task 3 | 无 | C1 | PostgreSQL |
        | Task 2 | iOS | 客户端行为 / Gate A、Task 3 | 无 | C1 | Xcode 模拟器 |
        | Task 3 | 文档 | 权威文档 / Final Gate | Task 1、Task 2 `AUTO_VERIFIED` | C1 | 无 |

        ```mermaid
        flowchart LR
            T1["Task 1<br/>Worker A<br/>后端"]
            T2["Task 2<br/>Worker B<br/>iOS"]
            T3["Task 3<br/>Worker C<br/>文档"]
            G1(["Gate A<br/>Verifier Worker D / Context G1"])
            F(["Final Gate<br/>Verifier Worker E / Context F1"])
            T2 --> G1
            T1 --> G1
            T1 --> T3
            T2 --> T3
            T3 --> G1
            G1 --> F
        ```

        ## Task 1: 实现服务端 [AUTO_VERIFIED]

        ### 目标

        服务端接受 C1。

        ### 约束

        - 必读：design §2；C1 fixture
        - 写入范围：server/order.ts
        - 禁止修改：web/order.ts

        ### 内容

        - [x] 实现服务端

        ### 验证

        - 新增信号：实际响应符合 C1
        - 命令：python3 -m unittest tests.server

        ### 交接

        记录服务端行为。

        ## Task 2: 实现客户端 [AUTO_VERIFIED]

        ### 目标

        客户端消费 C1。

        ### 约束

        - 必读：design §2；C1 fixture
        - 写入范围：web/order.ts
        - 禁止修改：server/order.ts

        ### 内容

        - [x] 实现客户端

        ### 验证

        - 新增信号：同一 fixture 解码
        - 命令：python3 -m unittest tests.web

        ### 交接

        记录客户端行为。

        ## Task 3: 同步文档 [AUTO_VERIFIED]

        ### 目标

        文档与最终实现一致。

        ### 约束

        - 必读：progress Task 1、Task 2
        - 写入范围：docs/order.md
        - 禁止修改：server/order.ts；web/order.ts

        ### 内容

        - [x] 同步文档

        ### 验证

        - 新增信号：字段和路由与实现一致
        - 命令：rg -n 'OrderEnvelope' docs/order.md server/order.ts web/order.ts

        ### 交接

        记录最终文档状态。

        ## Gate A: 跨端集成 [PASSED]

        - 执行者：Verifier Worker D / Context G1
        - 依赖：Task 2、Task 3
        - 新增覆盖：客户端到服务端的 OrderEnvelope 拼接
        - 验证命令：python3 -m unittest tests.integration
        - 证据：evidence/gate-a.log
        - [x] 验证跨端行为

        ## Final Gate: 自动验证收口 [PASSED]

        - 执行者：Verifier Worker E / Context F1
        - 依赖：Task 1、Task 2、Task 3、Gate A
        - 收口范围：全部验收项、证据和验证后变更
        - 最终命令：python3 -m unittest
        - 证据：evidence/final.log
        - [x] 核对最终结果
        """
    )


def progress(*, task_numbers: list[int], include_gate: bool, include_final: bool) -> str:
    blocks = ["# Fixture Progress\n\n## 2026-11-21\n"]
    for number in task_numbers:
        blocks.append(
            textwrap.dedent(
                f"""\
                ### Task {number} — [AUTO_VERIFIED]

                - 产出契约：Task {number} contract
                - 改动文件：src/task-{number}.ts
                - 验证命令：python3 -m unittest tests.task_{number}
                - 验证结果：通过
                - 证据摘要：Task {number} verified; work/evidence/task-{number}.log
                - 下游可依赖：Task {number} contract
                - 下游不可假设：未记录的实现细节
                - 风险或阻塞：无
                """
            )
        )
    if include_gate:
        blocks.append(
            textwrap.dedent(
                """\
                ### Gate A — [PASSED]

                - 执行者：Verifier Worker D / Context G1
                - 新增覆盖：跨端拼接
                - 命令：python3 -m unittest tests.integration
                - 结果：通过
                - 证据：Gate A passed; work/evidence/gate-a.log
                - 结论：跨端行为成立
                - 主 Agent 确认：已核对
                """
            )
        )
    if include_final:
        final_worker = "E" if include_gate else "F"
        blocks.append(
            textwrap.dedent(
                f"""\
                ### Final Gate — [PASSED]

                - 执行者：Verifier Worker {final_worker} / Context F1
                - 新增覆盖：最终证据完整性
                - 命令：python3 -m unittest
                - 结果：通过
                - 证据：Final Gate passed; work/evidence/final.log
                - 结论：全部自动验收项通过
                - 主 Agent 确认：已核对
                """
            )
        )
    blocks.append("- 方案review：未触发独立评审（低风险自查）\n")
    return "\n".join(blocks)


def write_workflow(directory: Path, plan: str, progress_text: str) -> None:
    (directory / "design.md").write_text(
        "# Fixture\n\n## 1. 目标\n\n验证行为。\n", encoding="utf-8"
    )
    (directory / "plan.md").write_text(plan, encoding="utf-8")
    (directory / "progress.md").write_text(progress_text, encoding="utf-8")


class ValidatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads(
            (SCRIPT_DIR / "specs_contract.json").read_text(encoding="utf-8")
        )

    def validate(self, directory: Path, **kwargs):
        return validate_model(parse_workflow(directory, self.contract), **kwargs)

    def test_single_task_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            write_workflow(
                directory,
                single_plan(),
                progress(task_numbers=[1], include_gate=False, include_final=True),
            )
            self.assertEqual([], self.validate(directory).errors)

    def test_decision_only_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / "design.md").write_text(
                "# Decision\n\n## 1. 目标\n\n只做决策。\n", encoding="utf-8"
            )
            self.assertEqual([], self.validate(directory, require_review_record=True).errors)

    def test_multi_task_plan_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            write_workflow(
                directory,
                multi_plan(),
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertEqual([], self.validate(directory, require_review_record=True).errors)

    def test_gates_cannot_reuse_verifier_worker(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "Verifier Worker E / Context F1",
                "Verifier Worker D / Context F1",
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertTrue(
                any("reuses Verifier Worker D" in item
                    for item in self.validate(directory).errors)
            )

    def test_worker_handoff_requires_complete_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "Task 卡；调度表对应行；design 指定章节；依赖 progress；源码入口",
                "Task 卡；design 章节",
            ).replace(
                "状态；产出契约；改动文件；验证结论；证据路径；下游可依赖；下游不可假设；风险",
                "产出契约；验证结论",
            ).replace(
                "完整日志写入证据文件；主 Agent 只读结果和路径摘要",
                "日志；路径",
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            errors = self.validate(directory).errors
            self.assertTrue(any("Worker 输入' is missing" in item for item in errors))
            self.assertTrue(any("Worker 回传' is missing" in item for item in errors))
            self.assertTrue(any("日志边界' is missing" in item for item in errors))

    def test_negative_context_restriction_is_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "主 Agent 只读结果和路径摘要",
                "主 Agent 只读结果和路径摘要，不接收完整源码或完整 diff",
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertEqual([], self.validate(directory).errors)

    def test_positive_full_context_return_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "- 禁止回传：完整源码；完整对话；完整日志；完整 diff",
                "- 禁止回传：允许回传完整源码、完整对话、完整日志和完整 diff",
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertTrue(
                any("must not permit sending full context back" in item
                    for item in self.validate(directory).errors)
            )

    def test_multi_task_requires_worker_context_marker(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "每个 Task 使用独立 Worker/上下文", "共享 Worker", 1
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            errors = self.validate(directory).errors
            self.assertTrue(any("独立 Worker/上下文" in item for item in errors))

    def test_multi_task_rejects_main_agent_implementation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "仅编排、派发和验收；主 Agent 不实现 Task",
                "主 Agent 连续执行全部 Task",
                1,
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertTrue(
                any("prohibit the main agent" in item for item in self.validate(directory).errors)
            )

    def test_dependency_cycle_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "| Task 2 | iOS | 客户端行为 / Gate A、Task 3 | 无 | C1 | Xcode 模拟器 |",
                "| Task 2 | iOS | 客户端行为 / Gate A、Task 3 | Task 3 `AUTO_VERIFIED` | C1 | Xcode 模拟器 |",
            ).replace(
                "| Task 3 | 文档 | 权威文档 / Final Gate | Task 1、Task 2 `AUTO_VERIFIED` | C1 | 无 |",
                "| Task 3 | 文档 | 权威文档 / Final Gate | Task 2 `AUTO_VERIFIED` | C1 | 无 |",
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertTrue(
                any("cycle" in item for item in self.validate(directory).errors)
            )

    def test_capacity_one_does_not_require_fake_dependency(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace("最多并发：2", "最多并发：1")
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertEqual([], self.validate(directory).errors)

    def test_consumed_contract_must_be_frozen(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "- 契约冻结：C1 见 design §2，已冻结；Task 1、Task 2 只读消费",
                "- 契约冻结：C2",
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            errors = self.validate(directory).errors
            self.assertTrue(any("not declared in 契约冻结" in item for item in errors))
            self.assertTrue(any("已冻结" in item for item in errors))

    def test_temporary_contract_must_stay_in_work(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "docs/specs/order/work/contracts/c1.json",
                "test-support/contracts/c1.json",
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            errors = self.validate(directory).errors
            self.assertTrue(
                any("path must stay under work/contracts/" in item for item in errors)
            )
            self.assertTrue(
                any("must not be placed in a project test-support" in item for item in errors)
            )

    def test_temporary_contract_must_declare_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace("；全部验收后随 work/ 删除", "")
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertTrue(
                any("must declare its cleanup" in item for item in self.validate(directory).errors)
            )

    def test_parallel_conflicts_are_checked(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "- 写入范围：web/order.ts",
                "- 写入范围：server/order.ts",
            ).replace("| Xcode 模拟器 |", "| PostgreSQL |")
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            errors = self.validate(directory).errors
            self.assertTrue(any("overlapping write scopes" in item for item in errors))
            self.assertTrue(any("exclusive resource" in item for item in errors))

    def test_gate_requires_verifier_executor(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace(
                "- 执行者：Verifier Worker D / Context G1\n",
                "- 执行者：Task 2 Worker\n",
                1,
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertTrue(
                any("Verifier Worker X / Context Y" in item
                    for item in self.validate(directory).errors)
            )

    def test_passed_gate_requires_progress_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            evidence = progress(
                task_numbers=[1, 2, 3], include_gate=False, include_final=True
            )
            write_workflow(directory, multi_plan(), evidence)
            self.assertTrue(
                any("Gate A [PASSED] has no evidence block" in item
                    for item in self.validate(directory).errors)
            )

    def test_final_gate_requires_terminal_tasks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = single_plan().replace(
                "## Task 1: 修复行为 [AUTO_VERIFIED]",
                "## Task 1: 修复行为 [TODO]",
            ).replace("- [x] 实现修复", "- [ ] 实现修复")
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1], include_gate=False, include_final=True),
            )
            self.assertTrue(
                any("unfinished Tasks" in item for item in self.validate(directory).errors)
            )

    def test_complex_plan_requires_mermaid(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan()
            start = plan.index("```mermaid")
            end = plan.index("```", start + 3) + 3
            plan = plan[:start] + plan[end:]
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertTrue(
                any("Mermaid" in item for item in self.validate(directory).errors)
            )

    def test_mermaid_must_use_lr(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = multi_plan().replace("flowchart LR", "flowchart TD", 1)
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1, 2, 3], include_gate=True, include_final=True),
            )
            self.assertTrue(
                any("Mermaid flowchart LR" in item
                    for item in self.validate(directory).errors)
            )

    def test_manual_gate_uses_human_evidence_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = single_plan() + textwrap.dedent(
                """\

                ## Manual Gate: 产品体验验收 [PASSED]

                - 执行者：用户
                - 依赖：Final Gate `PASSED`
                - [x] 完成产品体验验收
                """
            )
            evidence = progress(
                task_numbers=[1], include_gate=False, include_final=True
            ) + textwrap.dedent(
                """\

                ### Manual Gate — [PASSED]

                - 执行者：用户
                - 人工验收范围：产品观感和真实设备体验
                - 人工验收结果：通过
                - 证据：evidence/manual-acceptance.md
                - 结论：用户可以接受
                - 人工决定：确认
                """
            )
            write_workflow(directory, plan, evidence)
            self.assertEqual([], self.validate(directory).errors)

    def test_placeholder_command_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = single_plan().replace(
                "命令：python3 -m unittest tests.service", "命令：true"
            )
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1], include_gate=False, include_final=True),
            )
            self.assertTrue(
                any("placeholder" in item for item in self.validate(directory).errors)
            )

    def test_task_requires_subsections_and_constraints(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            plan = single_plan().replace("### 交接\n", "")
            write_workflow(
                directory,
                plan,
                progress(task_numbers=[1], include_gate=False, include_final=True),
            )
            errors = self.validate(directory).errors
            self.assertTrue(any("missing non-empty '### 交接'" in item for item in errors))

    def test_schedule_only_does_not_require_cards_or_progress(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            schedule = multi_plan().split("## Task 1:", 1)[0]
            (directory / "design.md").write_text(
                "# Fixture\n\n## 1. 目标\n\n验证。\n", encoding="utf-8"
            )
            (directory / "plan.md").write_text(schedule, encoding="utf-8")
            self.assertEqual([], self.validate(directory, schedule_only=True).errors)

    def test_legacy_plan_is_rejected_with_migration_message(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            legacy = single_plan().replace(
                "| Task | 范围 | 产出/消费者 | 硬依赖 | 契约 | 独占资源 |",
                "| Task | 代码域/变更面 | 产出摘要/消费者 | 依赖/开始条件 | 写入范围 | 独占资源 | 规模 | AI 预估(min) | 波次 | 关键路径 |",
            )
            write_workflow(
                directory,
                legacy,
                progress(task_numbers=[1], include_gate=False, include_final=True),
            )
            self.assertTrue(
                any("legacy plan format" in item for item in self.validate(directory).errors)
            )

    def test_high_risk_review_cannot_be_self_review(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            evidence = progress(
                task_numbers=[1], include_gate=False, include_final=True
            ).replace(
                "- 方案review：未触发独立评审（低风险自查）",
                textwrap.dedent(
                    """\
                    ### 方案review — 2026-11-21

                    - 评审者：主 Agent（自查）
                    - 风险级别：高
                    - Reviewer 结论：PASS
                    - 主 Agent 处理：采纳
                    - 用户决定：确认
                    - 复验：validator passed
                    """
                ),
            )
            write_workflow(directory, single_plan(), evidence)
            self.assertTrue(
                any("self-review must use a marker" in item
                    for item in self.validate(directory, require_review_record=True).errors)
            )

    def test_cli_enforces_review_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            evidence = progress(
                task_numbers=[1], include_gate=False, include_final=True
            ).replace("- 方案review：未触发独立评审（低风险自查）\n", "")
            write_workflow(directory, single_plan(), evidence)
            completed = subprocess.run(
                [sys.executable, str(SCRIPT_DIR / "validate_specs.py"),
                 "--require-review-record", str(directory)],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(1, completed.returncode)
            self.assertIn("no review record", completed.stdout)


if __name__ == "__main__":
    unittest.main()
