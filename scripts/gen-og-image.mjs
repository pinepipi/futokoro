// OGP画像(1200x630)を scripts/og-card.html から生成する。
// 依存: @playwright/test 同梱の chromium（既存devDependency）。追加依存なし。
// 出力: リポジトリ直下 og-image.png（build-public.js が dist へコピー）。
// 実行: node scripts/gen-og-image.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const cardPath = path.join(here, "og-card.html");
const outPath = path.join(here, "..", "og-image.png");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(cardPath).href, { waitUntil: "networkidle" });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`OGP image written: ${outPath}`);
} finally {
  await browser.close();
}
