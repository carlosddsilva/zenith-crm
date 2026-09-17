import { resolve } from "node:path";

process.loadEnvFile("e2e/.env.e2e");
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = resolve(
  "e2e/support/google-font-mock.cjs",
);
process.argv = [
  process.execPath,
  "next",
  "build",
  "--webpack",
];
await import("next/dist/bin/next");
