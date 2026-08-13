## Agent skills

### Issue tracker

Issues live as Markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.


## 注意事项
提交信息统一使用中文


## 视觉验证

- 日常快速回归：`npm run test:visual:quick`
- 定向快速验证：`npm run test:visual:quick -- --family <family-id> --style <style-id>`
- 提交或发布前：`npm run test:visual -- --retain-artifacts failed`
- 更新视觉基线必须显式使用：`--update`
- `quick` 只覆盖默认固定帧，不能替代完整参数矩阵。
- 默认优先使用 `--retain-artifacts failed`，避免累积通过案例 PNG。
