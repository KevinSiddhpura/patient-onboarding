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

  setInterval(() => {
    for (const client of clients) {
      client.res.write(HEARTBEAT_FRAME);
    }
  }, heartbeatMs).unref();

  return {
    add({ token, user }, clientId, res) {
      const client = { token, email: user.email, clientId, res };
      clients.add(client);
      res.on("close", () => clients.delete(client));
    },
    broadcastChanged(writerClientId) {
      for (const client of clients) {
        if (!writerClientId || client.clientId !== writerClientId) {
          client.res.write(CHANGED_FRAME);
        }
      }
    },
    closeSession(token) {
      closeMatching((client) => client.token === token);
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
