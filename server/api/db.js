function createNotImplementedResponse() {
  return {
    status: 501,
    body: {
      error: "SQLite endpoint not implemented yet",
      hint: "Use this route family for persistence and migrations."
    }
  };
}

export function get() {
  return createNotImplementedResponse();
}

export function post() {
  return createNotImplementedResponse();
}
