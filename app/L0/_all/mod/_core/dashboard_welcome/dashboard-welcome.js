import "/mod/_core/spaces/store.js";
import { showToast } from "/mod/_core/visual/chrome/toast.js";
import {
  getSpaceDisplayIcon,
  getSpaceDisplayIconColor,
  getSpaceDisplayTitle
} from "/mod/_core/spaces/space-metadata.js";

const DASHBOARD_CONFIG_PATH = "~/conf/dashboard.yaml";
const EXAMPLE_MANIFEST_PATTERN = "mod/_core/dashboard_welcome/examples/*/space.yaml";

function getRuntime() {
  const runtime = globalThis.space;

  if (!runtime || typeof runtime !== "object") {
    throw new Error("Space runtime is not available.");
  }

  if (
    !runtime.api ||
    typeof runtime.api.call !== "function" ||
    typeof runtime.api.fileRead !== "function" ||
    typeof runtime.api.fileWrite !== "function"
  ) {
    throw new Error("space.api file helpers are not available.");
  }

  if (!runtime.spaces || typeof runtime.spaces.installExampleSpace !== "function") {
    throw new Error("space.spaces example helpers are not available.");
  }

  if (
    !runtime.utils ||
    typeof runtime.utils !== "object" ||
    !runtime.utils.yaml ||
    typeof runtime.utils.yaml.parse !== "function" ||
    typeof runtime.utils.yaml.stringify !== "function"
  ) {
    throw new Error("space.utils.yaml is not available.");
  }

  return runtime;
}

function isMissingFileError(error) {
  const message = String(error?.message || "");
  return /\bstatus 404\b/u.test(message) || /File not found\./u.test(message) || /Path not found\./u.test(message);
}

function parseStoredBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  const normalizedValue = String(value ?? "").trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  return false;
}

function normalizeDashboardPrefs(parsedConfig) {
  const storedConfig = parsedConfig && typeof parsedConfig === "object" ? parsedConfig : {};

  return {
    welcomeHidden: parseStoredBoolean(storedConfig.welcome_hidden ?? storedConfig.welcomeHidden)
  };
}

function buildDashboardPrefsPayload(prefs = {}) {
  return {
    welcome_hidden: prefs.welcomeHidden === true
  };
}

async function loadDashboardPrefs() {
  const runtime = getRuntime();

  try {
    const result = await runtime.api.fileRead(DASHBOARD_CONFIG_PATH);
    return normalizeDashboardPrefs(runtime.utils.yaml.parse(String(result?.content || "")));
  } catch (error) {
    if (isMissingFileError(error)) {
      return normalizeDashboardPrefs({});
    }

    throw new Error(`Unable to load dashboard settings: ${error.message}`);
  }
}

async function saveDashboardPrefs(nextPrefs) {
  const runtime = getRuntime();
  const expectedPrefs = buildDashboardPrefsPayload(nextPrefs);
  const content = runtime.utils.yaml.stringify(expectedPrefs);

  try {
    await runtime.api.fileWrite(DASHBOARD_CONFIG_PATH, `${content}\n`);
    const result = await runtime.api.fileRead(DASHBOARD_CONFIG_PATH);
    const savedPrefs = normalizeDashboardPrefs(runtime.utils.yaml.parse(String(result?.content || "")));

    if (savedPrefs.welcomeHidden !== (expectedPrefs.welcome_hidden === true)) {
      throw new Error("Saved dashboard settings did not match the requested value.");
    }
  } catch (error) {
    throw new Error(`Unable to save dashboard settings: ${error.message}`);
  }
}

function logDashboardWelcomeError(context, error) {
  console.error(`[dashboard-welcome] ${context}`, error);
}

function normalizeExampleDescription(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseExampleManifestPath(path) {
  const normalizedPath = String(path || "").trim();
  const match = normalizedPath.match(/^(L[0-2]\/[^/]+\/mod\/_core\/dashboard_welcome\/examples\/([^/]+)\/)space\.yaml$/u);

  if (!match) {
    return null;
  }

  return {
    id: match[2],
    manifestPath: normalizedPath,
    sourcePath: match[1]
  };
}

function normalizeExampleEntry(example = {}, manifest = {}) {
  return {
    description: normalizeExampleDescription(manifest.description ?? manifest.summary),
    displayIcon: getSpaceDisplayIcon(manifest),
    displayIconColor: getSpaceDisplayIconColor(manifest),
    id: example.id,
    sourcePath: example.sourcePath,
    title: getSpaceDisplayTitle(manifest)
  };
}

async function loadExamples() {
  const runtime = getRuntime();
  let result;

  try {
    result = await runtime.api.call("file_paths", {
      body: {
        patterns: [EXAMPLE_MANIFEST_PATTERN]
      },
      method: "POST"
    });
  } catch (error) {
    throw new Error(`Unable to list bundled examples: ${error.message}`);
  }

  const matchedPaths = Array.isArray(result?.[EXAMPLE_MANIFEST_PATTERN]) ? result[EXAMPLE_MANIFEST_PATTERN] : [];
  const effectiveExamples = new Map();

  matchedPaths.forEach((matchedPath) => {
    const parsedPath = parseExampleManifestPath(matchedPath);

    if (!parsedPath) {
      return;
    }

    effectiveExamples.set(parsedPath.id, parsedPath);
  });

  const examples = await Promise.all(
    [...effectiveExamples.values()].map(async (example) => {
      try {
        const manifestResult = await runtime.api.fileRead(example.manifestPath);
        const manifest = runtime.utils.yaml.parse(String(manifestResult?.content || ""));
        return normalizeExampleEntry(example, manifest);
      } catch (error) {
        logDashboardWelcomeError(`loadExampleManifest failed for ${example.id}`, error);
        return null;
      }
    })
  );

  return examples.filter(Boolean).sort((left, right) => left.title.localeCompare(right.title));
}

globalThis.dashboardWelcome = function dashboardWelcome() {
  return {
    examples: [],
    hidden: false,
    installingExampleId: "",
    ready: false,
    savingPreference: false,

    async init() {
      try {
        const [prefs, examples] = await Promise.all([loadDashboardPrefs(), loadExamples()]);
        this.hidden = prefs.welcomeHidden;
        this.examples = examples;
      } catch (error) {
        logDashboardWelcomeError("init failed", error);
        showToast(String(error?.message || "Unable to load the dashboard welcome panel."), {
          tone: "error"
        });
      } finally {
        this.ready = true;
      }
    },

    get isInstalling() {
      return Boolean(this.installingExampleId);
    },

    async setHidden(nextHidden) {
      const requestedHidden = nextHidden === true;

      if (this.savingPreference || this.hidden === requestedHidden) {
        return;
      }

      this.savingPreference = true;

      try {
        await saveDashboardPrefs({
          welcomeHidden: requestedHidden
        });
        this.hidden = requestedHidden;
      } catch (error) {
        logDashboardWelcomeError("setHidden failed", error);
        showToast(String(error?.message || "Unable to save that setting."), {
          tone: "error"
        });
      } finally {
        this.savingPreference = false;
      }
    },

    async hideWelcome() {
      await this.setHidden(true);
    },

    async showWelcome() {
      await this.setHidden(false);
    },

    async installExample(exampleId) {
      if (this.installingExampleId) {
        return;
      }

      const example = this.examples.find((entry) => entry.id === exampleId);

      if (!example) {
        return;
      }

      this.installingExampleId = example.id;

      try {
        const createdSpace = await globalThis.space.spaces.installExampleSpace({
          id: example.id,
          replace: false,
          sourcePath: example.sourcePath
        });

        showToast(`Opened "${getSpaceDisplayTitle(createdSpace)}".`, {
          tone: "success"
        });
      } catch (error) {
        logDashboardWelcomeError("installExample failed", error);
        showToast(String(error?.message || "Unable to open that demo space."), {
          tone: "error"
        });
      } finally {
        this.installingExampleId = "";
      }
    }
  };
};
