const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const publicFiles = [
  "index.html",
  "favicon.svg",
  "privacy.html",
  "feedback.html",
  "feedback.js",
  "styles.css",
  "app.js",
  "domain.js",
  "benchmark.js",
  "io.js",
  "ads.js",
  "ads-config.js",
  "_headers"
];

const functionsSrc = path.join(rootDir, "functions");

// HTML が参照するローカル css/js に「内容ハッシュ」のクエリを付ける。
// Cloudflare Pages は css/js をブラウザに4hキャッシュさせるため、内容が変わったら必ず再取得させる。
// HTML は max-age=0（常に再検証）なので、新しいクエリが即ユーザーに届く＝デプロイが確実に反映される。
async function bustCacheInHtml() {
  const hashCache = {};
  async function hashOf(asset) {
    if (!hashCache[asset]) {
      const buf = await fs.readFile(path.join(distDir, asset));
      hashCache[asset] = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
    }
    return hashCache[asset];
  }
  const htmlFiles = publicFiles.filter((f) => f.endsWith(".html"));
  for (const html of htmlFiles) {
    const p = path.join(distDir, html);
    let src = await fs.readFile(p, "utf8");
    // 引用符で囲まれたローカル参照のみ対象（外部URLは ./ 始まりでないので対象外）
    const assets = [...new Set(
      [...src.matchAll(/["']\.\/([a-zA-Z0-9_-]+\.(?:css|js))["']/g)].map((m) => m[1])
    )];
    for (const asset of assets) {
      if (!publicFiles.includes(asset)) continue;
      const h = await hashOf(asset);
      src = src.split(`"./${asset}"`).join(`"./${asset}?v=${h}"`);
      src = src.split(`'./${asset}'`).join(`'./${asset}?v=${h}'`);
    }
    await fs.writeFile(p, src);
  }
}

async function build() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  await Promise.all(
    publicFiles.map(async (file) => {
      await fs.copyFile(path.join(rootDir, file), path.join(distDir, file));
    })
  );

  // Cloudflare Pages Functions（/api/* 等）は dist/functions/ に置くと deploy 時に拾われる。
  try {
    await fs.access(functionsSrc);
    await fs.cp(functionsSrc, path.join(distDir, "functions"), { recursive: true });
  } catch {
    /* functions/ が無ければ何もしない */
  }

  // 公開HTMLの css/js 参照にキャッシュバスティングのクエリを付与
  await bustCacheInHtml();
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
