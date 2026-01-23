import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const imagesRoot = path.join(ROOT, "data", "minv_images");
const outFile = path.join(ROOT, "data", "imageManifest.js");

// extensions to include
const exts = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// Convert Windows "\" to "/" for keys and require paths
const toPosix = (p) => p.split(path.sep).join("/");

function walk(dirAbs) {
  /** returns array of absolute file paths */
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  const files = [];

  for (const e of entries) {
    const abs = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      files.push(...walk(abs));
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (exts.has(ext)) files.push(abs);
    }
  }
  return files;
}

if (!fs.existsSync(imagesRoot)) {
  console.error("Missing folder:", imagesRoot);
  process.exit(1);
}

const absFiles = walk(imagesRoot);

// Make keys like "dz/1-1.png" (relative to minv_images)
const relFiles = absFiles
  .map((abs) => toPosix(path.relative(imagesRoot, abs)))
  .sort((a, b) => a.localeCompare(b));

const lines = [];
lines.push("// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.");
lines.push("// Run: node scripts/genImageManifest.mjs");
lines.push("");
lines.push("export const IMAGE_MANIFEST = {");

for (const rel of relFiles) {
  // require path must be relative to this file: data/imageManifest.js
  // imageManifest.js sits in /data, so "./minv_images/<rel>" is correct
  const requirePath = "./minv_images/" + rel; // uses posix rel already
  lines.push(`  ${JSON.stringify(rel)}: require(${JSON.stringify(requirePath)}),`);
}

lines.push("};");
lines.push("");

fs.writeFileSync(outFile, lines.join("\n"), "utf8");
console.log(`Wrote ${relFiles.length} entries to ${path.relative(ROOT, outFile)}`);
