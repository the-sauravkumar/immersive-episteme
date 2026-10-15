import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** Class-string patterns of the DESIGN.md 15 lint rules (matched against string literals and template parts). */
const UTILITY = String.raw`(?:text|bg|border|border-[trblxy]|fill|stroke|decoration|outline|ring|from|to|via|accent|caret|divide|shadow|placeholder)`;
const PUBLIC_ACCENT = String.raw`(?:\b${UTILITY}-(?:madder|ochre)(?:-deco)?\b|var\(--(?:madder|ochre))`;
const RAW_PALETTE = String.raw`\b${UTILITY}-(?:emerald|amber|red|green|yellow|blue|slate|gray|zinc|neutral|stone|orange|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b`;
const STUDY_MOTION = String.raw`(?:^|\s|:)(?:transition(?:-[a-z]+|-\[[^\]]+\])?|animate-[a-z\[][^\s]*|duration-[0-9(\[][^\s]*)(?=\s|$)`;

/** `no-restricted-syntax` entries for one pattern on string literals and template parts. */
function restricted(pattern, message) {
  return [
    { selector: `Literal[value=/${pattern}/]`, message },
    { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
  ];
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],
    },
  },
  // DESIGN.md 15 "Contrast and colour" and 8 (motion), enforced on class strings (string literals
  // and template parts; comments are not checked):
  //  - madder and ochre (tokens or utilities) only in public files;
  //  - no raw Tailwind palette colours anywhere in src/ (tokens only);
  //  - no transition or animate utilities in study-mode code (both conditions and /study).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/(public)/**", "src/components/public/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...restricted(PUBLIC_ACCENT, "madder and ochre are public-only (DESIGN.md 4.2, 15): use ink or indigo here."),
        ...restricted(RAW_PALETTE, "Raw Tailwind palette colours are not allowed (DESIGN.md 15): use the tokens (ok, warn, danger, ink, indigo ...)."),
      ],
    },
  },
  {
    files: ["src/app/(public)/**/*.{ts,tsx}", "src/components/public/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...restricted(RAW_PALETTE, "Raw Tailwind palette colours are not allowed (DESIGN.md 15): use the tokens.")],
    },
  },
  {
    files: [
      "src/app/(learning)/**/*.{ts,tsx}",
      "src/app/(study)/**/*.{ts,tsx}",
      "src/components/knowledge/**/*.{ts,tsx}",
      "src/components/learning/**/*.{ts,tsx}",
      "src/components/museum/overlays/**/*.{ts,tsx}",
      "src/features/learning-2d/ui/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...restricted(PUBLIC_ACCENT, "madder and ochre are public-only (DESIGN.md 4.2, 15)."),
        ...restricted(RAW_PALETTE, "Raw Tailwind palette colours are not allowed (DESIGN.md 15)."),
        ...restricted(STUDY_MOTION, "Study mode has zero motion (DESIGN.md 8, 12.2 rule 6): no transition or animate utilities here."),
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Project ignores:
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Generated analysis output and vendored third-party code (Basis Universal transcoder).
    "analysis/out/**",
    "public/museum/basis/**",
    "db/migrations/**",
    "content/**",
    "docs/**",
  ]),
]);

export default eslintConfig;
