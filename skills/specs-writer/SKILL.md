---
name: specs-writer
description: Turn agreed requirements into execution-ready design, plan, and progress specs with bounded Task contexts, dependency-aware scheduling, verification evidence, and role-scoped review.
---

# Specs Writer

在需求和关键取舍形成共识后，生成 `design.md`、`plan.md` 和 `progress.md`。本 Skill 只定义执行规格，不实现业务代码、不提交代码，也不代替用户确认需求或风险。

## 开始前

1. 读取适用项目规则（如 `AGENTS.md`），确认 specs 落盘目录和实际仓库拓扑。
2. 必读 [references/contract.md](references/contract.md)，按其固定结构和状态生成或校验文档。
3. 只读取当前需求相关的架构、源码入口和已有 specs，不遍历无关历史。
4. 需求目标、范围、关键取舍或验收方式尚未确认时，只列出待确认问题，不生成最终 `plan.md`。

## 核心流程

1. **复述共识**：锁定目标、非目标、可观察行为、契约、约束和验收边界。
2. **选择布局**：`decision-only` 只产出 `design.md`；需要执行时使用唯一的 `execution-plan`。
3. **先写 design**：记录现状事实、核心语义、接口和数据契约、权限或状态规则、兼容、风险与已确认决定。一个事实只写一处，不混入执行进度。
4. **冻结契约**：共享契约必须在消费者启动前冻结，状态写入 `design.md` 或契约 Task。默认使用临时过程契约，机器可读样本固定放 `docs/specs/<feature>/work/contracts/`；只有验收后仍被长期测试引用的 fixture 才放项目已有测试相关目录。契约不是执行依赖。
5. **划分 Task**：Task 是可独立派发、验收并记录证据的工作单元。从产出和当前消费者出发，而不是从文件或执行步骤出发。
6. **优先并行**：不同端、不同代码域或独立模块默认并行。只有必须消费另一 Task 的实际实现、运行时行为或生成产物时，才建立硬依赖。
7. **合并强相关 Task**：读取集、写入集或状态机高度重合，存在连续依赖，且没有中间外部消费者时，合并为一个 Task。
8. **冻结调度**：写紧凑调度表，记录范围、产出/消费者、硬依赖、契约和独占资源；写入范围与验证放回 Task。随后运行 `--schedule-only`。
9. **写 Task 和 Gate**：Task 使用 `### 目标`、`### 约束`、`### 内容`、`### 验证`、`### 交接`。Gate 写执行者、依赖、新增覆盖、命令和证据。
10. **记录证据**：Worker 只返回交接或写 `work/` 临时文件；主 Agent 独占 `plan.md`/`progress.md` 状态写入。完整日志留在 `work/`，`progress.md` 只记摘要。
11. **校验并评审**：运行完整 validator。高风险计划由独立只读 Reviewer 评审；低风险计划可自查。用户最终一次性确认方案、修改或保留风险。

## 调度与并行

并行只依赖客观条件：Task 依赖已满足、写入范围不冲突、独占资源不冲突、并发容量允许，并有可交接产出。

不同端或代码域不是依赖关系；同一契约是共同只读输入，不是硬依赖。硬依赖只用于下游必须消费上游实际产物或行为。容量不足只导致串行调度，不产生依赖边。

复杂计划（通常为 3 个以上 Task 或存在 Integration Gate）必须提供一张 Mermaid `flowchart LR`。调度表是事实来源，图只做投影；两者不一致时必须修正。

Integration Gate 可按独立跨边界验证面重复为 Gate A、Gate B、Gate C；Final Gate 必须依赖全部 Integration Gate。

## 执行上下文

多 Task 计划固定为“一 Task、一 Worker、一执行上下文”。主 Agent 只负责共识、设计取舍、契约冻结、派发、异常裁决、状态确认和最终验收，不连续实现多个 Task，也不吸收完整源码、完整日志或完整 diff。主 Agent 是 `plan.md`、`progress.md` 的唯一状态写入者。

Task Worker 只读取自己的 Task 卡、调度表对应行、指定 design 章节、依赖 progress 和源码入口。Worker 只返回结构化交接或写 `work/handoffs/`，不得修改 `plan.md`、`progress.md`。`日志边界` 只写允许行为，`禁止回传` 明确列出完整源码、完整对话、完整日志和完整 diff。

没有子代理能力时，多 Task 必须每完成一个 Task 后切换新会话或新上下文；运行环境无法切换时，完成当前 Task 后停止并请用户继续，不得在同一长上下文中连续执行。

Integration Gate 和 Final Gate 使用各自独立的 Verifier Worker/上下文，不继承实现历史。Verifier 不改业务代码、`design.md` 或 `plan.md`，只产出证据和结论；主 Agent 核对证据新鲜度、范围和状态后更新 `plan.md`。

## Review 边界

- 高风险、公共契约、迁移、权限、安全、多仓库或高风险并行计划：使用独立只读 Reviewer。
- 低风险单域计划：主 Agent 自查，可使用 validator 和证据核对；不得表述为独立评审。
- Reviewer 只报告问题、证据、影响和建议，不直接修改 Spec。
- 主 Agent 核对并决定采纳、拒绝或保留风险，修改后重新运行 validator。
- 核心需求、共享契约、安全边界或任务图被实质修改时，重新发起独立 review。

## 自检

- 需求未共识时没有生成最终 plan。
- 所有 Task 都出现在调度表中，依赖无缺失、无环。
- 并行 Task 的写集、资源和容量没有冲突。
- 多 Task 计划明确“一 Task 一 Worker/上下文”，且主 Agent 不连续实现。
- 每个 Task 有有界必读、产出契约、验证信号或 Gate 归口。
- 每个终态 Task 和 `PASSED` Gate 都有匹配的 progress 证据。
- 恰好一个 Final Gate，且只在全部 Task 和 Integration Gate 完成后通过。
- 自动化验证没有被表述为人工验收。
- 复杂计划有带执行主体的 Mermaid 图。
- 不同端 Task 未被共享契约或“同一功能”人为串行化。
- 终态 spec 目录只保留三个 md；长期 fixture 已进入测试代码，临时文件已清理。
- 临时过程契约位于 `work/contracts/`，已声明消费者和清理时机；长期测试未引用 `work/`。

## 产物边界

- `design.md`、`plan.md`、`progress.md` 是唯一长期 spec 产物。
- 执行期临时脚本、日志、handoff 和契约放 `docs/specs/<feature>/work/`，不提交，全部验收后删除。
- 临时过程契约默认放 `docs/specs/<feature>/work/contracts/`，由主 Agent 在派发前冻结；消费者只读，正式测试不得通过源码路径、环境变量或 Bundle 依赖它。
- 被测试长期引用的 fixture、schema 或 golden data 才进入项目已有测试支持目录，并列入产生该产物的 Task 写入范围。该目录不存在时，先询问用户，不得自行新增仓库级目录。

## 参考资源

- 固定结构、状态、证据和 review 生命周期：[references/contract.md](references/contract.md)
- 文档骨架和 Mermaid 示例：[references/templates.md](references/templates.md)
- 独立评审输入、维度和输出：[references/reviewer.md](references/reviewer.md)

```bash
python3 scripts/validate_specs.py <workflow-directory>
python3 scripts/validate_specs.py --schedule-only <workflow-directory>
python3 scripts/validate_specs.py --require-review-record <workflow-directory>
```
