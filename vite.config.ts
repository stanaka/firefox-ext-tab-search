import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: "popup.html" },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    globals: true,
    clearMocks: true,
  },
});
