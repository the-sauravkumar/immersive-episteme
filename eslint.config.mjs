import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const UTILITY = String.raw`(?:text|bg|border|border-[trblxy]|fill|stroke|decoration|outline|ring|from|to|via|accent|caret|divide|shadow|placeholder)`;
const ATLAS_COLOUR = String.raw`(?:ground|field|sunk|wash|ink|ink-2|ink-3|rule|rule-strong|indigo|indigo-hover|on-indigo|danger|warn|series-2d|series-3d|grid|viz-seq-[1-6]|focus-outer|focus-inner|sans-stack|ochre)`;
const ATLAS_TYPE = String.raw`(?:title|reading|claim-number|quote|lead|h2|h3|label|value|source|caption|credit|ui|timer|id|display-[123]|deck|body|table|stat)`;
const ATLAS_TOKEN = String.raw`(?:(?:^|[\s:!\]])${UTILITY}-${ATLAS_COLOUR}(?=$|[\s!])|var\(--${ATLAS_COLOUR}\)|(?:^|[\s:])text-${ATLAS_TYPE}(?=$|[\s!]))`;
const RAW_PALETTE = String.raw`\b${UTILITY}-(?:emerald|amber|red|green|yellow|blue|slate|gray|zinc|neutral|stone|orange|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b`;
const STUDY_MOTION = String.raw`(?:^|\s|:)(?:transition(?:-[a-z]+|-\[[^\]]+\])?|animate-[a-z\[][^\s]*|duration-[0-9(\[][^\s]*)(?=\s|$)`;

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
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...restricted(ATLAS_TOKEN, "Atlas tokens are retired (DR-119): use the DESIGN.md Section 4 and 5 tokens (vat, lime, turmeric, madder, t-b ...)."),
        ...restricted(RAW_PALETTE, "Raw Tailwind palette colours are not allowed: use the DESIGN.md Section 4 tokens."),
      ],
    },
  },
  {
    files: [
      "src/app/(learning)/**/*.{ts,tsx}",
      "src/app/(study)/**/*.{ts,tsx}",
      "src/components/knowledge/**/*.{ts,tsx}",
      "src/components/learning/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...restricted(ATLAS_TOKEN, "Atlas tokens are retired (DR-119): use the DESIGN.md Section 4 and 5 tokens."),
        ...restricted(RAW_PALETTE, "Raw Tailwind palette colours are not allowed: use the DESIGN.md Section 4 tokens."),
        ...restricted(STUDY_MOTION, "Study mode has zero motion: no transition or animate utilities here."),
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "analysis/out/**",
    "public/museum/basis/**",
    "db/migrations/**",
    "content/**",
    "docs/**",
    "tools/walkthrough-lab/*.cjs",
    ".claude/**",
  ]),
]);

export default eslintConfig;
