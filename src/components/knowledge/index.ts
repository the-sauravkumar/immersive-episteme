/**
 * The shared knowledge components (DESIGN.md 9.6-9.12, 12.1 rule 1). BOTH conditions import these
 * from here, so the 2D concept page and the 3D information panel resolve the same module files
 * (parity check P19). No component takes a condition-specific style input.
 */
export { ClaimList, type ClaimListProps } from "./claim-list";
export { FigureLightbox, LIGHTBOX_MAX_EDGE, type FigureLightboxProps } from "./figure-lightbox";
export { FIGURE_SIZES, KnowledgeFigure, type KnowledgeFigureProps } from "./knowledge-figure";
export { KnowledgeSheet, sheetTitleId, type KnowledgeSheetProps, type SheetConcept } from "./knowledge-sheet";
export { LayeredField, LayerTabs, layerTabId, type FieldLayer, type LayeredFieldProps, type LayerTabsProps } from "./layer-tabs";
export { Pager, PAGER_LINK_CLASS, type PagerItem, type PagerProps } from "./pager";
export {
  groupRelatedLinks,
  RELATED_LINK_CLASS,
  RelatedConcepts,
  relatedLinksFromGroups,
  type RelatedConceptsProps,
  type RelatedLink,
  type RelatedLinkGroup,
} from "./related-concepts";
export { SheetProgress, SheetTitle } from "./sheet-parts";
export { StateMessage, type StateMessageProps, type StateMessageTone } from "./state-message";
export { StructureDiagramSvg } from "./structure-diagram";
export { TraditionMarker, TraditionName } from "./tradition-marker";
export { CitationNote, CitationRecord } from "@/components/citations/citation-disclosure";
