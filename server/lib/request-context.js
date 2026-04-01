import { AsyncLocalStorage } from "node:async_hooks";

import { normalizePathSegment } from "./app-files.js";

const requestContextStorage = new AsyncLocalStorage();

function normalizePrincipalId(value) {
  const normalized = normalizePathSegment(value);

  if (!normalized || normalized.includes("/")) {
    return "";
  }

  return normalized;
}

function parseCookieHeader(cookieHeader) {
  const cookies = Object.create(null);

  String(cookieHeader || "")
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const equalsIndex = entry.indexOf("=");
      const rawName = equalsIndex >= 0 ? entry.slice(0, equalsIndex) : entry;
      const rawValue = equalsIndex >= 0 ? entry.slice(equalsIndex + 1) : "";
      const name = rawName.trim();

      if (!name) {
        return;
      }

      try {
        cookies[name] = decodeURIComponent(rawValue.trim());
      } catch {
        cookies[name] = rawValue.trim();
      }
    });

  return cookies;
}

function resolveRequestUser(headers) {
  const cookies = parseCookieHeader(headers && headers.cookie);
  const rawUsername = String(cookies.username || "");
  // TODO: Replace this trusted cookie shortcut with real authentication and authorization.
  const username = normalizePrincipalId(rawUsername);

  return {
    cookies,
    user: {
      username,
      rawUsername,
      isAuthenticated: Boolean(username),
      source: username ? "trusted-username-cookie" : "anonymous"
    }
  };
}

function createRequestContext({ req, requestUrl } = {}) {
  const { cookies, user } = resolveRequestUser(req && req.headers);

  return {
    cookies,
    req,
    requestUrl,
    user
  };
}

function runWithRequestContext(requestContext, callback) {
  return requestContextStorage.run(requestContext, callback);
}

function getRequestContext() {
  return requestContextStorage.getStore() || null;
}

function getRequestUser() {
  const context = getRequestContext();

  if (context && context.user) {
    return context.user;
  }

  return {
    username: "",
    rawUsername: "",
    isAuthenticated: false,
    source: "anonymous"
  };
}

export {
  createRequestContext,
  getRequestContext,
  getRequestUser,
  normalizePrincipalId,
  parseCookieHeader,
  runWithRequestContext
};
