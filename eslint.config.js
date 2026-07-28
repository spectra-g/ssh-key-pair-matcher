import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      ".lighthouseci/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: {
        document: "readonly",
      },
    },
  },
  {
    files: ["tests/**/*.ts", "*.config.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
  },
  {
    files: ["*.cjs"],
    languageOptions: {
      globals: {
        module: "readonly",
      },
    },
  },
);
