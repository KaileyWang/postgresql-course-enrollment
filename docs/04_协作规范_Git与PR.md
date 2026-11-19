# 协作规范：Git / 分支 / PR

> 三周的课设，真正拖垮团队的不是技术，是"最后两天合并一团乱"。本规范从第一天执行，组长负责守门。

## 1. 分支模型（trunk-based，简化版）

```
main       ← 永远可运行（能起 docker compose、能跑冒烟）
 └─ feat/xxx ← 每功能一分支，生命周期 ≤ 2 天
 └─ exp/xxx  ← 实验分支（压测、隔离级别），允许脏，不 merge，只出报告数据
 └─ fix/xxx  ← 修 bug
 └─ docs/xxx ← 文档
```

不设 `develop` 分支（五人三周，多一层分支只增加合并成本）。

**main 保护**：禁直推（可在本地 git hook 或托管平台设置）；PR 合入前必须 CI 绿 + 1 个 review。

## 2. 分支命名

`feat/enroll-v3-atomic`、`fix/waitlist-position-unique`、`exp/isolation-repeatable-read`、`docs/api-contract-v2`。

一个 PR 只做一件事。**不允许** `feat/all-monkey-work` 这种。

## 3. 提交信息（Conventional Commits）

```
feat(enroll): 实现 V3 原子条件更新
fix(waitlist): 晋升时 position 唯一冲突
perf(sections): 增加 term+dept 组合索引
docs(api): 补 202 waitlist 响应体
chore(bench): 增加 200 并发档位
```

前缀：`feat|fix|perf|refactor|test|docs|chore|exp`。正文可中文。**压测相关 commit 必须带 commit hash 进报告附录**，保证"报告数据 ↔ 代码版本"可对齐。

## 4. PR 规范

### 模板（仓库 `.github/pull_request_template.md`）

```markdown
## 做了什么
- （一句话）

## 怎么验的
- [ ] 本地 `pytest tests/ -x`
- [ ] `test_concurrency.py` 全绿（改了 enrollment 必勾）
- [ ] 手动路径：（列出点过哪些页面）

## 风险
- 锁顺序/事务边界有变化吗：是/否
- 改了 02 文档吗：是（附链接）/否
```

### 合入条件

1. CI 绿（至少：单元测试 + 并发测试 + 前端 build）；
2. 1 个 review approve（A/B 相关目录另需对方 review）；
3. 分支与 main 无冲突（rebase，不 merge main 进分支，保持线性）；
4. PR 描述按模板填完。

### 禁止事项

- 禁止把 `bench/results` 之外的二进制/大数据提交进 git（`.gitignore` 已配）；
- 禁止在 `services/enrollment/` 引入第二个"锁对象"而不在 PR 里说明锁顺序；
- 禁止直接改 02 文档却不同步 `schemas/`；
- 禁止 force push 已 review 中的分支。

## 5. Code Review 检查单（复制到每次 review）

- [ ] **锁顺序**：sections 先于 enrollments？有无新加锁？
- [ ] **计数与记录**：所有改动 `enrolled_count` 的路径，是否与 `enrollments` 同事务？
- [ ] **错误码**：是否与 `02_接口设计.md` 一致？新增错误码是否更新文档？
- [ ] **候选队列**：退课路径是否包含晋升？晋升失败是否整体回滚？
- [ ] **前端**：三态（201/202/错误）是否都处理？可选判空？
- [ ] **测试**：改过并发相关代码是否附带测试？

## 6. 每日节奏

- **10:00 站会（10 分钟）**：我昨天合并了什么 / 今天打算合并什么 / 卡在哪；
- **18:00 前**：有风险的分支先在 PR 里发草稿（Draft PR），让大家看见进度；
- **每周日晚**：组长跑一遍 `main` 的冒烟，确认"周一能演示"。

## 7. 目录级 Owner（同 03 文档第 2 节）

CODEOWNERS（若平台支持）：

```
/backend/app/services/enrollment/ @A
/backend/app/services/conflict.py @A
/backend/app/services/promotion.py @A
/backend/app/routers/enrollments.py @A
/backend/app/routers/stats.py @E
/backend/app/schemas/ @C
/backend/app/core/ @C
/sql/ @B
/bench/ @B
/alembic/ @B
/frontend/src/views/ @D
/frontend/src/components/ @E
/docs/ @E
```

## 8. 提交前自检脚本（`scripts/precheck.sh`）

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
echo "== pytest =="
docker compose exec -T api pytest tests/unit -x -q
echo "== concurrency (touched enrollment?) =="
if git diff --name-only HEAD~1 | grep -q 'services/enrollment'; then
  docker compose exec -T api pytest tests/integration/test_concurrency.py -x -q
fi
echo "== frontend build =="
(cd frontend && npm run build --silent)
echo "== ok =="
```
