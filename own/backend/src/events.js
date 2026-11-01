import express from "express";
import { requireSession, requireStaff } from "./middleware.js";

// Clients re-fetch the list on this signal, so patient data always goes through the role checks.
const CHANGED_FRAME = "event: changed\ndata: {}\n\n";
const HEARTBEAT_FRAME = ": ping\n\n";

export function createEventHub({ heartbeatMs = 25000 } = {}) {
  const clients = new Set();

  function closeMatching(matches) {
    for (const client of clients) {
      if (matches(client)) {
        clients.delete(client);
        client.res.end();
      }
    }
  }

  // Nginx closes a connection after 60 seconds of silence by default.
  setInterval(() => {
    for (const client of clients) {
      client.res.write(HEARTBEAT_FRAME);
    }
  }, heartbeatMs).unref();

  return {
    add({ tokenHash, user }, clientId, res) {
      const client = { tokenHash, email: user.email, clientId, res };
      clients.add(client);
      res.on("close", () => clients.delete(client));
    },
    // The tab that made the change has already fetched the list itself.
    broadcastChanged(writerClientId) {
      for (const client of clients) {
        if (!writerClientId || client.clientId !== writerClientId) {
          client.res.write(CHANGED_FRAME);
        }
      }
    },
    closeSession(tokenHash) {
      closeMatching((client) => client.tokenHash === tokenHash);
    },
    closeUser(email) {
      closeMatching((client) => client.email === email);
    },
    closeAll() {
      closeMatching(() => true);
    },
    size() {
      return clients.size;
    },
  };
}

export function createEventsRouter() {
  const router = express.Router();

  router.get("/", requireSession, requireStaff, (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    req.app.locals.events.add(req.session, req.query.client, res);
  });

  return router;
}
