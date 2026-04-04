import { createHttpError, listAppPathsByPatterns } from "../lib/customware/file_access.js";

function readPatternValues(context) {
  const body = context.body;

  if (Array.isArray(body)) {
    return body;
  }

  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    if (body.patterns !== undefined) {
      return Array.isArray(body.patterns) ? body.patterns : [body.patterns];
    }

    if (body.pattern !== undefined) {
      return Array.isArray(body.pattern) ? body.pattern : [body.pattern];
    }
  }

  const queryValue =
    context.params.patterns !== undefined
      ? context.params.patterns
      : context.params.pattern !== undefined
        ? context.params.pattern
        : [];

  return Array.isArray(queryValue) ? queryValue : queryValue !== undefined ? [queryValue] : [];
}

function readPatterns(context) {
  return readPatternValues(context).map((value) => {
    if (typeof value !== "string") {
      throw createHttpError("File patterns must be strings.", 400);
    }

    return value;
  });
}

function handleFilePaths(context) {
  try {
    return listAppPathsByPatterns({
      patterns: readPatterns(context),
      runtimeParams: context.runtimeParams,
      username: context.user?.username,
      watchdog: context.watchdog
    });
  } catch (error) {
    throw createHttpError(error.message || "File path lookup failed.", Number(error.statusCode) || 500);
  }
}

export function get(context) {
  return handleFilePaths(context);
}

export function post(context) {
  return handleFilePaths(context);
}
