const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const publicFiles = [
  "index.html",
  "favicon.svg",
  "privacy.html",
  "styles.css",
  "app.js",
  "domain.js",
  "io.js",
  "ads.js",
  "ads-config.js",
  "_headers"
];

async function build() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  await Promise.all(
    publicFiles.map(async (file) => {
      await fs.copyFile(path.join(rootDir, file), path.join(distDir, file));
    })
  );
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
