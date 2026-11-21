# Specs Workflow Contract

本文件是固定结构、状态、证据和 review 的唯一人类可读契约。机器字段来自 `scripts/specs_contract.json`；`GENERATED` 区由 `render_contract.py` 生成。

## 1. 交付布局

- `decision-only`：只产出 `design.md`，至少包含一个 `## ` 章节。
- `execution-plan`：产出 `design.md`、`plan.md`、`progress.md`。单 Task 和 多 Task 共用这一布局；仓库或端数量不改变文件名。

长期 spec 目录只保留三个 md。执行期脚本、日志、handoff 和契约放 `docs/specs/<feature>/work/`，全部验收后删除。

契约产物按生命周期分两类：

| 类型 | 默认位置 | 约束 |
| --- | --- | --- |
| 临时过程契约 | `docs/specs/<feature>/work/contracts/` | 主 Agent 在消费者启动前冻结；Worker 只读；正式测试不得依赖该路径；全部验收后随 `work/` 删除 |
| 长期测试 fixture | 项目已有测试支持目录 | 只用于验收后仍被长期测试引用的 fixture/schema/golden data；必须列入产生它的 Task 写入范围；不得依赖 specs 路径 |

默认使用临时过程契约。项目不存在合适的长期测试支持目录时，停止并向用户确认，不得自行创建新的仓库级共享目录。契约的语义定义写在 design；机器可读样本是 fixture，不应把 fixture 本身当作语义契约的唯一来源。

## 2. plan.md

<!-- BEGIN GENERATED: plan_structure -->
`plan.md` 必须包含且仅包含一个以下二级章节：

```text
## 任务执行与并行策略
```

必须包含非空字段：`编排目标`、`执行能力`、`主代理边界`、`Worker 输入`、`Worker 回传`、`日志边界`、`禁止回传`、`契约冻结`、`契约产物`、`Gate 策略`。

随后必须包含唯一的 `### 调度编排分析表`，表头精确为：

```text
| Task | 范围 | 产出/消费者 | 硬依赖 | 契约 | 独占资源 |
```

每个 Task 卡必须包含非空子章节：`目标`、`约束`、`内容`、`验证`、`交接`；`### 约束` 必须包含：`必读`、`写入范围`、`禁止修改`。
<!-- END GENERATED: plan_structure -->

调度表是范围、产出/消费者、硬依赖、契约和独占资源的唯一事实来源。Task 卡的 `### 约束` 写写入范围，`### 验证` 写验证信号。

硬依赖只表达真实实现前置条件：下游必须消费上游实际代码、运行时行为或生成产物。不同端/代码域不是依赖；共享契约是共同只读输入，不是依赖。容量不足只导致串行调度，不产生依赖边。必须依赖验证结论时，写明 Task 终态或 Gate。

共享契约在消费者启动前冻结，写明 ID、定义位置和消费者。`契约产物` 必须写明类型、路径、消费者和清理时机；没有共享或过程契约时写 `无`。临时契约声明 `临时过程契约`，路径必须位于当前 spec 的 `work/contracts/`；长期 fixture 声明 `长期测试 fixture`，由产生它的 Task 负责落盘。契约变化必须重新验证所有消费者。写入范围用分号分隔，可写目录、文件或 glob；只写计划修改的路径。独占资源写数据库、模拟器、构建目录、端口等不可共享资源。

## 3. 执行上下文

单 Task 可以由主 Agent 执行，Final Gate 仍优先使用独立 Verifier 上下文。多 Task 固定为：

```text
Task 1 → Worker A / 上下文 A
Task 2 → Worker B / 上下文 B
```

多 Task 的执行能力必须包含 `每个 Task 使用独立 Worker/上下文`；主代理边界必须包含 `仅编排、派发和验收；主 Agent 不实现 Task`。主 Agent 是 `plan.md`、`progress.md` 的唯一状态写入者。

Worker 输入必须完整包含：Task 卡、调度表对应行、design 指定章节、依赖 progress、源码入口。回传必须完整包含：状态、产出契约、改动文件、验证结论、证据路径、下游可依赖、下游不可假设、风险。Worker 不写 `plan.md`/`progress.md`；只返回交接或写 `work/handoffs/`。完整日志写 `work/evidence/`，主 Agent 只接收摘要和路径。`禁止回传` 明确列出完整源码、完整对话、完整日志和完整 diff。

强相关 Task 在读取集、写入集或状态机高度重合，存在连续依赖且无中间外部消费者时合并。需要提前解锁下游、独立验证/回滚/验收、不同资源边界，或合并后明显过大时保留独立 Task。

没有子代理能力时，每完成一个 Task 后由主 Agent 写 progress，再切换新会话/上下文；无法切换时停止并请用户继续。

## 4. Task、Gate 与状态

```text
## Task 1: <可独立验收的产出> [TODO]
## Gate A: <跨边界验证> [TODO]
## Final Gate: 自动验证收口 [TODO]
## Manual Gate: <人工验收范围> [TODO]
```

Task 卡固定使用 `### 目标`、`### 约束`、`### 内容`、`### 验证`、`### 交接`。`内容` 放 checklist；`验证` 放 `新增信号` 与 `命令` 或 `归口`。

Task 状态：
<!-- BEGIN GENERATED: task_statuses -->
`TODO`：尚未开始；`RUNNING`：执行中；`CODE_DONE`：实现完成且产出契约已记录，可解锁只依赖该契约的下游；验证尚未完成；`AUTO_VERIFIED`：Task 局部验证通过，且 progress 中有命令、结果和证据；`GATE_VERIFIED`：Task 验证由已 PASSED 的指定 Gate 完成，且有 progress 证据；`BLOCKED`：存在明确外部阻塞
<!-- END GENERATED: task_statuses -->

Gate 状态：
<!-- BEGIN GENERATED: gate_statuses -->
`TODO`：尚未开始；`RUNNING`：验证中；`PASSED`：验证通过并形成可交接结论；`FAILED`：验证失败，需要修复后重跑；`BLOCKED`：存在明确外部阻塞
<!-- END GENERATED: gate_statuses -->

`AUTO_VERIFIED` 和 `GATE_VERIFIED` 是 Task 终态；`CODE_DONE` 可交接但未完成验证。终态 Task 和所有 `PASSED` Gate 的 checklist 必须全部勾选。`GATE_VERIFIED` Task 必须有 `归口：Gate X` 且该 Gate 已 `PASSED`；`AUTO_VERIFIED` 必须有真实局部命令。`true`、`echo`、`exit 0` 等占位命令无效。

`plan.md` 恰好有一个 Final Gate，且它只能在全部 Task 为终态、全部 Integration Gate 为 `PASSED` 时通过。每个 Integration Gate 和 Final Gate 的执行者必须写成唯一的 `Verifier Worker X / Context Y`，不能与其他 Gate 复用同一执行身份，也不能由被验证 Task 的 Worker 执行。Manual Gate 位于 Final Gate 后，执行者必须是真实人工角色。

复杂计划（3 个以上 Task 或存在 Integration Gate）必须有一张 Mermaid `flowchart LR`。调度表是事实来源；图中每个节点必须标记 Task Worker、Verifier Worker 或人工执行者。Validator 只检查图是否存在，节点一致性由 Reviewer 检查。

## 5. progress.md

进入 `CODE_DONE`、`AUTO_VERIFIED` 或 `GATE_VERIFIED` 的 Task 必须有：

```text
### Task N — [STATUS]
```

并包含：
<!-- BEGIN GENERATED: task_progress_fields -->
`产出契约`、`改动文件`、`验证命令`、`验证结果`、`证据摘要`、`下游可依赖`、`下游不可假设`、`风险或阻塞`
<!-- END GENERATED: task_progress_fields -->

每个 `PASSED` Gate 必须有：

```text
### Gate X — [PASSED]
```

并包含：
<!-- BEGIN GENERATED: gate_progress_fields -->
`执行者`、`新增覆盖`、`命令`、`结果`、`证据`、`结论`、`主 Agent 确认`
<!-- END GENERATED: gate_progress_fields -->

每个 `PASSED` Manual Gate 必须有：

```text
### Manual Gate — [PASSED]
```

并包含：
<!-- BEGIN GENERATED: manual_gate_progress_fields -->
`执行者`、`人工验收范围`、`人工验收结果`、`证据`、`结论`、`人工决定`
<!-- END GENERATED: manual_gate_progress_fields -->

完整日志放 `work/evidence/`；`progress.md` 记录命令、结果和证据摘要，不依赖临时文件永久存在。自动化验证通过不等于人工验收通过。

## 6. Review

高风险计划使用独立只读 Reviewer；低风险计划可由主 Agent 自查。Reviewer 只报告问题、证据、影响和最小修改建议，不修改 spec。只有独立 Reviewer 可以创建 `### 方案review` 块；主 Agent 自查只能使用 marker，不能填写 `评审者` 或 `Reviewer 结论`。

Reviewer 结论：
<!-- BEGIN GENERATED: reviewer_conclusions -->
`PASS`、`CHANGES_REQUIRED`、`BLOCKED`
<!-- END GENERATED: reviewer_conclusions -->
用户决定：
<!-- BEGIN GENERATED: user_decisions -->
`确认`、`保持当前方案`、`输入意见`
<!-- END GENERATED: user_decisions -->
`### 方案review — YYYY-MM-DD` 必须包含：
<!-- BEGIN GENERATED: review_record_fields -->
`评审者`、`风险级别`、`Reviewer 结论`、`主 Agent 处理`、`用户决定`、`复验`
<!-- END GENERATED: review_record_fields -->
未选用独立 Reviewer 时只记录以下之一，不得伪造独立结论：
```text
- 方案review：用户跳过
- 方案review：未触发独立评审（低风险自查）
```

存在 P1，或修改实质改变需求、共享契约、安全边界或任务图时重新评审。修改后重新运行 validator，交付前运行 `--require-review-record`。

## 7. 维护

固定状态、字段、表头和 review 结论只改 `scripts/specs_contract.json`，运行 `python3 scripts/render_contract.py`，再用 `--check` 验证。语义规则只改本文件，实现规则只改 `scripts/validate_specs.py`，行为测试只改测试文件。
