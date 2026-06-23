// 公開URL（preview / 本番）に対する HTTP スモークテスト（OS非依存・Node20 global fetch）
//
// 使い方:
//   node scripts/smoke-http.mjs https://futokoro.app
//   SMOKE_URL=https://ci-preview.futokoro-com.pages.dev node scripts/smoke-http.mjs
//
// 役割: デプロイ後に「実URLが生きていて・正しいアプリが配信されているか」を機械判定する。
//   - HTTP 200
//   - Content-Type が HTML
//   - 不変マーカー（タイトル / #simulatorForm）が本文に含まれる
// デプロイ伝播の遅延に備えてリトライする。1つでも満たさなければ非ゼロ終了（CIのゲート）。

const url = process.argv[2] || process.env.SMOKE_URL;
if (!url) {
  console.error("smoke-http: URL が未指定です（argv[2] か SMOKE_URL）");
  process.exit(2);
}

// URL は ふところ の本番 / CF Pages preview に限定（任意URL・http・内部アドレスを拒否＝SSRF/誤用防止）
const ALLOWED_URL = /^https:\/\/(futokoro\.app|[a-z0-9-]+\.futokoro-com\.pages\.dev)(\/.*)?$/;
let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch {
  console.error(`smoke-http: 不正なURL: ${url}`);
  process.exit(2);
}
if (parsedUrl.protocol !== "https:" || !ALLOWED_URL.test(url)) {
  console.error(`smoke-http: 許可外URL（https の futokoro.app / *.futokoro-com.pages.dev のみ）: ${url}`);
  process.exit(2);
}

// アプリの不変マーカー（コピー文言ではなく構造で判定）
const MARKERS = ['id="simulatorForm"'];
// タイトルは強い同一性マーカー（変わったら smoke 側も更新する前提）
const TITLE_INCLUDES = "ふところ";

const MAX_ATTEMPTS = 6;
const RETRY_MS = 5000;
const TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "cache-control": "no-cache" },
      // allowlist は最初のURLのみ検証するため、リダイレクトは追わず 3xx は不合格扱い
      // （許可ドメインが任意の遷移先へ飛ばす経路を塞ぐ）。正規の本番URLは 200 を直接返す。
      redirect: "manual",
    });
    const body = await res.text();
    return { status: res.status, contentType: res.headers.get("content-type") || "", body };
  } finally {
    clearTimeout(timer);
  }
}

function evaluate({ status, contentType, body }) {
  const problems = [];
  if (status !== 200) problems.push(`status=${status}（期待 200）`);
  if (!/text\/html/i.test(contentType)) problems.push(`content-type=${contentType}（HTMLでない）`);
  if (!new RegExp(`<title>[^<]*${TITLE_INCLUDES}`).test(body)) {
    problems.push(`title に "${TITLE_INCLUDES}" を含まない`);
  }
  for (const marker of MARKERS) {
    if (!body.includes(marker)) problems.push(`マーカー欠落: ${marker}`);
  }
  return problems;
}

async function main() {
  console.log(`smoke-http: target=${url}`);
  let lastProblems = ["未実行"];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fetchOnce();
      lastProblems = evaluate(result);
      if (lastProblems.length === 0) {
        console.log(`smoke-http: OK（attempt ${attempt}/${MAX_ATTEMPTS}・status 200・マーカー検証pass）`);
        process.exit(0);
      }
      console.warn(`smoke-http: attempt ${attempt}/${MAX_ATTEMPTS} 不合格 → ${lastProblems.join(" / ")}`);
    } catch (err) {
      lastProblems = [`fetch失敗: ${err && err.message ? err.message : String(err)}`];
      console.warn(`smoke-http: attempt ${attempt}/${MAX_ATTEMPTS} ${lastProblems[0]}`);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_MS);
  }
  console.error(`smoke-http: NG（${MAX_ATTEMPTS}回試行して不合格）→ ${lastProblems.join(" / ")}`);
  process.exit(1);
}

main();
