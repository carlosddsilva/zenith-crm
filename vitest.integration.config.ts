import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(base, defineConfig({
  test: {
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      RUN_DB_TESTS: "true",
    },
  },
}));
