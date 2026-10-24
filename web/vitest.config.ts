import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    // K-module suites (copy, tint, cards, ds) use node:test with their own runners: `npm run test:modules`.
    exclude: ["node_modules/**", ".next/**", "e2e/**", "components/cards/**", "lib/copy/**", "lib/tint/**",
              "components/ds/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
