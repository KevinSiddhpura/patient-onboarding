import express from "express";
import { requireSession, requireStaff } from "./middleware.js";

// Clients re-fetch the list on this signal, so patient data always goes through the role checks.
const CHANGED_FRAME = "event: changed\ndata: {}\n\n";
const HEARTBEAT_FRAME = ": ping\n\n";

export function createEventHub({ heartbeatMs = 25000 } = {}) {
  const clients = new Set();
  let heartbeat = null;

  function send(frame) {
    for (const client of clients) {
      client.res.write(frame);
    }
  }

  function stopHeartbeatIfIdle() {
    if (clients.size === 0 && heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  function close(client) {
    clients.delete(client);
    client.res.end();
    stopHeartbeatIfIdle();
  }

  return {
    add({ tokenHash, user }, res) {
      const client = { tokenHash, email: user.email, res };
      clients.add(client);
      res.on("close", () => {
        clients.delete(client);
        stopHeartbeatIfIdle();
      });

      if (!heartbeat) {
        // Nginx closes a connection after 60 seconds of silence by default.
        heartbeat = setInterval(() => send(HEARTBEAT_FRAME), heartbeatMs);
        heartbeat.unref();
      }
    },
    broadcastChanged() {
      send(CHANGED_FRAME);
    },
    closeSession(tokenHash) {
      for (const client of [...clients]) {
        if (client.tokenHash === tokenHash) {
          close(client);
        }
      }
    },
    closeUser(email) {
      for (const client of [...clients]) {
        if (client.email === email) {
          close(client);
        }
      }
    },
    closeAll() {
      for (const client of [...clients]) {
        close(client);
      }
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
    req.app.locals.events.add(req.session, res);
  });

  return router;
}
