import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" → "src/*" path alias.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Only run engine unit tests here (Node env, no browser/DOM needed).
    include: ["src/lib/**/*.test.ts"],
    environment: "node",
  },
});
