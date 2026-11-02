import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { runCommand } from "./commands.js";
import { openDb } from "./config/db.js";
import { deleteExpiredSessions } from "./services/sessions.js";

// A panel egg may only offer its own variables, so settings can also come from a file.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = process.env.NODE_ENV === "production";

if (!production) {
  console.warn("NODE_ENV is not production: cookies are not Secure. Fine locally, not on a live site.");
}

const dataDir = resolve(backendRoot, process.env.DATA_DIR || "data");
const buildDir = resolve(backendRoot, process.env.STATIC_DIR || "../frontend/dist");
const staticDir = existsSync(buildDir) ? buildDir : null;
const port = process.env.PORT || process.env.SERVER_PORT || 3000;

const db = openDb(join(dataDir, "app.db"));
deleteExpiredSessions(db);

if (!staticDir) {
  console.warn(`No frontend build at ${buildDir}. Only the API will be served.`);
}

const app = createApp({ db, production, staticDir });

const server = app.listen(port, "0.0.0.0", (error) => {
  if (error) {
    throw error;
  }
  console.log(`Listening on port ${server.address().port}`);
});

createInterface({ input: process.stdin }).on("line", (line) => {
  runCommand(db, line, console.log, { dataDir, events: app.locals.events });
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
