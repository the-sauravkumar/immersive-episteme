/**
 * Brand components (DESIGN.md 7, DR-022). The Atlas system has no decorative graphics: the
 * knock-out band, the registration ticks and the tradition marker are removed in every zone.
 *  - OutlineDiagram: public and console line drawings only (static, no draw-on motion).
 *  - Rule, numbering and Wordmark: every area.
 */
export { OutlineDiagram, type DiagramEdge, type DiagramFill, type DiagramNode } from "./outline-diagram";
export { Rule, type RuleKind } from "./rule";
export { Wordmark, type WordmarkSize } from "./wordmark";
export { NUMERAL_CLASS, chartFigureLabel, claimNumber, countOf, figureLabel, plateLabel, tableLabel } from "./numbering";
