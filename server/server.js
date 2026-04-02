import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentServer } from "./app.js";

async function startServer(overrides = {}) {
  const app = await createAgentServer(overrides);
  await app.listen();
  return app;
}

async function runServeCli(overrides = {}) {
  const app = await startServer(overrides);
  console.log(`space server listening at ${app.browserUrl}`);
  return app;
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  runServeCli().catch((error) => {
    console.error("Failed to start space server.");
    console.error(error);
    process.exit(1);
  });
}

export { runServeCli, startServer };
