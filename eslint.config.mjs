import nextPlugin from "@next/eslint-plugin-next";
import tsParser from "@typescript-eslint/parser";

const eslintConfig = [
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-unused-vars": "off",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "react/no-unknown-property": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  }
];

export default eslintConfig;
