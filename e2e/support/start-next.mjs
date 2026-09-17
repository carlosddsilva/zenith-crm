process.loadEnvFile("e2e/.env.e2e");
process.argv = [
  process.execPath,
  "next",
  "start",
  "-p",
  "3100",
];
await import("next/dist/bin/next");
