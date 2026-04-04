import { createRuntimeGroupIndex } from "./group_runtime.js";
import { isProjectPathWithinMaxLayer } from "./layer_limit.js";
import {
  normalizeModuleRequestPath,
  parseProjectModuleFilePath,
  resolveProjectAbsolutePath
} from "./layout.js";
import { createEmptyGroupIndex, filterAccessibleModulePaths } from "./overrides.js";

function findCandidateModuleProjectPaths(watchdog, requestPath, maxLayer) {
  const filePaths = watchdog && typeof watchdog.getPaths === "function" ? watchdog.getPaths() : [];

  return filePaths.filter((projectPath) => {
    if (!isProjectPathWithinMaxLayer(projectPath, maxLayer)) {
      return false;
    }

    const modulePathInfo = parseProjectModuleFilePath(projectPath);
    return Boolean(modulePathInfo && modulePathInfo.requestPath === requestPath);
  });
}

function resolveInheritedModuleProjectPath({
  maxLayer,
  projectRoot,
  requestPath,
  runtimeParams,
  username,
  watchdog
}) {
  const normalizedRequestPath = normalizeModuleRequestPath(requestPath);

  if (!normalizedRequestPath || !watchdog) {
    return null;
  }

  const groupIndex =
    typeof watchdog.getIndex === "function"
      ? createRuntimeGroupIndex(watchdog.getIndex("group_index"), runtimeParams)
      : createEmptyGroupIndex();
  const candidatePaths = findCandidateModuleProjectPaths(watchdog, normalizedRequestPath, maxLayer);
  const accessiblePaths = filterAccessibleModulePaths(candidatePaths, username, groupIndex, {
    maxLayer
  });
  const selectedProjectPath = accessiblePaths.length > 0 ? accessiblePaths[accessiblePaths.length - 1] : "";

  if (!selectedProjectPath) {
    return null;
  }

  return {
    absolutePath: resolveProjectAbsolutePath(projectRoot, selectedProjectPath, runtimeParams),
    candidatePaths,
    projectPath: selectedProjectPath,
    requestPath: normalizedRequestPath
  };
}

export {
  createEmptyGroupIndex,
  findCandidateModuleProjectPaths,
  filterAccessibleModulePaths,
  resolveInheritedModuleProjectPath
};
