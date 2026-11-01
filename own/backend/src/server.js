import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { runCommand } from "./commands.js";
import { openDb } from "./db.js";
import { deleteExpiredSessions } from "./sessions.js";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = process.env.NODE_ENV === "production";
const proxySecret = process.env.PROXY_SECRET || null;

if (production && !proxySecret) {
  console.error("PROXY_SECRET must be set in production.");
  process.exit(1);
}

const dataDir = resolve(backendRoot, process.env.DATA_DIR || "data");
const staticDir = resolve(backendRoot, process.env.STATIC_DIR || "../frontend/dist");
const port = process.env.PORT || process.env.SERVER_PORT || 3000;

const db = openDb(join(dataDir, "app.db"));
deleteExpiredSessions(db);

if (!existsSync(staticDir)) {
  console.warn(`No frontend build at ${staticDir}. Only the API will be served.`);
}

const app = createApp({
  db,
  production,
  proxySecret,
  staticDir: existsSync(staticDir) ? staticDir : null,
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Listening on port ${server.address().port}`);
});

// The Pterodactyl console writes to stdin, and there is no shell to run scripts from.
createInterface({ input: process.stdin }).on("line", (line) => {
  runCommand(db, line, console.log, { dataDir });
});

function shutDown() {
  app.locals.events.closeAll();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeAllConnections();
}

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
