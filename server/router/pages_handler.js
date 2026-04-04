import fs from "node:fs/promises";
import path from "node:path";

import { sendFile, sendJson, sendNotFound, sendRedirect } from "./responses.js";

const LEGACY_ROUTE_REDIRECTS = new Map([
  ["/index.html", "/"],
  ["/login.html", "/login"],
  ["/admin.html", "/admin"]
]);

const LOGOUT_ROUTE = "/logout";
const PAGE_RESOURCE_PREFIX = "/pages/res/";
const FRONTEND_CONFIG_META_NAME = "space-config";

function createSessionCleanupHeaders(requestContext, auth) {
  if (
    requestContext?.user?.shouldClearSessionCookie &&
    auth &&
    typeof auth.createClearedSessionCookieHeader === "function"
  ) {
    return {
      "Set-Cookie": auth.createClearedSessionCookieHeader()
    };
  }

  return {};
}

function createClearedSessionHeaders(auth) {
  if (auth && typeof auth.createClearedSessionCookieHeader === "function") {
    return {
      "Set-Cookie": auth.createClearedSessionCookieHeader()
    };
  }

  return {};
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function buildFrontendConfigMetaTags(runtimeParams) {
  const entries =
    runtimeParams && typeof runtimeParams.listFrontendExposed === "function"
      ? runtimeParams.listFrontendExposed()
      : [];

  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(
      (entry) =>
        `    <meta name="${FRONTEND_CONFIG_META_NAME}" data-space-param="${escapeHtmlAttribute(entry.name)}" data-space-type="${escapeHtmlAttribute(entry.type)}" content="${escapeHtmlAttribute(entry.content)}" />`
    )
    .join("\n");
}

function injectFrontendConfigMetaTags(sourceText, runtimeParams) {
  const metaTags = buildFrontendConfigMetaTags(runtimeParams);

  if (!metaTags) {
    return sourceText;
  }

  if (/<\/head>/iu.test(sourceText)) {
    return sourceText.replace(/<\/head>/iu, `${metaTags}\n  </head>`);
  }

  return `${metaTags}\n${sourceText}`;
}

async function sendPageHtml(res, filePath, options = {}) {
  let sourceText;

  try {
    sourceText = await fs.readFile(filePath, "utf8");
  } catch {
    sendNotFound(res, options.headers);
    return;
  }

  const body = injectFrontendConfigMetaTags(sourceText, options.runtimeParams);

  res.writeHead(200, {
    ...(options.headers || {}),
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/html; charset=utf-8"
  });
  res.end(body);
}

async function handleLogoutRequest(res, options = {}) {
  const { auth, requestContext } = options;

  try {
    if (
      requestContext?.user?.isAuthenticated &&
      auth &&
      typeof auth.revokeSession === "function"
    ) {
      await auth.revokeSession(requestContext.user.sessionToken, requestContext.user.username);
    }
  } catch {
    sendJson(res, 500, {
      error: "Internal server error"
    });
    return;
  }

  sendRedirect(res, "/login", createClearedSessionHeaders(auth));
}

function resolvePathWithinRoot(rootDir, requestPath) {
  const filePath = path.resolve(rootDir, `.${requestPath}`);
  const relativePath = path.relative(rootDir, filePath);

  if (
    relativePath === "" ||
    relativePath === "." ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return filePath;
}

function resolvePageRequest(pagesDir, pathname) {
  const normalizedPath = path.posix.normalize(pathname || "/");

  if (LEGACY_ROUTE_REDIRECTS.has(normalizedPath)) {
    return {
      kind: "redirect",
      location: LEGACY_ROUTE_REDIRECTS.get(normalizedPath)
    };
  }

  if (normalizedPath !== "/" && normalizedPath.endsWith("/")) {
    return {
      kind: "redirect",
      location: normalizedPath.slice(0, -1)
    };
  }

  const pageName =
    normalizedPath === "/"
      ? "index.html"
      : normalizedPath.match(/^\/([a-z0-9_-]+)$/i)?.[1]
        ? `${normalizedPath.slice(1)}.html`
        : "";

  if (!pageName) {
    return null;
  }

  return {
    filePath: resolvePathWithinRoot(pagesDir, `/${pageName}`),
    kind: "file",
    pageName
  };
}

function resolvePageResourceRequest(pagesDir, pathname) {
  const normalizedPath = path.posix.normalize(pathname || "/");

  if (!normalizedPath.startsWith(PAGE_RESOURCE_PREFIX)) {
    return null;
  }

  return {
    filePath: resolvePathWithinRoot(pagesDir, normalizedPath.slice("/pages".length)),
    kind: "resource"
  };
}

async function handlePageRequest(res, requestUrl, options = {}) {
  const { auth, pagesDir, requestContext, runtimeParams } = options;

  if (requestUrl.pathname === LOGOUT_ROUTE) {
    await handleLogoutRequest(res, options);
    return;
  }

  const pageResourceRequest = resolvePageResourceRequest(pagesDir, requestUrl.pathname);

  if (pageResourceRequest) {
    if (!pageResourceRequest.filePath) {
      sendNotFound(res, createSessionCleanupHeaders(requestContext, auth));
      return;
    }

    sendFile(res, pageResourceRequest.filePath, {
      headers: createSessionCleanupHeaders(requestContext, auth)
    });
    return;
  }

  const pageRequest = resolvePageRequest(pagesDir, requestUrl.pathname);

  if (!pageRequest) {
    sendNotFound(res);
    return;
  }

  if (pageRequest.kind === "redirect") {
    sendRedirect(res, pageRequest.location, createSessionCleanupHeaders(requestContext, auth));
    return;
  }

  const isLoginPage = pageRequest.pageName === "login.html";

  if (isLoginPage && requestContext?.user?.isAuthenticated) {
    sendRedirect(res, "/", createSessionCleanupHeaders(requestContext, auth));
    return;
  }

  if (!isLoginPage && !requestContext?.user?.isAuthenticated) {
    sendRedirect(res, "/login", createSessionCleanupHeaders(requestContext, auth));
    return;
  }

  if (!pageRequest.filePath) {
    sendNotFound(res);
    return;
  }

  await sendPageHtml(res, pageRequest.filePath, {
    headers: createSessionCleanupHeaders(requestContext, auth),
    runtimeParams
  });
}

export { handlePageRequest };
