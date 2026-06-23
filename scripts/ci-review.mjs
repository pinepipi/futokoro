// CI 自動レビュアー（Anthropic Messages API・Node20 global fetch・SDK非依存）
//
// 使い方: node scripts/ci-review.mjs <diff-file>
//   - ANTHROPIC_API_KEY が必要（未設定なら呼び出し側でスキップ判断）
//   - diff-file の git diff を Claude にレビューさせ、JSON で {ok, summary, issues[]} を得る
//   - P0/P1 の指摘が1件でもあれば exit 1（deploy をブロック）。なければ exit 0。
//
// 設計: かぴは PR を見ない方針のため、人間レビューの代わりに AI が自動でゲートする。
// 二重の網のもう一方（push 直前の Codex フック）は .githooks/pre-push。

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8"; // 上書き可（安価優先: ANTHROPIC_MODEL=claude-sonnet-4-6）
const MAX_DIFF_CHARS = 500_000; // 巨大diffはコスト・コンテキスト保護のため打ち切り（Opus 1M context内に収める）

const diffFile = process.argv[2];
if (!diffFile) {
  console.error("ci-review: diff ファイルパスが未指定です（argv[2]）");
  process.exit(2);
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ci-review: ANTHROPIC_API_KEY 未設定。呼び出し側でスキップしてください。");
  process.exit(2);
}

const fs = await import("node:fs");
let diff = "";
try {
  diff = fs.readFileSync(diffFile, "utf8");
} catch (err) {
  console.error(`ci-review: diff 読込失敗: ${err?.message ?? err}`);
  process.exit(2);
}

if (!diff.trim()) {
  console.log("ci-review: 差分なし → ok");
  process.exit(0);
}

let truncated = false;
if (diff.length > MAX_DIFF_CHARS) {
  diff = diff.slice(0, MAX_DIFF_CHARS);
  truncated = true;
  // 打ち切りは「部分通過」になり得る（無害な大量diffの後ろに変更を隠す回避）。
  // CIログで視認できるよう ::error:: で目立たせる（ただし他ゲートがあるため deploy は止めない）。
  console.error(
    `::error::ci-review: diff が大きく先頭 ${MAX_DIFF_CHARS} 文字のみレビュー。残りは未審査＝大規模変更は人手確認推奨。`,
  );
}

// 構造化出力スキーマ（output_config.format）。additionalProperties:false 必須。
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean" },
    summary: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
          file: { type: "string" },
          problem: { type: "string" },
        },
        required: ["severity", "file", "problem"],
      },
    },
  },
  required: ["ok", "summary", "issues"],
};

const SYSTEM =
  "あなたは熟練のコードレビュアーです。本番デプロイ前の最後のゲートとして、与えられた git diff を" +
  "レビューします。重大度: P0=即本番障害/データ毀損/秘密漏えい, P1=リリースブロッカー級のバグ・脆弱性, " +
  "P2=改善推奨, P3=軽微。観点: 正しさ・本番を壊す論理穴・セキュリティ・秘密混入・回帰。" +
  "diff に無い事象を推測で P0/P1 にしないこと。確証のあるもののみ高重大度にする。";

const userText =
  `次の git diff をレビューしてください${truncated ? "（注: 大きいため先頭のみ）" : ""}。\n\n` +
  "```diff\n" +
  diff +
  "\n```";

const body = {
  model: MODEL,
  max_tokens: 8000,
  thinking: { type: "adaptive" },
  output_config: {
    effort: "medium",
    format: { type: "json_schema", schema: SCHEMA },
  },
  system: SYSTEM,
  messages: [{ role: "user", content: userText }],
};

async function main() {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // raw ボディは出力しない（万一トークンが反射混入してもログに残さない）。error.type のみ。
    let errType = "unknown";
    try {
      errType = JSON.parse(await res.text())?.error?.type || "unknown";
    } catch {
      /* ボディが JSON でない場合も raw は出さない */
    }
    console.error(`ci-review: API エラー ${res.status} (${errType})`);
    // API 不調でデプロイをブロックすると運用が詰まるため fail-open（警告のみ）。
    // 真の安全網は push 直前の Codex フック＋既存の test/security ゲート。
    console.warn("::warning::AIレビュアー API 呼び出し失敗 → スキップ（fail-open）。");
    process.exit(0);
  }

  const data = await res.json();
  if (data.stop_reason === "refusal") {
    console.warn("::warning::AIレビュアーが refusal を返したためスキップ（fail-open）。");
    process.exit(0);
  }

  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) {
    console.warn("::warning::AIレビュアー応答に text ブロックなし → スキップ（fail-open）。");
    process.exit(0);
  }

  let verdict;
  try {
    verdict = JSON.parse(textBlock.text);
  } catch {
    console.warn("::warning::AIレビュアー応答が JSON でない → スキップ（fail-open）。");
    process.exit(0);
  }

  const issues = Array.isArray(verdict.issues) ? verdict.issues : [];
  console.log(`ci-review: ${verdict.summary || "(summary なし)"}`);
  for (const i of issues) {
    console.log(`  [${i.severity}] ${i.file}: ${i.problem}`);
  }

  const blockers = issues.filter((i) => i.severity === "P0" || i.severity === "P1");
  if (blockers.length > 0) {
    console.error(`::error::AIレビュアーが P0/P1 を ${blockers.length} 件検出 → deploy をブロック。`);
    process.exit(1);
  }
  console.log("ci-review: P0/P1 なし → ok");
  process.exit(0);
}

main().catch((err) => {
  console.warn(`::warning::AIレビュアー実行エラー: ${err?.message ?? err} → スキップ（fail-open）。`);
  process.exit(0);
});
