import { startServer } from "../server/server.js";

function parseServeArgs(args) {
  const overrides = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--host") {
      overrides.host = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--port") {
      overrides.port = Number(args[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown serve argument: ${arg}`);
  }

  if (overrides.port !== undefined && !Number.isFinite(overrides.port)) {
    throw new Error("Serve port must be a valid number.");
  }

  return overrides;
}

export const help = {
  name: "serve",
  summary: "Start the local Space Agent server.",
  usage: [
    "node space serve",
    "node space serve --host 0.0.0.0 --port 3000"
  ],
  description:
    "Starts the local Node server that serves the browser app and proxies fetch requests.",
  options: [
    {
      flag: "--host <host>",
      description: 'Bind host. Defaults to env HOST or "0.0.0.0".'
    },
    {
      flag: "--port <port>",
      description: "Bind port. Defaults to env PORT or 3000."
    }
  ],
  examples: [
    "node space serve",
    "node space serve --host 127.0.0.1 --port 3100"
  ]
};

export async function execute(context) {
  const overrides = parseServeArgs(context.args);
  const server = await startServer(overrides);

  console.log(`space server listening at ${server.browserUrl}`);
  return 0;
}
