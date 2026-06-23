// CIデプロイ・パイプラインの「障害再発防止」ガード（node --test・OS非依存）。
//
// 背景（2026-06-23 インシデント）:
//   本番smokeが カスタムドメイン https://futokoro.app を直叩き → Cloudflareゾーンの
//   bot対策が GitHub Actions ランナー(データセンターIP)を 403 → smoke偽陰性 →
//   auto-rollback が正常な新版を旧版へ巻き戻した（自己破壊）。
//
//   恒久対策: smoke は「bot対策の外にあるデプロイURL(*.pages.dev)」を検証する。
//   このテストは、その対策がワークフローから失われたら CI を RED にして気付かせる。
//   → 02-dev/Knowledge.md「本番smokeがカスタムドメインを叩くと…」/ web-cloudflare-pages-standard §2

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const deployYml = fs.readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf8");
const smokeJs = fs.readFileSync(path.join(root, "scripts/smoke-http.mjs"), "utf8");

test("本番smokeは デプロイURL(*.pages.dev) を検証する（カスタムドメイン直叩き禁止）", () => {
  // 本番 deploy step の出力 deployment-url を smoke する配線が必須。
  assert.match(
    deployYml,
    /SMOKE_URL:\s*\$\{\{\s*steps\.deploy_production\.outputs\.deployment-url\s*\}\}/,
    "本番smokeが steps.deploy_production.outputs.deployment-url を使っていない（再発リスク）",
  );
});

test("smoke の SMOKE_URL に カスタムドメインを『単独で』ハードコードしない", () => {
  // 例: `SMOKE_URL: https://futokoro.app`（クォート無し・||フォールバック無し）が単独で現れたらNG。
  // rollback verify の `... || 'https://futokoro.app'`（クォート付きフォールバック）は許容。
  assert.doesNotMatch(
    deployYml,
    /SMOKE_URL:\s*https:\/\/futokoro\.app\s*$/m,
    "カスタムドメインを単独でsmoke対象にしている（bot対策403で誤rollbackの再発リスク）",
  );
});

test("rollback verify は last-known-good のデプロイURL(lkg_url)を検証する", () => {
  assert.match(
    deployYml,
    /needs\.deploy-production\.outputs\.lkg_url/,
    "rollback verify が lkg_url(*.pages.dev) を使っていない",
  );
});

test("3つの段（preview / 本番 / rollback verify）が smoke-http を実行する", () => {
  const runs = deployYml.match(/node scripts\/smoke-http\.mjs/g) || [];
  assert.ok(runs.length >= 3, `smoke-http の実行が ${runs.length} 箇所（preview/本番/rollback の3箇所以上を期待）`);
});

test("smoke-http は *.pages.dev を allowlist で許可している", () => {
  assert.match(smokeJs, /pages\.dev/, "allowlist に pages.dev が無い（デプロイURL smoke が弾かれる）");
});

test("smoke-http はブラウザUAを送る（DC IP+空UAの403偽陰性を低減）", () => {
  assert.match(smokeJs, /user-agent/i, "smoke-http が user-agent ヘッダを送っていない");
});

test("rollback は『本番に触れた失敗』のみで発火する（deploy前失敗で巻き戻さない）", () => {
  // production_attempted フラグでガードしているか（deploy前のbuild失敗等でrollbackしない安全弁）。
  assert.match(
    deployYml,
    /needs\.deploy-production\.outputs\.production_attempted\s*==\s*'true'/,
    "rollback の if が production_attempted ガードを失っている",
  );
});
