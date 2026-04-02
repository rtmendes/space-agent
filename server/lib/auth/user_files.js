import fs from "node:fs";
import path from "node:path";

import { normalizeEntityId } from "../customware/layout.js";
import { parseSimpleYaml, serializeSimpleYaml } from "../utils/yaml_lite.js";

const USER_META_DIRNAME = "meta";
const USER_CONFIG_FILENAME = "user.yaml";
const USER_LOGINS_FILENAME = "logins.json";
const USER_PASSWORD_FILENAME = "password.json";

function normalizeUsername(value) {
  return normalizeEntityId(value);
}

function buildUserProjectPath(username, relativePath = "") {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    throw new Error(`Invalid username: ${valueToText(username)}`);
  }

  const suffix = String(relativePath || "").replace(/^\/+/u, "");
  return suffix ? `/app/L2/${normalizedUsername}/${suffix}` : `/app/L2/${normalizedUsername}/`;
}

function buildUserAbsolutePath(projectRoot, username, relativePath = "") {
  return path.join(projectRoot, buildUserProjectPath(username, relativePath).slice(1));
}

function valueToText(value) {
  return String(value || "");
}

function readTextFile(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

function readJsonObject(filePath, fallback = {}) {
  const sourceText = readTextFile(filePath, "").trim();

  if (!sourceText) {
    return { ...(fallback || {}) };
  }

  try {
    const parsed = JSON.parse(sourceText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { ...(fallback || {}) };
  } catch {
    return { ...(fallback || {}) };
  }
}

function readUserConfig(projectRoot, username) {
  const filePath = buildUserAbsolutePath(projectRoot, username, USER_CONFIG_FILENAME);
  const sourceText = readTextFile(filePath, "");
  return sourceText ? parseSimpleYaml(sourceText) : {};
}

function writeUserConfig(projectRoot, username, config) {
  const filePath = buildUserAbsolutePath(projectRoot, username, USER_CONFIG_FILENAME);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeSimpleYaml(config), "utf8");
  return filePath;
}

function readUserPasswordVerifier(projectRoot, username) {
  const filePath = buildUserAbsolutePath(
    projectRoot,
    username,
    `${USER_META_DIRNAME}/${USER_PASSWORD_FILENAME}`
  );
  return readJsonObject(filePath, {});
}

function writeUserPasswordVerifier(projectRoot, username, verifier) {
  const filePath = buildUserAbsolutePath(
    projectRoot,
    username,
    `${USER_META_DIRNAME}/${USER_PASSWORD_FILENAME}`
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(verifier || {}, null, 2)}\n`, "utf8");
  return filePath;
}

function readUserLogins(projectRoot, username) {
  const filePath = buildUserAbsolutePath(
    projectRoot,
    username,
    `${USER_META_DIRNAME}/${USER_LOGINS_FILENAME}`
  );
  return readJsonObject(filePath, {});
}

function writeUserLogins(projectRoot, username, logins) {
  const filePath = buildUserAbsolutePath(
    projectRoot,
    username,
    `${USER_META_DIRNAME}/${USER_LOGINS_FILENAME}`
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(logins || {}, null, 2)}\n`, "utf8");
  return filePath;
}

function ensureUserStructure(projectRoot, username) {
  const userDir = buildUserAbsolutePath(projectRoot, username);
  const metaDir = buildUserAbsolutePath(projectRoot, username, USER_META_DIRNAME);
  const modDir = buildUserAbsolutePath(projectRoot, username, "mod");
  fs.mkdirSync(modDir, { recursive: true });
  fs.mkdirSync(metaDir, { recursive: true });
  return {
    metaDir,
    modDir,
    userDir
  };
}

export {
  USER_CONFIG_FILENAME,
  USER_LOGINS_FILENAME,
  USER_META_DIRNAME,
  USER_PASSWORD_FILENAME,
  buildUserAbsolutePath,
  buildUserProjectPath,
  ensureUserStructure,
  normalizeUsername,
  readUserConfig,
  readUserLogins,
  readUserPasswordVerifier,
  writeUserConfig,
  writeUserLogins,
  writeUserPasswordVerifier
};
