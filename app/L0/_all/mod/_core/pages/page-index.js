import {
  normalizeIconHexColor,
  normalizeMaterialSymbolName
} from "/mod/_core/visual/icons/material-symbols.js";
import { normalizeRoutePath } from "/mod/_core/router/route-path.js";

const PAGE_EXTENSION_POINT = "pages";
const PAGE_EXTENSION_FILTERS = Object.freeze(["*.yaml", "*.yml"]);
const DEFAULT_PAGE_ICON = "web";
const DEFAULT_PAGE_COLOR = "#94bcff";

function getRuntime() {
  const runtime = globalThis.space;

  if (!runtime || typeof runtime !== "object") {
    throw new Error("Space runtime is not available.");
  }

  if (!runtime.api || typeof runtime.api.call !== "function") {
    throw new Error("space.api.call is not available.");
  }

  if (
    !runtime.utils ||
    typeof runtime.utils !== "object" ||
    !runtime.utils.yaml ||
    typeof runtime.utils.yaml.parse !== "function"
  ) {
    throw new Error("space.utils.yaml.parse is not available.");
  }

  return runtime;
}

function collapseWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizePageName(value) {
  return collapseWhitespace(value);
}

function normalizePageDescription(value) {
  return collapseWhitespace(value);
}

function normalizePageIcon(value) {
  return normalizeMaterialSymbolName(value) || DEFAULT_PAGE_ICON;
}

function normalizePageColor(value) {
  return normalizeIconHexColor(value) || DEFAULT_PAGE_COLOR;
}

function normalizeModuleRoutePath(requestPath) {
  const normalizedRequestPath = String(requestPath || "").trim().replace(/^\/+/u, "");
  const match = normalizedRequestPath.match(/^mod\/([^/]+)\/([^/]+)\/(.+)$/u);

  if (!match) {
    return "";
  }

  const [, authorId, repositoryId, rawModulePath] = match;
  const modulePath = String(rawModulePath || "")
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "");

  if (!modulePath) {
    return "";
  }

  if (modulePath === "view.html") {
    return authorId === "_core" ? repositoryId : `${authorId}/${repositoryId}`;
  }

  if (modulePath.endsWith("/view.html")) {
    const featurePath = modulePath.slice(0, -"/view.html".length);
    return authorId === "_core"
      ? `${repositoryId}/${featurePath}`
      : `${authorId}/${repositoryId}/${featurePath}`;
  }

  return authorId === "_core"
    ? `${repositoryId}/${modulePath}`
    : `${authorId}/${repositoryId}/${modulePath}`;
}

export function normalizePageRoutePath(value) {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return "";
  }

  if (/^\/?mod\//u.test(rawValue)) {
    return normalizeRoutePath(normalizeModuleRoutePath(rawValue));
  }

  return normalizeRoutePath(rawValue);
}

function parseManifestRequestPath(requestPath) {
  const normalizedRequestPath = String(requestPath || "").trim();
  const match = normalizedRequestPath.match(/^\/mod\/([^/]+)\/([^/]+)\/ext\/pages\/(.+\.(?:ya?ml))$/iu);

  if (!match) {
    return {
      id: normalizedRequestPath,
      manifestPath: normalizedRequestPath,
      modulePath: ""
    };
  }

  return {
    id: normalizedRequestPath,
    manifestPath: normalizedRequestPath,
    modulePath: `/mod/${match[1]}/${match[2]}`
  };
}

export function normalizePageManifest(manifest = {}, options = {}) {
  const normalizedManifest =
    manifest && typeof manifest === "object" && !Array.isArray(manifest)
      ? manifest
      : {};
  const routePath = normalizePageRoutePath(
    normalizedManifest.path ?? normalizedManifest.route ?? normalizedManifest.href
  );

  if (!routePath) {
    throw new Error("Page manifest is missing a valid path.");
  }

  const name = normalizePageName(normalizedManifest.name ?? normalizedManifest.title);

  if (!name) {
    throw new Error("Page manifest is missing a valid name.");
  }

  return {
    color: normalizePageColor(
      normalizedManifest.color ??
      normalizedManifest.icon_color ??
      normalizedManifest.iconColor
    ),
    description: normalizePageDescription(
      normalizedManifest.description ?? normalizedManifest.summary
    ),
    icon: normalizePageIcon(normalizedManifest.icon),
    id: String(options.id || options.manifestPath || routePath),
    manifestPath: String(options.manifestPath || ""),
    modulePath: String(options.modulePath || ""),
    name,
    routePath
  };
}

async function listPageManifestPaths() {
  const runtime = getRuntime();
  const response = await runtime.api.call("extensions_load", {
    body: {
      extension_point: PAGE_EXTENSION_POINT,
      filters: [...PAGE_EXTENSION_FILTERS]
    },
    method: "POST"
  });

  return Array.isArray(response?.extensions)
    ? response.extensions.filter((value) => typeof value === "string" && value.trim())
    : [];
}

export async function loadPageManifest(manifestPath) {
  const runtime = getRuntime();
  const response = await fetch(manifestPath, {
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw new Error(`Unable to read ${manifestPath}: ${response.status} ${response.statusText}`);
  }

  const manifestSource = await response.text();
  const parsedManifest = runtime.utils.yaml.parse(manifestSource);

  return normalizePageManifest(parsedManifest, parseManifestRequestPath(manifestPath));
}

function comparePages(left, right) {
  return left.name.localeCompare(right.name) || left.routePath.localeCompare(right.routePath);
}

export async function listPages() {
  const manifestPaths = await listPageManifestPaths();
  const pages = await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      try {
        return await loadPageManifest(manifestPath);
      } catch (error) {
        console.error(`[pages] loadPageManifest failed for ${manifestPath}`, error);
        return null;
      }
    })
  );

  return pages.filter(Boolean).sort(comparePages);
}
