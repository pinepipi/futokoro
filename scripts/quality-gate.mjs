// quality:gate オーケストレータ
// 全ゲート（build/domain/publish/playwright[journeys+visual+a11y]）を走らせ、
// quality-report.md を生成し、ブロッキングな失敗があれば non-zero exit する。
// AI視覚judge は別ステップ（Claudeサブエージェント）。本スクリプトは証拠バンドルを生成し report に枠を用意する。
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const reportPath = path.join(root, "quality-report.md");
const pwJsonPath = path.join(root, "output", "quality", "playwright-results.json");

const SKIP_PW = process.argv.includes("--no-browser"); // CI未整備環境などでブラウザ層を飛ばす保険
const aiJudgePath = path.join(root, "output", "quality", "ai-judge-result.json");

function run(label, cmd, args) {
  const started = Date.now();
  const res = spawnSync(cmd, args, { cwd: root, shell: true, encoding: "utf8" });
  const ms = Date.now() - started;
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  const ok = res.status === 0;
  process.stdout.write(`${ok ? "✅" : "❌"} ${label} (${ms}ms)\n`);
  if (!ok) process.stdout.write(out.split("\n").slice(-25).join("\n") + "\n");
  return { label, ok, ms, tail: out.split("\n").slice(-40).join("\n") };
}

// Playwright JSON から spec 単位の pass/fail と失敗詳細を抽出
function parsePlaywright() {
  if (!existsSync(pwJsonPath)) return null;
  try {
    const data = JSON.parse(readFileSync(pwJsonPath, "utf8"));
    const failed = [];
    let total = 0, passed = 0;
    const walk = (suite) => {
      (suite.suites || []).forEach(walk);
      (suite.specs || []).forEach((spec) => {
        spec.tests.forEach((t) => {
          total++;
          const status = t.results?.[t.results.length - 1]?.status;
          if (status === "passed" || status === "expected") passed++;
          else failed.push({ title: `${spec.title} [${t.projectName}]`, error: (t.results?.[0]?.error?.message || "").split("\n").slice(0, 6).join("\n") });
        });
      });
    };
    (data.suites || []).forEach(walk);
    return { total, passed, failed };
  } catch {
    return null;
  }
}

const results = [];
results.push(run("build (production dist)", "npm", ["run", "build"]));
results.push(run("test:domain (ドメイン単体)", "npm", ["run", "test:domain"]));
results.push(run("test:ci-guard (CIパイプライン再発防止)", "npm", ["run", "test:ci-guard"]));
results.push(run("test:publish (公開dist構成)", "npm", ["run", "test:publish"]));

let pw = null;
if (!SKIP_PW) {
  const pwRes = run("playwright (journeys+visual+a11y)", "npx", ["playwright", "test"]);
  results.push(pwRes);
  pw = parsePlaywright();
  // 証拠バンドル生成（AI judge 用）— 失敗してもゲート全体は止めない
  run("evidence bundles (AI judge入力)", "node", ["scripts/collect-ui-evidence.mjs"]);
}

// AI judge 結果が output/quality/ai-judge-result.json に保存済みなら読み込む。
// P0/P1 があれば deterministic ゲートと同列で blocking 扱いにする（仕様: quality/ai-visual-judge.md）。
let aiJudgeResult = null;
let aiJudgeBlocking = [];
if (existsSync(aiJudgePath)) {
  try {
    aiJudgeResult = JSON.parse(readFileSync(aiJudgePath, "utf8"));
    aiJudgeBlocking = (aiJudgeResult.issues || []).filter((i) => i.severity === "P0" || i.severity === "P1");
    process.stdout.write(`${aiJudgeBlocking.length === 0 ? "✅" : "❌"} AI judge（保存済み結果）: P0/P1 ${aiJudgeBlocking.length}件\n`);
  } catch {
    process.stdout.write("⚠️  ai-judge-result.json の parse に失敗（スキップ）\n");
  }
} else {
  process.stdout.write("ℹ️  AI judge 未実行（output/quality/ai-judge-result.json なし）\n");
}

const blocking = results.filter((r) => !r.ok);
const gateOk = blocking.length === 0 && aiJudgeBlocking.length === 0;

// quality-report.md 生成
const ts = new Date().toISOString();
let md = `# 🚦 quality-report — ふところ

> 生成: ${ts}（\`npm run quality:gate\`）。判定基準は \`quality/QUALITY_GATE.md\`。
> このファイルは生成物（gitignore）。P0/P1 が残る間は deploy 禁止。

## ゲート結果（deterministic）

| ゲート | 結果 | 時間 |
|--------|------|------|
${results.map((r) => `| ${r.label} | ${r.ok ? "✅ pass" : "❌ FAIL"} | ${r.ms}ms |`).join("\n")}

`;

if (pw) {
  md += `## Playwright 明細\n\n- 合計 ${pw.total} / pass ${pw.passed} / fail ${pw.failed.length}\n`;
  if (pw.failed.length) {
    md += `\n### ❌ 失敗テスト（P0/P1 相当 — 要修正）\n`;
    pw.failed.forEach((f) => {
      md += `\n- **${f.title}**\n\`\`\`\n${f.error}\n\`\`\`\n`;
    });
  }
  md += `\n`;
}

if (!gateOk) {
  md += `## ❌ ブロッキングな失敗（tail）\n\n`;
  blocking.forEach((r) => {
    md += `### ${r.label}\n\`\`\`\n${r.tail}\n\`\`\`\n\n`;
  });
}

md += `## 🤖 AI視覚judge

`;

if (aiJudgeResult) {
  md += `**結果**: ${aiJudgeResult.ok && aiJudgeBlocking.length === 0 ? "✅ ok" : "❌ FAIL（P0/P1 あり）"}\n`;
  if (aiJudgeResult.summary) md += `> ${aiJudgeResult.summary}\n\n`;
  if (aiJudgeBlocking.length) {
    md += `### ❌ P0/P1（deploy禁止）\n\n`;
    aiJudgeBlocking.forEach((i) => {
      md += `- **[${i.severity}] ${i.screen || ""} ${i.viewport || ""}** \`${i.selector_or_region || ""}\`: ${i.user_impact || ""}\n`;
      if (i.repro) md += `  repro: ${i.repro}\n`;
    });
    md += "\n";
  }
  const p2s = (aiJudgeResult.issues || []).filter((i) => i.severity === "P2");
  if (p2s.length) {
    md += `### ⚠️ P2（warning）\n\n`;
    p2s.forEach((i) => {
      md += `- **${i.screen || ""} ${i.viewport || ""}** \`${i.selector_or_region || ""}\`: ${i.user_impact || ""}\n`;
    });
    md += "\n";
  }
  if (!aiJudgeBlocking.length && !((aiJudgeResult.issues || []).length)) md += "_issues なし_\n\n";
} else {
  md += `証拠バンドル: \`output/quality/evidence/index.json\`（スクショ+DOM+ARIA+layout_issues）。\n`;
  md += `\`quality/ai-visual-judge.md\` のプロンプトで Claudeサブエージェントに渡し、\n`;
  md += `返ってきた JSON を **\`output/quality/ai-judge-result.json\`** に保存すると次回 \`quality:gate\` 実行時に自動反映される。\n\n`;
  md += `- [ ] AI judge 未実行（結果ファイルなし — 手動 or Claudeサブエージェントで実施）\n\n`;
}

md += `## 自己修正ループ（Claude Code向け）

P0/P1 のみ修正 → \`npm run quality:gate\` 再実行。P2以下は触らない。最大5回。
解消しない P0/P1 は止めて board/Slack の human gate へ退避。
`;

mkdirSync(path.dirname(pwJsonPath), { recursive: true });
writeFileSync(reportPath, md, "utf8");

process.stdout.write(`\n${gateOk ? "✅ quality:gate PASS" : "❌ quality:gate FAIL"} → quality-report.md\n`);
process.exit(gateOk ? 0 : 1);
