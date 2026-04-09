export const SYSTEM_PROMPT_INCLUDE_FILE_PATTERN = "**/*.system.include.md";
export const TRANSIENT_PROMPT_INCLUDE_FILE_PATTERN = "**/*.transient.include.md";
export const PROMPT_INCLUDE_FILE_PATTERNS = Object.freeze({
  system: SYSTEM_PROMPT_INCLUDE_FILE_PATTERN,
  transient: TRANSIENT_PROMPT_INCLUDE_FILE_PATTERN
});
export const PROMPT_INCLUDE_SYSTEM_PROMPT_SECTION = [
  "## prompt includes",
  "*.system.include.md files auto-injected below into system prompt",
  "use for durable rules preferences instructions",
  "*.transient.include.md files auto-injected into transient context",
  "use for durable notes knowledge project context",
  "create/edit/delete persist across conversations",
  "never just acknowledge verbally always persist to file",
  "alphabetical by full path within each include type"
].join("\n");
export const PROMPT_INCLUDE_TRANSIENT_HEADING = "prompt includes";
export const PROMPT_INCLUDE_TRANSIENT_KEY = "prompt-includes";

function normalizePromptIncludePath(inputPath = "") {
  return String(inputPath || "").trim().replaceAll("\\", "/").replace(/^\/+/u, "");
}

function toPromptIncludeDisplayPath(inputPath = "") {
  const normalizedPath = normalizePromptIncludePath(inputPath);
  return normalizedPath ? `/${normalizedPath}` : "";
}

function createPromptIncludeFence(content = "") {
  const backtickRuns = String(content || "").match(/`+/gu) || [];
  const longestRun = backtickRuns.reduce(
    (maximum, run) => Math.max(maximum, run.length),
    0
  );

  return "`".repeat(Math.max(3, longestRun + 1));
}

function normalizePromptIncludeEntry(entry) {
  const normalizedPath = normalizePromptIncludePath(entry?.path ?? entry);

  if (!normalizedPath) {
    return null;
  }

  return {
    content: typeof entry?.content === "string" ? entry.content : "",
    path: normalizedPath
  };
}

function normalizePromptIncludePatterns(inputPatterns) {
  const patterns = Array.isArray(inputPatterns)
    ? inputPatterns
    : inputPatterns != null
      ? [inputPatterns]
      : [];

  return [...new Set(
    patterns
      .map((pattern) => String(pattern || "").trim())
      .filter(Boolean)
  )];
}

export function sortPromptIncludeEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizePromptIncludeEntry(entry))
    .filter(Boolean)
    .sort((left, right) => toPromptIncludeDisplayPath(left.path).localeCompare(toPromptIncludeDisplayPath(right.path)));
}

export function formatPromptIncludeTransientContent(entries = []) {
  const normalizedEntries = sortPromptIncludeEntries(entries);

  if (!normalizedEntries.length) {
    return "";
  }

  return normalizedEntries
    .flatMap((entry, index) => {
      const fence = createPromptIncludeFence(entry.content);

      return [
        ...(index > 0 ? [""] : []),
        toPromptIncludeDisplayPath(entry.path),
        fence,
        entry.content,
        fence
      ];
    })
    .join("\n");
}

export function formatPromptIncludeSystemPromptSections(entries = []) {
  return sortPromptIncludeEntries(entries).map((entry) =>
    [
      `source: ${toPromptIncludeDisplayPath(entry.path)}`,
      entry.content
    ].join("\n")
  );
}

export function buildPromptIncludeSystemPromptSection() {
  return PROMPT_INCLUDE_SYSTEM_PROMPT_SECTION;
}

function getPromptIncludeApiClient() {
  const apiClient = globalThis.space?.api;

  if (
    !apiClient ||
    typeof apiClient.call !== "function" ||
    typeof apiClient.fileRead !== "function"
  ) {
    throw new Error("Prompt include loading requires space.api.call(...) and space.api.fileRead(...).");
  }

  return apiClient;
}

export async function listPromptIncludePaths(options = {}) {
  const patterns = normalizePromptIncludePatterns(
    options.patterns ??
      options.pattern ??
      [SYSTEM_PROMPT_INCLUDE_FILE_PATTERN, TRANSIENT_PROMPT_INCLUDE_FILE_PATTERN]
  );

  if (!patterns.length) {
    return [];
  }

  const result = await getPromptIncludeApiClient().call("file_paths", {
    body: {
      patterns
    },
    method: "POST"
  });
  const matchedPaths = patterns.flatMap((pattern) =>
    Array.isArray(result?.[pattern]) ? result[pattern] : []
  );

  return [...new Set(matchedPaths.map((matchedPath) => normalizePromptIncludePath(matchedPath)).filter(Boolean))]
    .sort((left, right) => toPromptIncludeDisplayPath(left).localeCompare(toPromptIncludeDisplayPath(right)));
}

export async function readPromptIncludeEntries(options = {}) {
  const promptIncludePaths = Array.isArray(options.paths)
    ? [...new Set(options.paths.map((entry) => normalizePromptIncludePath(entry)).filter(Boolean))]
    : await listPromptIncludePaths({
        pattern: options.pattern,
        patterns: options.patterns
      });

  if (!promptIncludePaths.length) {
    return [];
  }

  const result = await getPromptIncludeApiClient().fileRead({
    files: promptIncludePaths
  });
  const files = Array.isArray(result?.files) ? result.files : [];
  const contentByPath = new Map(
    files.map((file) => [
      normalizePromptIncludePath(file?.path),
      typeof file?.content === "string" ? file.content : ""
    ])
  );

  return sortPromptIncludeEntries(
    promptIncludePaths.map((path) => ({
      content: contentByPath.get(path) || "",
      path
    }))
  );
}

export async function buildPromptIncludeTransientSection(options = {}) {
  const entries = Array.isArray(options.entries)
    ? sortPromptIncludeEntries(options.entries)
    : await readPromptIncludeEntries({
        ...options,
        patterns: options.patterns ?? options.pattern ?? [TRANSIENT_PROMPT_INCLUDE_FILE_PATTERN]
      });
  const content = formatPromptIncludeTransientContent(entries);

  if (!content) {
    return null;
  }

  return {
    content,
    heading: PROMPT_INCLUDE_TRANSIENT_HEADING,
    key: PROMPT_INCLUDE_TRANSIENT_KEY,
    order: Number.isFinite(options.order) ? Number(options.order) : 0
  };
}

export async function buildPromptIncludeSystemPromptSections(options = {}) {
  const instructionsSection = buildPromptIncludeSystemPromptSection();
  const entries = Array.isArray(options.entries)
    ? sortPromptIncludeEntries(options.entries)
    : await readPromptIncludeEntries({
        ...options,
        patterns: options.patterns ?? options.pattern ?? [SYSTEM_PROMPT_INCLUDE_FILE_PATTERN]
      });

  return [instructionsSection, ...formatPromptIncludeSystemPromptSections(entries)].filter(Boolean);
}
