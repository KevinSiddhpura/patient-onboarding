import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";
import { afterEach, beforeEach, describe, test } from "node:test";
import { formatTimestamp } from "../../src/formatters.js";

const ROW = {
  id: "p1",
  patientId: "p1",
  name: "Asha",
  phone: "1",
  condition: "Fever",
  createdAt: "2026-10-03T10:00:00.000Z",
  updatedAt: "2026-10-03T11:00:00.000Z",
};

let routes;
let requests;
let eventSources;
let importCount = 0;

class FakeEventSource {
  static CLOSED = 2;

  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.listeners = {};
    eventSources.push(this);
  }

  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }

  close() {
    this.closed = true;
  }

  emit(name) {
    this.listeners[name]?.();
  }
}

function jsonResponse(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function errorResponse(status, code) {
  return jsonResponse(status, { error: { code } });
}

beforeEach(() => {
  routes = {};
  requests = [];
  eventSources = [];
  globalThis.EventSource = FakeEventSource;
  globalThis.fetch = async (url, options = {}) => {
    const key = `${options.method ?? "GET"} ${url}`;
    requests.push({ key, options });
    const route = routes[key];
    if (!route) {
      throw new TypeError("network down");
    }
    return route();
  };
});

afterEach(() => {
  delete globalThis.EventSource;
  delete globalThis.fetch;
});

// The query string gives each test its own copy of the module's state.
const fresh = (name) => {
  importCount += 1;
  return import(`../../src/services/${name}.js?test=${importCount}`);
};

const countOf = (key) => requests.filter((request) => request.key === key).length;

async function settle() {
  for (let round = 0; round < 10; round += 1) {
    await tick();
  }
}

describe("apiRequest", () => {
  test("error responses throw with the server's code", async () => {
    const { apiRequest } = await fresh("api");
    routes["GET /api/x"] = () => errorResponse(403, "permission-denied");
    await assert.rejects(apiRequest("/x"), { code: "permission-denied" });
  });

  test("a failed fetch throws code unavailable", async () => {
    const { apiRequest } = await fresh("api");
    await assert.rejects(apiRequest("/x"), { code: "unavailable" });
  });

  test("a non-JSON error page throws code unavailable", async () => {
    const { apiRequest } = await fresh("api");
    routes["GET /api/x"] = () => new Response("<html>Bad Gateway</html>", { status: 502 });
    await assert.rejects(apiRequest("/x"), { code: "unavailable" });
  });

  test("non-GET sends a JSON content type, including with no body", async () => {
    const { apiRequest } = await fresh("api");
    routes["DELETE /api/x"] = () => jsonResponse(204);

    assert.equal(await apiRequest("/x", { method: "DELETE" }), null);

    assert.equal(requests[0].options.headers["Content-Type"], "application/json");
    assert.equal(requests[0].options.body, undefined);
  });

  test("the body is sent as JSON", async () => {
    const { apiRequest } = await fresh("api");
    routes["POST /api/x"] = () => jsonResponse(200, { ok: true });

    assert.deepEqual(await apiRequest("/x", { method: "POST", body: { a: 1 } }), { ok: true });

    assert.equal(requests[0].options.body, '{"a":1}');
  });
});

describe("auth", () => {
  const USER = { uid: "u1", email: "doc@example.test" };

  test("watchAuthState calls back with the user from /auth/me", async () => {
    const { watchAuthState, currentUserId } = await fresh("auth");
    routes["GET /api/auth/me"] = () => jsonResponse(200, { user: USER });
    const seen = [];

    watchAuthState((user) => seen.push(user));
    await settle();

    assert.deepEqual(seen, [USER]);
    assert.equal(currentUserId(), "u1");
  });

  test("watchAuthState calls back with null when signed out", async () => {
    const { watchAuthState } = await fresh("auth");
    routes["GET /api/auth/me"] = () => jsonResponse(200, { user: null });
    const seen = [];

    watchAuthState((user) => seen.push(user));
    await settle();

    assert.deepEqual(seen, [null]);
  });

  test("a network failure on /auth/me reports an error instead of signing out", async () => {
    const { watchAuthState } = await fresh("auth");
    const seen = [];
    const errors = [];

    watchAuthState((user) => seen.push(user), (error) => errors.push(error));
    await settle();

    assert.deepEqual(seen, []);
    assert.equal(errors[0].code, "unavailable");
  });

  test("a server error on /auth/me reports an error instead of signing out", async () => {
    const { watchAuthState } = await fresh("auth");
    routes["GET /api/auth/me"] = () => errorResponse(500, "internal");
    const seen = [];
    const errors = [];

    watchAuthState((user) => seen.push(user), (error) => errors.push(error));
    await settle();

    assert.deepEqual(seen, []);
    assert.equal(errors[0].code, "internal");
  });

  test("no error callback after unsubscribing", async () => {
    const { watchAuthState } = await fresh("auth");
    const errors = [];

    const unsubscribe = watchAuthState(() => {}, (error) => errors.push(error));
    unsubscribe();
    await settle();

    assert.deepEqual(errors, []);
  });

  test("no callback after unsubscribing while /auth/me is pending", async () => {
    const { watchAuthState } = await fresh("auth");
    routes["GET /api/auth/me"] = () => jsonResponse(200, { user: USER });
    const seen = [];

    const unsubscribe = watchAuthState((user) => seen.push(user));
    unsubscribe();
    await settle();

    assert.deepEqual(seen, []);
  });

  test("subscribing again checks the session again", async () => {
    const { watchAuthState } = await fresh("auth");
    routes["GET /api/auth/me"] = () => jsonResponse(200, { user: USER });

    watchAuthState(() => {})();
    watchAuthState(() => {});
    await settle();

    assert.equal(countOf("GET /api/auth/me"), 2);
  });

  test("logIn notifies watchers and sets currentUserId before the callback", async () => {
    const { logIn, watchAuthState, currentUserId } = await fresh("auth");
    routes["GET /api/auth/me"] = () => jsonResponse(200, { user: null });
    routes["POST /api/auth/login"] = () => jsonResponse(200, USER);
    const seen = [];
    watchAuthState((user) => seen.push([user, currentUserId()]));
    await settle();

    await logIn("doc@example.test", "password");

    assert.deepEqual(seen.at(-1), [USER, "u1"]);
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
      email: "doc@example.test",
      password: "password",
    });
  });

  test("failed login throws auth/invalid-credential and does not notify", async () => {
    const { logIn, watchAuthState } = await fresh("auth");
    routes["GET /api/auth/me"] = () => jsonResponse(200, { user: null });
    routes["POST /api/auth/login"] = () => errorResponse(401, "auth/invalid-credential");
    const seen = [];
    watchAuthState((user) => seen.push(user));
    await settle();

    await assert.rejects(logIn("doc@example.test", "wrong"), { code: "auth/invalid-credential" });

    assert.deepEqual(seen, [null]);
  });

  test("any later unauthenticated response signs out", async () => {
    const { watchAuthState, currentUserId } = await fresh("auth");
    const { apiRequest } = await import("../../src/services/api.js");
    routes["GET /api/auth/me"] = () => jsonResponse(200, { user: USER });
    routes["GET /api/patients"] = () => errorResponse(401, "unauthenticated");
    const seen = [];
    watchAuthState((user) => seen.push(user));
    await settle();

    await assert.rejects(apiRequest("/patients"), { code: "unauthenticated" });

    assert.deepEqual(seen, [USER, null]);
    assert.equal(currentUserId(), null);
  });

  async function signedIn() {
    const auth = await fresh("auth");
    routes["GET /api/auth/me"] = () => jsonResponse(200, { user: USER });
    const seen = [];
    auth.watchAuthState((user) => seen.push(user));
    await settle();
    return { ...auth, seen };
  }

  test("logOut clears the user and notifies watchers", async () => {
    const { logOut, seen, currentUserId } = await signedIn();
    routes["POST /api/auth/logout"] = () => jsonResponse(204);

    await logOut();

    assert.deepEqual(seen.at(-1), null);
    assert.equal(currentUserId(), null);
  });

  test("logOut treats 401 as already signed out", async () => {
    const { logOut, seen } = await signedIn();
    routes["POST /api/auth/logout"] = () => errorResponse(401, "unauthenticated");

    await logOut();

    assert.deepEqual(seen.at(-1), null);
  });

  test("logOut on a network failure rejects and stays signed in", async () => {
    const { logOut, seen, currentUserId } = await signedIn();

    await assert.rejects(logOut(), { code: "unavailable" });

    assert.deepEqual(seen, [USER]);
    assert.equal(currentUserId(), "u1");
  });
});

describe("users", () => {
  test("fetchUserProfile returns the profile, or null", async () => {
    const { fetchUserProfile } = await fresh("users");
    routes["GET /api/users/u1"] = () => jsonResponse(200, { name: "Asha", role: "doctor" });
    routes["GET /api/users/u2"] = () => jsonResponse(200, null);

    assert.deepEqual(await fetchUserProfile("u1"), { name: "Asha", role: "doctor" });
    assert.equal(await fetchUserProfile("u2"), null);
  });
});

describe("patients", () => {
  const LIST = "GET /api/patients";

  async function subscribed() {
    const patients = await fresh("patients");
    routes[LIST] = () => jsonResponse(200, [ROW]);
    const delivered = [];
    const errors = [];
    const unsubscribe = patients.subscribeToPatients(
      (list) => delivered.push(list),
      (error) => errors.push(error),
    );
    eventSources[0].emit("open");
    await settle();
    return { ...patients, delivered, errors, unsubscribe, source: eventSources[0] };
  }

  test("timestamps gain toDate() returning the right Date", async () => {
    const { delivered } = await subscribed();
    const [patient] = delivered[0];

    assert.equal(patient.createdAt.toDate().toISOString(), ROW.createdAt);
    assert.equal(formatTimestamp(patient.updatedAt), new Date(ROW.updatedAt).toLocaleString());
    assert.equal(patient.name, "Asha");
  });

  test("subscribe delivers the list and opens /api/events", async () => {
    const { delivered, source } = await subscribed();
    assert.equal(delivered.length, 1);
    assert.match(source.url, /^\/api\/events\?client=.+/);
  });

  test("mounting fetches the list once, after the stream is open", async () => {
    const { subscribeToPatients } = await fresh("patients");
    routes[LIST] = () => jsonResponse(200, [ROW]);

    subscribeToPatients(() => {}, () => {});
    await settle();
    assert.equal(countOf(LIST), 0);

    eventSources[0].emit("open");
    await settle();
    assert.equal(countOf(LIST), 1);
  });

  test("the list still loads if the stream fails before it opens", async () => {
    const { subscribeToPatients } = await fresh("patients");
    routes[LIST] = () => jsonResponse(200, [ROW]);
    const delivered = [];

    subscribeToPatients((list) => delivered.push(list), () => {});
    eventSources[0].readyState = 0;
    eventSources[0].emit("error");
    await settle();

    assert.equal(delivered.length, 1);
  });

  test("a stream error while it retries does not fetch again once the list is loaded", async () => {
    const { source } = await subscribed();
    const before = countOf(LIST);

    source.readyState = 0;
    source.emit("error");
    await settle();

    assert.equal(countOf(LIST), before);
  });

  test("writes send the same client id as the stream", async () => {
    const { createPatient, updatePatient, deletePatient, source } = await subscribed();
    routes["POST /api/patients"] = () => jsonResponse(201, { id: "p2" });
    routes["PUT /api/patients/p1"] = () => jsonResponse(200, { id: "p1" });
    routes["DELETE /api/patients/p1"] = () => jsonResponse(204);
    const clientId = source.url.split("client=")[1];

    await createPatient({ name: "B", phone: "2", condition: "C" });
    await updatePatient("p1", { name: "A", phone: "1", condition: "C" });
    await deletePatient("p1");

    for (const key of ["POST /api/patients", "PUT /api/patients/p1", "DELETE /api/patients/p1"]) {
      const request = requests.find((entry) => entry.key === key);
      assert.equal(request.options.headers["X-Client-Id"], clientId);
    }
  });

  test("a write fetches the list once", async () => {
    const { createPatient } = await subscribed();
    routes["POST /api/patients"] = () => jsonResponse(201, { id: "p2" });
    const before = countOf(LIST);

    await createPatient({ name: "B", phone: "2", condition: "C" });
    await settle();

    assert.equal(countOf(LIST), before + 1);
  });

  test("a changed event fetches the list again", async () => {
    const { delivered, source } = await subscribed();
    routes[LIST] = () => jsonResponse(200, []);

    source.emit("changed");
    await settle();

    assert.deepEqual(delivered.at(-1), []);
  });

  test("unsubscribe closes the EventSource and stops callbacks", async () => {
    const { delivered, source, unsubscribe } = await subscribed();

    unsubscribe();
    source.emit("changed");
    await settle();

    assert.equal(source.closed, true);
    assert.equal(delivered.length, 1);
  });

  test("a slower older response can't overwrite a newer one", async () => {
    const { delivered, source } = await subscribed();
    let finishOld;
    routes[LIST] = () =>
      new Promise((resolve) => {
        finishOld = () => resolve(jsonResponse(200, [{ ...ROW, name: "Old" }]));
      });
    source.emit("changed");
    await settle();

    routes[LIST] = () => jsonResponse(200, [{ ...ROW, name: "New" }]);
    source.emit("changed");
    await settle();
    finishOld();
    await settle();

    assert.equal(delivered.at(-1)[0].name, "New");
  });

  test("initial fetch failure calls onError", async () => {
    const { subscribeToPatients } = await fresh("patients");
    const errors = [];

    subscribeToPatients(() => {}, (error) => errors.push(error));
    eventSources[0].emit("open");
    await settle();

    assert.equal(errors[0].code, "unavailable");
  });

  test("later refresh failure keeps the current list and doesn't call onError", async (t) => {
    t.mock.method(console, "error", () => {});
    const { delivered, errors, source } = await subscribed();
    delete routes[LIST];

    source.emit("changed");
    await settle();

    assert.equal(delivered.length, 1);
    assert.deepEqual(errors, []);
  });

  test("EventSource open fetches again, to catch up after a reconnect", async () => {
    const { source } = await subscribed();
    const before = countOf(LIST);

    source.emit("open");
    await settle();

    assert.equal(countOf(LIST), before + 1);
  });

  test("EventSource CLOSED reopens after 5 seconds and fetches again", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { source } = await subscribed();
    const before = countOf(LIST);

    source.readyState = FakeEventSource.CLOSED;
    source.emit("error");
    await settle();
    assert.equal(countOf(LIST), before + 1);
    assert.equal(eventSources.length, 1);

    t.mock.timers.tick(5000);
    assert.equal(eventSources.length, 2);
    eventSources[1].emit("open");
    await settle();
    assert.equal(countOf(LIST), before + 2);
  });

  test("an EventSource error while it is retrying by itself does not open a second one", async () => {
    const { source } = await subscribed();

    source.readyState = 0;
    source.emit("error");
    await settle();

    assert.equal(eventSources.length, 1);
  });

  test("unsubscribing cancels a pending reopen", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { source, unsubscribe } = await subscribed();

    source.readyState = FakeEventSource.CLOSED;
    source.emit("error");
    await settle();
    unsubscribe();
    t.mock.timers.tick(5000);

    assert.equal(eventSources.length, 1);
  });

  test("an expired session during refresh signs out", async () => {
    const auth = await fresh("auth");
    const { source } = await subscribed();
    routes["GET /api/auth/me"] = () => jsonResponse(200, { user: { uid: "u1", email: "a@b.c" } });
    const seen = [];
    auth.watchAuthState((user) => seen.push(user));
    await settle();
    routes[LIST] = () => errorResponse(401, "unauthenticated");

    source.emit("changed");
    await settle();

    assert.equal(seen.at(-1), null);
    assert.equal(auth.currentUserId(), null);
  });

  test("deletePatient removes the row locally even if the follow-up fetch fails, and resolves", async (t) => {
    t.mock.method(console, "error", () => {});
    const { deletePatient, delivered } = await subscribed();
    routes["DELETE /api/patients/p1"] = () => jsonResponse(204);
    delete routes[LIST];

    await deletePatient("p1");

    assert.deepEqual(delivered.at(-1), []);
  });

  test("a failed delete rejects and keeps the row", async () => {
    const { deletePatient, delivered } = await subscribed();
    routes["DELETE /api/patients/p1"] = () => errorResponse(403, "permission-denied");

    await assert.rejects(deletePatient("p1"), { code: "permission-denied" });

    assert.equal(delivered.at(-1).length, 1);
  });

  test("createPatient returns the id after the refreshed list has been delivered", async () => {
    const { createPatient, delivered } = await subscribed();
    routes["POST /api/patients"] = () => jsonResponse(201, { id: "p2" });
    routes[LIST] = () => jsonResponse(200, [{ ...ROW, id: "p2" }, ROW]);

    assert.equal(await createPatient({ name: "B", phone: "2", condition: "C" }), "p2");

    assert.equal(delivered.at(-1).length, 2);
  });

  test("updatePatient resolves after the refreshed list has been delivered", async () => {
    const { updatePatient, delivered } = await subscribed();
    routes["PUT /api/patients/p1"] = () => jsonResponse(200, { id: "p1" });
    routes[LIST] = () => jsonResponse(200, [{ ...ROW, condition: "Recovered" }]);

    await updatePatient("p1", { name: "Asha", phone: "1", condition: "Recovered" });

    assert.equal(delivered.at(-1)[0].condition, "Recovered");
  });

  test("create and update resolve when the write works but the refresh fails", async (t) => {
    t.mock.method(console, "error", () => {});
    const { createPatient, updatePatient } = await subscribed();
    routes["POST /api/patients"] = () => jsonResponse(201, { id: "p2" });
    routes["PUT /api/patients/p1"] = () => jsonResponse(200, { id: "p1" });
    delete routes[LIST];

    assert.equal(await createPatient({ name: "B", phone: "2", condition: "C" }), "p2");
    await updatePatient("p1", { name: "Asha", phone: "1", condition: "Recovered" });
  });

  test("update of a missing patient rejects with code not-found", async () => {
    const { updatePatient } = await subscribed();
    routes["PUT /api/patients/gone"] = () => errorResponse(404, "not-found");

    await assert.rejects(updatePatient("gone", { name: "A", phone: "1", condition: "C" }), {
      code: "not-found",
    });
  });
});

describe("config", () => {
  test("readShowDeleteButton is false before any fetch", async () => {
    const { readShowDeleteButton } = await fresh("config");
    assert.equal(readShowDeleteButton(), false);
  });

  test("refreshConfig stores the value", async () => {
    const { refreshConfig, readShowDeleteButton } = await fresh("config");
    routes["GET /api/config"] = () => jsonResponse(200, { show_delete_button: true });

    await refreshConfig();

    assert.equal(readShowDeleteButton(), true);
  });

  test("a failed refresh rejects and keeps the last value", async () => {
    const { refreshConfig, readShowDeleteButton } = await fresh("config");
    routes["GET /api/config"] = () => jsonResponse(200, { show_delete_button: true });
    await refreshConfig();
    delete routes["GET /api/config"];

    await assert.rejects(refreshConfig(), { code: "unavailable" });

    assert.equal(readShowDeleteButton(), true);
  });
});
