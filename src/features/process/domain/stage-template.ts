export type TraditionKey = "ajrakh" | "sanganeri" | "machilipatnam-kalamkari";

export type StationKind = "table" | "vat" | "boil" | "wash" | "soak" | "dry" | "carve" | "finish";

export type ItemRole = "tool" | "material";

export interface SourceRef {
  readonly sourceId: string;
  readonly title: string;
  readonly locator: string;
  readonly quote: string;
}

export interface StageItem {
  readonly key: string;
  readonly role: ItemRole;
  readonly label: string;
  readonly localName: string | null;
  readonly modelId: string;
}

export interface StageCaption {
  readonly text: string;
  readonly sources: readonly SourceRef[];
}

export interface TemplateStage {
  readonly number: number;
  readonly key: string;
  readonly sourceStageKeys: readonly string[];
  readonly name: string;
  readonly localName: string | null;
  readonly kind: StationKind;
  readonly caption: StageCaption;
  readonly items: readonly StageItem[];
  readonly clothStateId: string;
}

export interface ProductImage {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly holder: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly record: string;
}

interface StudyPhoto extends ProductImage {
  readonly alt: string;
  readonly caption: string;
  readonly credit: string;
  readonly licence: string;
  readonly sha256: string;
}

export interface StudyPhotoSource {
  readonly tradition: string;
  readonly conceptKey: string;
  readonly conceptType: string;
  readonly assetId: string;
  readonly record: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly caption: string;
  readonly credit: string;
  readonly licence: string;
  readonly sha256: string;
}

export type ExhibitImage = ProductImage | StudyPhoto;

export interface StageTemplate {
  readonly tradition: TraditionKey;
  readonly traditionName: string;
  readonly rawClothStateId: string;
  readonly stages: readonly TemplateStage[];
  readonly products: readonly ProductImage[];
  readonly photos?: readonly StudyPhoto[];
}

export const CLOTH_AFTER_LABEL = "Cloth After This Stage";
export const FOLLOWED_CLOTH_LABEL = "The Cloth You Followed";
export const PRODUCT_TITLE = "Finished Textiles";
export const PRODUCT_SENTENCE = "The cloth you followed from Stage 1, and others from the same tradition.";

export function unverifiedStages(templates: readonly StageTemplate[], verifiedStageConcepts: ReadonlySet<string>): string[] {
  return templates.flatMap((template) =>
    template.stages.filter((stage) => stage.sourceStageKeys.length === 0 || stage.sourceStageKeys.some((key) => !verifiedStageConcepts.has(key))).map((stage) => stage.key),
  );
}

const PHOTO_SUBJECT_BY_CONCEPT_TYPE: Readonly<Record<string, string>> = { historical_context: "Textile", tool: "Printing Blocks" };

function studyPhotoName(traditionName: string, conceptType: string): string {
  return `${traditionName} ${PHOTO_SUBJECT_BY_CONCEPT_TYPE[conceptType] ?? "Photograph"}`;
}

export function creditHolder(credit: string): string {
  const named = credit.replace(/^©\s*/, "").replace(/^Courtesy\s+/i, "");
  const holder = named.includes(" / ") ? named.slice(named.lastIndexOf(" / ") + 3) : named;
  return holder.split(",")[0]!.trim();
}

function balancedPhotoSources(traditions: readonly string[], photos: readonly StudyPhotoSource[]): StudyPhotoSource[] {
  const ordered = [...photos].sort((a, b) => a.conceptType.localeCompare(b.conceptType) || a.conceptKey.localeCompare(b.conceptKey) || a.assetId.localeCompare(b.assetId));
  const types = [...new Set(ordered.map((photo) => photo.conceptType))];
  return types.flatMap((type) => {
    const byTradition = traditions.map((tradition) => ordered.filter((photo) => photo.tradition === tradition && photo.conceptType === type));
    const shared = Math.min(...byTradition.map((list) => list.length));
    return byTradition.flatMap((list) => list.slice(0, shared));
  });
}

export function withStudyPhotos(templates: readonly StageTemplate[], photos: readonly StudyPhotoSource[]): StageTemplate[] {
  const balanced = balancedPhotoSources(
    templates.map((template) => template.tradition),
    photos,
  );
  return templates.map((template) => ({
    ...template,
    photos: balanced
      .filter((photo) => photo.tradition === template.tradition)
      .map((photo) => ({
        id: photo.assetId,
        file: photo.src,
        name: studyPhotoName(template.traditionName, photo.conceptType),
        holder: creditHolder(photo.credit),
        widthPx: photo.width,
        heightPx: photo.height,
        record: photo.record,
        alt: photo.alt,
        caption: photo.caption,
        credit: photo.credit,
        licence: photo.licence,
        sha256: photo.sha256,
      })),
  }));
}

const sameRecord = (left: string, right: string): boolean => left.replace(/\/+$/, "") === right.replace(/\/+$/, "");

export function exhibitImages(template: StageTemplate): readonly ExhibitImage[] {
  const photos = template.photos ?? [];
  const shown = template.products.map((product) => photos.find((photo) => sameRecord(photo.record, product.record)) ?? product);
  return [...shown, ...photos.filter((photo) => !shown.includes(photo))];
}

function isStudyPhoto(image: ExhibitImage): image is StudyPhoto {
  return "caption" in image;
}

export function exhibitAlt(image: ExhibitImage): string {
  return isStudyPhoto(image) ? image.alt : `${image.name}, ${image.holder}`;
}

export function exhibitCreditLines(image: ExhibitImage): readonly string[] {
  return isStudyPhoto(image) ? [image.holder, image.caption, `Photo: ${image.credit}. Licence: ${image.licence}.`] : [image.holder];
}
