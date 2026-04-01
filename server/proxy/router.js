import path from "node:path";
import { URL } from "node:url";

import { resolveInheritedModuleProjectPath } from "../lib/customware/module-inheritance.js";
import { toProjectPath } from "../lib/file-watch/watchdog.js";
import { createRequestContext, runWithRequestContext } from "../lib/request-context.js";
import { sendApiResult, sendFile, sendJson } from "./handlers.js";
import { applyApiCorsHeaders, handleApiPreflight } from "./cors.js";
import { readParsedRequestBody } from "./request-body.js";
import { proxyExternalRequest } from "./service.js";

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

function resolveStaticRequestFilePath(appDir, requestPath, options = {}) {
  const { projectRoot, username, watchdog } = options;
  const normalizedPath = path.posix.normalize(requestPath === "/" ? "/index.html" : requestPath);

  if (normalizedPath.startsWith("/mod/")) {
    const resolvedModulePath = resolveInheritedModuleProjectPath({
      projectRoot,
      requestPath: normalizedPath,
      username,
      watchdog
    });

    if (!resolvedModulePath) {
      return {
        filePath: "",
        knownMissing: true
      };
    }

    return {
      filePath: resolvedModulePath.absolutePath,
      knownMissing: false
    };
  }

  const baseName = path.posix.basename(normalizedPath);
  const isRootHtmlRequest =
    normalizedPath === `/${baseName}` && path.posix.extname(baseName).toLowerCase() === ".html";

  if (!isRootHtmlRequest) {
    return null;
  }

  return {
    filePath: resolvePathWithinRoot(appDir, normalizedPath),
    knownMissing: false
  };
}

function createParamsObject(searchParams) {
  const params = {};

  for (const [key, value] of searchParams.entries()) {
    if (params[key] === undefined) {
      params[key] = value;
      continue;
    }

    if (Array.isArray(params[key])) {
      params[key].push(value);
      continue;
    }

    params[key] = [params[key], value];
  }

  return params;
}

function resolveApiModule(apiRegistry, pathname) {
  const match = pathname.match(/^\/api\/([a-z0-9_-]+)$/i);
  if (!match) {
    return null;
  }

  return apiRegistry.get(match[1]) || null;
}

function getAllowedMethods(apiModule) {
  return Object.keys(apiModule.handlers)
    .map((method) => method.toUpperCase())
    .sort();
}

async function handleApiModuleRequest(req, res, requestUrl, apiModule, contextOptions) {
  const method = String(req.method || "GET").toLowerCase();
  const handler = apiModule.handlers[method];

  applyApiCorsHeaders(res);

  if (!handler) {
    res.writeHead(405, {
      Allow: getAllowedMethods(apiModule).join(", "),
      "Content-Type": "application/json; charset=utf-8"
    });
    res.end(
      JSON.stringify(
        {
          error: `Method ${String(req.method || "GET").toUpperCase()} is not supported for ${
            apiModule.endpointName
          }`
        },
        null,
        2
      )
    );
    return;
  }

  let parsedRequest;

  try {
    parsedRequest = await readParsedRequestBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: `Invalid request body: ${error.message}`
    });
    return;
  }

  const params = createParamsObject(requestUrl.searchParams);
  const result = await handler({
    ...contextOptions,
    body: parsedRequest.body,
    endpointName: apiModule.endpointName,
    headers: req.headers,
    method: method.toUpperCase(),
    params,
    query: params,
    rawBody: parsedRequest.rawBody,
    req,
    requestContext: contextOptions.requestContext,
    requestUrl,
    res
  });

  await sendApiResult(res, result);
}

function createRequestHandler(options) {
  const { apiDir, apiRegistry, appDir, assetDir, host, port, projectRoot, watchdog } = options;

  return async function requestHandler(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
    const requestContext = createRequestContext({
      req,
      requestUrl
    });

    return runWithRequestContext(requestContext, async () => {
      if (requestUrl.pathname.startsWith("/api/") && handleApiPreflight(req, res)) {
        return;
      }

      if (requestUrl.pathname === "/api/proxy") {
        await proxyExternalRequest(req, res, requestUrl, applyApiCorsHeaders);
        return;
      }

      const apiModule = resolveApiModule(apiRegistry, requestUrl.pathname);
      if (apiModule) {
        await handleApiModuleRequest(req, res, requestUrl, apiModule, {
          apiDir,
          appDir,
          assetDir,
          watchdog,
          host,
          port,
          requestContext,
          user: requestContext.user
        });
        return;
      }

      const staticResult = resolveStaticRequestFilePath(appDir, requestUrl.pathname, {
        projectRoot,
        username: requestContext.user.username,
        watchdog
      });

      if (!staticResult || !staticResult.filePath) {
        sendJson(res, 404, {
          error: "File not found"
        });
        return;
      }

      const projectPath = projectRoot ? toProjectPath(projectRoot, staticResult.filePath) : "";
      const knownMissing = Boolean(
        staticResult.knownMissing ||
          (watchdog && projectPath && watchdog.covers(projectPath) && !watchdog.hasPath(projectPath))
      );

      sendFile(res, staticResult.filePath, {
        knownMissing
      });
    });
  };
}

export { createRequestHandler };
