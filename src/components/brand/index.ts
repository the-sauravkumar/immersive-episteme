/**
 * Brand components (DESIGN.md 7): the graphic language. Zone limits:
 *  - KnockoutBand / KnockoutField: public and research console only.
 *  - RegistrationTicks / TickedFrame: public, Colophon and the CMS proof frame only.
 *  - OutlineDiagram: public and console only.
 *  - Rule, numbering and Wordmark: every area.
 * None of the decorative ones may appear in study mode, in either condition.
 * The neutral tradition marker lives with the knowledge components
 * (`@/components/knowledge/tradition-marker`) because study pages use it.
 */
export { BLOCK_CELL, BLOCK_UNIT, KnockoutBand, KnockoutField } from "./knockout-band";
export { RegistrationTicks, TickedFrame } from "./registration-ticks";
export { OutlineDiagram, type DiagramEdge, type DiagramFill, type DiagramNode } from "./outline-diagram";
export { Rule, type RuleKind } from "./rule";
export { Wordmark, type WordmarkSize } from "./wordmark";
export { NUMERAL_CLASS, chartFigureLabel, claimNumber, countOf, figureLabel, plateLabel, tableLabel } from "./numbering";
