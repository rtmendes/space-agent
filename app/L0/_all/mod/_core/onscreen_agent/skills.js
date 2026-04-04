const ONSCREEN_TOP_LEVEL_SKILL_FILE_PATTERN = "mod/*/*/ext/skills/*/skill.md";
const SKILL_FILE_NAME = "skill.md";
const SKILLS_ROOT_SEGMENT = "/ext/skills/";
export const ONSCREEN_SKILL_LOAD_HOOK_KEY = "__spaceOnscreenAgentOnSkillLoad";

function normalizeSkillSegment(segment) {
  const value = String(segment || "").trim();

  if (!value || value === "." || value === ".." || !/^[A-Za-z0-9._-]+$/u.test(value)) {
    throw new Error(`Invalid skill path segment: ${segment}`);
  }

  return value;
}

function normalizeSkillPath(path) {
  const rawPath = String(path || "").trim().replace(/^\/+|\/+$/gu, "");

  if (!rawPath) {
    throw new Error("Skill path must not be empty.");
  }

  return rawPath
    .split("/")
    .filter(Boolean)
    .map((segment) => normalizeSkillSegment(segment))
    .join("/");
}

function parseDiscoveredSkillFile(filePath) {
  const normalizedPath = String(filePath || "").trim();

  if (!normalizedPath.endsWith(`/${SKILL_FILE_NAME}`)) {
    return null;
  }

  const skillsRootIndex = normalizedPath.indexOf(SKILLS_ROOT_SEGMENT);

  if (skillsRootIndex === -1) {
    return null;
  }

  const moduleRootPath = normalizedPath.slice(0, skillsRootIndex);
  const moduleMatch = moduleRootPath.match(/^L[0-2]\/[^/]+\/mod\/([^/]+)\/([^/]+)$/u);

  if (!moduleMatch) {
    return null;
  }

  const relativeSkillPath = normalizedPath.slice(
    skillsRootIndex + SKILLS_ROOT_SEGMENT.length,
    -`/${SKILL_FILE_NAME}`.length
  );

  try {
    return {
      filePath: normalizedPath,
      modulePath: `/mod/${moduleMatch[1]}/${moduleMatch[2]}`,
      path: normalizeSkillPath(relativeSkillPath)
    };
  } catch {
    return null;
  }
}

function buildSkillListLines(skills) {
  return skills.map((skill) => {
    const description = skill.description ? ` | ${skill.description}` : "";
    return `- ${skill.path} | ${skill.name}${description}`;
  });
}

function buildSkillConflictLines(conflicts) {
  if (!conflicts.length) {
    return [];
  }

  return [
    "Conflicting skill ids are unavailable until they are unique across readable mods:",
    ...conflicts.map((conflict) => {
      const modules = conflict.entries.map((entry) => entry.modulePath).join(", ");
      return `- ${conflict.path} | conflict | ${modules}`;
    })
  ];
}

function buildSkillFilePattern(path) {
  return `mod/*/*/ext/skills/${normalizeSkillPath(path)}/skill.md`;
}

async function listDiscoveredSkillFiles(pattern) {
  let result;

  try {
    result = await globalThis.space.api.call("file_paths", {
      body: {
        patterns: [pattern]
      },
      method: "POST"
    });
  } catch (error) {
    throw new Error(`Unable to list onscreen skills: ${error.message}`);
  }

  const matchedPaths = Array.isArray(result?.[pattern]) ? result[pattern] : [];
  const effectiveSkillFiles = new Map();

  matchedPaths.forEach((matchedPath) => {
    const skillFile = parseDiscoveredSkillFile(matchedPath);

    if (!skillFile) {
      return;
    }

    effectiveSkillFiles.set(`${skillFile.modulePath}|${skillFile.path}`, skillFile);
  });

  return [...effectiveSkillFiles.values()].sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);

    if (pathCompare !== 0) {
      return pathCompare;
    }

    const moduleCompare = left.modulePath.localeCompare(right.modulePath);

    if (moduleCompare !== 0) {
      return moduleCompare;
    }

    return left.filePath.localeCompare(right.filePath);
  });
}

async function readSkillFiles(skillFiles) {
  if (!skillFiles.length) {
    return [];
  }

  let result;

  try {
    result = await globalThis.space.api.fileRead({
      files: skillFiles.map((skillFile) => skillFile.filePath)
    });
  } catch (error) {
    throw new Error(`Unable to read onscreen skills: ${error.message}`);
  }

  const files = Array.isArray(result?.files) ? result.files : [];
  const fileMap = new Map(
    files.map((file) => [String(file?.path || ""), String(file?.content || "")])
  );

  return skillFiles.map((skillFile) => {
    const content = fileMap.get(skillFile.filePath) || "";
    const parsedDocument = globalThis.space.utils.markdown.parseDocument(content);
    const frontmatter =
      parsedDocument?.frontmatter && typeof parsedDocument.frontmatter === "object"
        ? parsedDocument.frontmatter
        : {};

    return {
      content,
      description: String(frontmatter.description || "").trim(),
      filePath: skillFile.filePath,
      modulePath: skillFile.modulePath,
      name: String(frontmatter.name || skillFile.path).trim() || skillFile.path,
      path: skillFile.path
    };
  });
}

function buildOnscreenSkillIndex(discoveredSkills) {
  const groupedSkills = new Map();

  discoveredSkills.forEach((skill) => {
    if (!groupedSkills.has(skill.path)) {
      groupedSkills.set(skill.path, []);
    }

    groupedSkills.get(skill.path).push(skill);
  });

  const conflicts = [];
  const skills = [];

  groupedSkills.forEach((entries, path) => {
    if (entries.length === 1) {
      skills.push(entries[0]);
      return;
    }

    conflicts.push({
      entries: [...entries].sort((left, right) => left.modulePath.localeCompare(right.modulePath)),
      path
    });
  });

  skills.sort((left, right) => left.path.localeCompare(right.path));
  conflicts.sort((left, right) => left.path.localeCompare(right.path));

  return {
    conflicts,
    skills
  };
}

async function loadOnscreenSkillIndex(options = {}) {
  const pattern = String(options.pattern || ONSCREEN_TOP_LEVEL_SKILL_FILE_PATTERN);
  const skillFiles = await listDiscoveredSkillFiles(pattern);
  const discoveredSkills = await readSkillFiles(skillFiles);
  return buildOnscreenSkillIndex(discoveredSkills);
}

function findConflictingSkillEntry(conflicts, skillPath) {
  return conflicts.find((conflict) => conflict.path === skillPath) || null;
}

export async function loadOnscreenSkillCatalog() {
  const index = await loadOnscreenSkillIndex();
  return index.skills;
}

export async function buildOnscreenSkillsPromptSection() {
  const { conflicts, skills } = await loadOnscreenSkillIndex();

  if (!skills.length && !conflicts.length) {
    return "";
  }

  return [
    "## Onscreen Agent Skills",
    "Skills are loaded on demand.",
    "Skill ids are relative to a module's `ext/skills/` folder and exclude the trailing `/skill.md`.",
    "Only top-level skills are listed here by default.",
    "Load a skill with a JavaScript execution block using `await space.skills.load(\"<path>\")`; top-level `return` is optional for skill loads because loaded skill content is captured automatically.",
    "Do not rely on a skill's hidden content until you load it.",
    "Some skills are routing skills and may tell you to load a deeper skill path next.",
    skills.length ? "Available top-level skills path|name|description:" : "No loadable skills are currently available.",
    ...buildSkillListLines(skills),
    ...buildSkillConflictLines(conflicts)
  ]
    .filter(Boolean)
    .join("\n");
}

export async function loadOnscreenSkill(path) {
  const skillPath = normalizeSkillPath(path);
  const { conflicts, skills } = await loadOnscreenSkillIndex({
    pattern: buildSkillFilePattern(skillPath)
  });
  const conflictingEntry = findConflictingSkillEntry(conflicts, skillPath);

  if (conflictingEntry) {
    const modules = conflictingEntry.entries.map((entry) => entry.modulePath).join(", ");
    throw new Error(`Unable to load onscreen skill "${skillPath}": conflicting skill ids in ${modules}`);
  }

  const skill = skills.find((entry) => entry.path === skillPath);

  if (!skill) {
    throw new Error(`Unable to load onscreen skill "${skillPath}": skill not found.`);
  }

  const loadedSkill = {
    __spaceSkill: true,
    content: skill.content,
    filePath: skill.filePath,
    modulePath: skill.modulePath,
    name: skill.name,
    path: skill.path
  };

  const onSkillLoad = globalThis[ONSCREEN_SKILL_LOAD_HOOK_KEY];

  if (typeof onSkillLoad === "function") {
    try {
      onSkillLoad(loadedSkill);
    } catch (error) {
      // Skill-load tracking should not prevent the skill itself from loading.
    }
  };

  return loadedSkill;
}

export function installOnscreenSkillRuntime() {
  globalThis.space.skills = {
    ...(globalThis.space.skills && typeof globalThis.space.skills === "object" ? globalThis.space.skills : {}),
    load: loadOnscreenSkill
  };
}
