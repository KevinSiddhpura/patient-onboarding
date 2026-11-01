let handleUnauthenticated = () => {};

export function onUnauthenticated(handler) {
  handleUnauthenticated = handler;
}

function errorWithCode(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export async function apiRequest(path, { method = "GET", body, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: method === "GET" ? headers : { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw errorWithCode("unavailable");
  }

  if (response.status === 204) {
    return null;
  }

  // Nginx sends an HTML page when the app is down, so the body may not be JSON.
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const code = data?.error?.code ?? "unavailable";
    if (code === "unauthenticated") {
      handleUnauthenticated();
    }
    throw errorWithCode(code);
  }

  return data;
}
