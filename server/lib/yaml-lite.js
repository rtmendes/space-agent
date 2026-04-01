function stripInlineComment(rawLine) {
  let quote = "";

  for (let index = 0; index < rawLine.length; index += 1) {
    const char = rawLine[index];

    if (quote) {
      if (char === quote && rawLine[index - 1] !== "\\") {
        quote = "";
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "#") {
      return rawLine.slice(0, index);
    }
  }

  return rawLine;
}

function splitInlineList(sourceText) {
  const parts = [];
  let current = "";
  let quote = "";

  for (let index = 0; index < sourceText.length; index += 1) {
    const char = sourceText[index];

    if (quote) {
      current += char;

      if (char === quote && sourceText[index - 1] !== "\\") {
        quote = "";
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === ",") {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function parseYamlScalar(value) {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();

    if (!inner) {
      return [];
    }

    return splitInlineList(inner)
      .map((part) => parseYamlScalar(part))
      .filter((part) => part !== "");
  }

  return trimmed;
}

function parseSimpleYaml(sourceText) {
  const result = {};
  let currentKey = null;

  String(sourceText || "")
    .split(/\r?\n/u)
    .forEach((rawLine) => {
      const withoutComment = stripInlineComment(rawLine);

      if (!withoutComment.trim()) {
        return;
      }

      const keyMatch = withoutComment.match(/^([A-Za-z0-9_-]+):(?:\s+(.*))?$/u);
      if (keyMatch) {
        const [, key, value] = keyMatch;
        currentKey = key;

        if (value === undefined || value === "") {
          result[key] = [];
          return;
        }

        result[key] = parseYamlScalar(value);
        return;
      }

      const listMatch = withoutComment.match(/^\s*-\s+(.*)$/u);
      if (listMatch && currentKey) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }

        const parsedValue = parseYamlScalar(listMatch[1]);

        if (Array.isArray(parsedValue)) {
          result[currentKey].push(...parsedValue);
          return;
        }

        result[currentKey].push(parsedValue);
      }
    });

  return result;
}

export { parseSimpleYaml, parseYamlScalar };
