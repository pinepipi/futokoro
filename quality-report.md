# 🚦 quality-report — ふところ

> 生成: 2026-06-22T15:13:59.692Z（`npm run quality:gate`）。判定基準は `quality/QUALITY_GATE.md`。
> このファイルは生成物（gitignore）。P0/P1 が残る間は deploy 禁止。

## ゲート結果（deterministic）

| ゲート | 結果 | 時間 |
|--------|------|------|
| build (production dist) | ✅ pass | 1462ms |
| test:domain (ドメイン単体) | ✅ pass | 2164ms |
| test:publish (公開dist構成) | ✅ pass | 4259ms |
| playwright (journeys+visual+a11y) | ✅ pass | 78089ms |

## Playwright 明細

- 合計 56 / pass 56 / fail 0

## 🤖 AI視覚judge

証拠バンドル: `output/quality/evidence/index.json`（スクショ+DOM+ARIA+layout_issues）。
`quality/ai-visual-judge.md` のプロンプトで Claudeサブエージェントに渡し、
返ってきた JSON を **`output/quality/ai-judge-result.json`** に保存すると次回 `quality:gate` 実行時に自動反映される。

- [ ] AI judge 未実行（結果ファイルなし — 手動 or Claudeサブエージェントで実施）

## 自己修正ループ（Claude Code向け）

P0/P1 のみ修正 → `npm run quality:gate` 再実行。P2以下は触らない。最大5回。
解消しない P0/P1 は止めて board/Slack の human gate へ退避。
