const fs = require("node:fs/promises");
const path = require("node:path");

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
  "io.js",
  "ads.js",
  "ads-config.js",
  "_headers"
];

const functionsSrc = path.join(rootDir, "functions");

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
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
