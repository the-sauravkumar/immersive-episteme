import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import { REPO_ROOT } from "./_shared";
import type { StudyPhotoSource } from "../../src/features/process/domain/stage-template";

import { parsePhotoProposal, planStudyPhotos, studyPhotoFile } from "./ingest-study-photos";

const PROPOSAL_FILES = ["media-proposals.json", "process-photo-proposals.json"];
const OUTPUT = join(REPO_ROOT, "scripts", "content", "study-photos");
const LAB_PHOTOS = join(REPO_ROOT, "tools", "walkthrough-lab", "study-photos.json");

const RECORDED_CROPS: Readonly<Record<string, { readonly left: number }>> = {
  "mk-textile-vam-o164855": { left: 325 },
};

interface ProposedOriginal {
  readonly id: string;
  readonly file: string;
  readonly sha256: string;
}

function proposedOriginals(...proposalsJson: unknown[]): ProposedOriginal[] {
  return proposalsJson
    .flatMap((json) => (json as { images: Record<string, unknown>[] }).images)
    .filter((raw) => raw.status === "proposed")
    .map((raw) => {
      const proposal = parsePhotoProposal(raw);
      if (typeof raw.sha256 !== "string") throw new Error(`${proposal.id}: no sha256 of the source original recorded`);
      return { id: proposal.id, file: studyPhotoFile(proposal), sha256: raw.sha256 };
    });
}

const sha256Of = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

async function main(): Promise<void> {
  const originalsDir = process.env.STUDY_PHOTO_ORIGINALS_DIR;
  if (!originalsDir) throw new Error("Set STUDY_PHOTO_ORIGINALS_DIR to the folder holding the source originals");
  const review = join(REPO_ROOT, "content", "review");
  const proposals = PROPOSAL_FILES.map((name) => join(review, name)).filter((path) => existsSync(path)).map((path) => JSON.parse(readFileSync(path, "utf8")) as unknown);
  const bySha = new Map(readdirSync(originalsDir).map((name) => {
    const bytes = readFileSync(join(originalsDir, name));
    return [sha256Of(bytes), bytes] as const;
  }));
  mkdirSync(OUTPUT, { recursive: true });
  for (const original of proposedOriginals(...proposals)) {
    const bytes = bySha.get(original.sha256);
    if (!bytes) throw new Error(`${original.id}: no file in ${originalsDir} has the recorded sha256 ${original.sha256}`);
    const crop = RECORDED_CROPS[original.id];
    const target = join(OUTPUT, original.file);
    if (crop) {
      const { width, height } = await sharp(bytes).metadata();
      await sharp(bytes).extract({ left: crop.left, top: 0, width: width - crop.left, height }).jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true }).toFile(target);
    } else {
      writeFileSync(target, bytes);
    }
    const meta = await sharp(target).metadata();
    console.log(`${original.file}: ${meta.width} x ${meta.height} px${crop ? `, cropped ${crop.left} px at the left` : ", source original"}`);
  }
  const labPhotos: StudyPhotoSource[] = await Promise.all(
    planStudyPhotos(...proposals).map(async (plan) => {
      const file = join(OUTPUT, plan.file);
      const { width, height } = await sharp(file).metadata();
      return {
        tradition: plan.conceptKey.split(".")[0]!,
        conceptKey: plan.conceptKey,
        conceptType: plan.conceptKey.split(".")[1]!,
        assetId: plan.proposalId,
        record: plan.metadata.sourceUrl,
        src: `/study-photos/${plan.file}`,
        width,
        height,
        alt: plan.metadata.altText,
        caption: plan.metadata.caption,
        credit: plan.metadata.credit,
        licence: plan.metadata.licence,
        sha256: sha256Of(readFileSync(file)),
      };
    }),
  );
  writeFileSync(LAB_PHOTOS, `${JSON.stringify(labPhotos, null, 2)}
`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/content/build-study-photos.ts")) await main();
