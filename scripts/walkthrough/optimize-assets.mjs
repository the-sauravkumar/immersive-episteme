import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const TEX = "public/walkthrough/tex";
const MODELS = "public/walkthrough/models";
const USED_SCANS = new Set([...fs.readFileSync("src/features/process/domain/asset-catalogue.ts", "utf8").matchAll(/scan\("[a-z-]+", "([A-Za-z_0-9]+)"/g)].map((match) => match[1]));
const USED_TEXTURES = new Set(["red_laterite_soil_stones", "large_red_bricks", "painted_plaster_wall", "weathered_brown_planks", "wood_table_worn", "rough_linen", "raw_cotton"]);

async function reencode(file, size, quality) {
  const data = await sharp(fs.readFileSync(file)).resize(size, size, { fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
  fs.writeFileSync(file, data);
}

(async () => {
  for (const name of fs.readdirSync(MODELS)) if (!USED_SCANS.has(name)) fs.rmSync(path.join(MODELS, name), { recursive: true });
  for (const name of fs.readdirSync(TEX)) {
    if (!USED_TEXTURES.has(name)) {
      fs.rmSync(path.join(TEX, name), { recursive: true });
      continue;
    }
    for (const file of fs.readdirSync(path.join(TEX, name))) {
      const full = path.join(TEX, name, file);
      if (file.startsWith("diff")) await reencode(full, 4096, 84);
      else await reencode(full, 2048, 82);
    }
  }
  const total = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? total(path.join(dir, entry.name)) : fs.statSync(path.join(dir, entry.name)).size), 0);
  console.log("textures MB", (total(TEX) / 2 ** 20).toFixed(1), "models MB", (total(MODELS) / 2 ** 20).toFixed(1));
})();
