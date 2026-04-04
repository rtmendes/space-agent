import path from "node:path";

import { resolveRequestMaxLayer } from "../lib/customware/layer_limit.js";
import { resolveProjectPathFromAbsolute } from "../lib/customware/layout.js";
import { resolveInheritedModuleProjectPath } from "../lib/customware/module_inheritance.js";
import { sendFile, sendNotFound } from "./responses.js";

function resolveModuleFilePath(projectRoot, requestPath, username, watchdog, options = {}) {
  const normalizedPath = path.posix.normalize(requestPath);

  if (!normalizedPath.startsWith("/mod/")) {
    return "";
  }

  const maxLayer = resolveRequestMaxLayer({
    headers: options.headers,
    requestUrl: options.requestUrl
  });

  const resolvedModulePath = resolveInheritedModuleProjectPath({
    maxLayer,
    projectRoot,
    requestPath: normalizedPath,
    runtimeParams: options.runtimeParams,
    username,
    watchdog
  });

  return resolvedModulePath ? resolvedModulePath.absolutePath : "";
}

function handleModuleRequest(res, requestPath, options = {}) {
  const { headers, projectRoot, requestUrl, runtimeParams, username, watchdog } = options;
  const filePath = resolveModuleFilePath(projectRoot, requestPath, username, watchdog, {
    headers,
    requestUrl,
    runtimeParams
  });

  if (!filePath) {
    sendNotFound(res);
    return;
  }

  const projectPath = projectRoot
    ? resolveProjectPathFromAbsolute(projectRoot, filePath, { runtimeParams })
    : "";
  const knownMissing = Boolean(watchdog && projectPath && watchdog.covers(projectPath) && !watchdog.hasPath(projectPath));

  sendFile(res, filePath, {
    knownMissing
  });
}

export { handleModuleRequest };
