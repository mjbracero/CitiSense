// ===== [UI INSPECTOR] Dev-only source index + lookups (served by /__insp-index) =====
const SOURCE_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];
const MAX_SEARCH_RESULTS = 60;
const MAX_SCAN_LINE_LENGTH = 400;
const HELPER_PARAM_SCAN_LINES = 400;

let indexPromise = null;

// --- Paths & locations ---
export function normalizeSourcePath(value) {
  const parts = [];
  String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
  return parts.join("/");
}

export function parseLoc(value) {
  const match = /^(.*):(\d+):(\d+)$/.exec(String(value || ""));
  return match ? { file: match[1], line: Number(match[2]), col: Number(match[3]) } : null;
}

export function formatLoc(loc) {
  return loc ? `${loc.file}:${loc.line}` : "";
}

export function openInEditor(loc) {
  if (!loc?.file) {
    return Promise.resolve(false);
  }

  const params = new URLSearchParams({
    file: loc.file,
    line: String(loc.line || 1),
    col: String(loc.col || 1),
  });

  return fetch(`/__insp-open?${params.toString()}`)
    .then((response) => response.status === 204)
    .catch(() => false);
}

// --- Source index ---
function buildIndex(files) {
  const entries = {};
  Object.keys(files).forEach((key) => {
    const text = String(files[key] || "");
    entries[normalizeSourcePath(key)] = { text, lines: text.split("\n") };
  });
  return { files: entries, paths: Object.keys(entries).sort() };
}

export function loadSourceIndex({ refresh = false } = {}) {
  if (refresh) {
    indexPromise = null;
  }

  if (!indexPromise) {
    indexPromise = fetch("/__insp-index", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Source index request failed (${response.status})`);
        }
        return response.json();
      })
      .then((data) => buildIndex(data?.files || {}))
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }

  return indexPromise;
}

// --- Helpers ---
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineIndexAt(text, offset) {
  let count = 0;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) count += 1;
  }
  return count;
}

function makeLoc(file, lineIndex, text, kind, column = 0) {
  return {
    file,
    line: lineIndex + 1,
    col: column + 1,
    text: String(text || "").trim(),
    kind,
  };
}

export function getJsxTagAt(index, loc) {
  const line = index?.files[loc?.file]?.lines[loc.line - 1];
  const match = line ? /^<([A-Za-z_$][\w$.]*)/.exec(line.slice(loc.col - 1)) : null;
  return match ? match[1] : null;
}

export function resolveImportPath(index, fromFile, specifier) {
  if (!index || !specifier) {
    return null;
  }

  let base = null;
  if (specifier.startsWith("@/")) {
    base = normalizeSourcePath(specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    const directory = fromFile.split("/").slice(0, -1).join("/");
    base = normalizeSourcePath(`${directory}/${specifier}`);
  }

  if (!base) {
    return null;
  }

  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find((candidate) => index.files[candidate]) || null;
}

export function resolveAssetPath(fromFile, specifier) {
  const directory = fromFile.split("/").slice(0, -1).join("/");
  return normalizeSourcePath(`${directory}/${specifier}`);
}

export function extractRequiredAsset(loc) {
  const match = /require\(\s*["']([^"']+)["']\s*\)/.exec(loc?.text || "");
  return match ? resolveAssetPath(loc.file, match[1]) : null;
}

function declarationPatterns(name, { exportedOnly = false } = {}) {
  const n = escapeRegExp(name);
  const prefix = exportedOnly ? "\\bexport\\s+(?:default\\s+)?" : "(?:^|[^\\w$.])";
  const patterns = [
    { kind: "function", re: new RegExp(`${prefix}(?:async\\s+)?function\\s*\\*?\\s*${n}\\s*\\(`) },
    { kind: "class", re: new RegExp(`${prefix}class\\s+${n}\\b`) },
    { kind: "variable", re: new RegExp(`${prefix}(?:const|let|var)\\s+${n}\\s*[=:]`) },
  ];

  if (!exportedOnly) {
    patterns.unshift({
      kind: "state",
      re: new RegExp(
        `\\[\\s*(?:${n}\\s*,\\s*[\\w$]+|[\\w$]+\\s*,\\s*${n})\\s*\\]\\s*=\\s*(?:React\\.)?useState\\b`
      ),
    });
    patterns.push({
      kind: "destructured",
      re: new RegExp(`\\b(?:const|let|var)\\s*[\\[{][^=]*(?:^|[^\\w$])${n}(?:[^\\w$:]|$)[^=]*[\\]}]\\s*=`),
    });
  }

  return patterns;
}

function scanFile(index, file, patterns) {
  const entry = index.files[file];
  if (!entry) {
    return null;
  }

  for (let i = 0; i < entry.lines.length; i += 1) {
    const line = entry.lines[i];
    if (line.length > MAX_SCAN_LINE_LENGTH) continue;

    for (const { kind, re } of patterns) {
      const match = re.exec(line);
      if (match) {
        return makeLoc(file, i, line, kind, match.index);
      }
    }
  }

  return null;
}

function findImportOf(index, file, name) {
  const entry = index.files[file];
  if (!entry) {
    return null;
  }

  const importRe = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  const nameRe = new RegExp(`(^|[^\\w$])${escapeRegExp(name)}([^\\w$]|$)`);
  let match;

  while ((match = importRe.exec(entry.text))) {
    const clause = match[1];
    if (!nameRe.test(clause)) continue;

    const aliased = new RegExp(`([\\w$]+)\\s+as\\s+${escapeRegExp(name)}\\b`).exec(clause);
    const isDefault = new RegExp(`^\\s*${escapeRegExp(name)}\\b`).test(clause);
    const lineIndex = lineIndexAt(entry.text, match.index);

    return {
      loc: makeLoc(file, lineIndex, entry.lines[lineIndex], "import"),
      specifier: match[2],
      original: aliased ? aliased[1] : name,
      isDefault,
    };
  }

  return null;
}

// Function parameters (incl. destructured ones) of the function enclosing nearLine.
function findParameter(index, file, name, nearLine) {
  const entry = index.files[file];
  if (!entry || !nearLine) {
    return null;
  }

  const n = escapeRegExp(name);
  const wordRe = new RegExp(`(^|[^\\w$.])${n}([^\\w$]|$)`);
  const paramLineRe = new RegExp(`^\\s*(?:\\.\\.\\.)?${n}\\s*(?:=[^,]*)?,?\\s*$`);
  const stop = Math.max(0, nearLine - 1 - HELPER_PARAM_SCAN_LINES);

  for (let i = nearLine - 1; i >= stop; i -= 1) {
    const line = entry.lines[i] || "";
    const isSignature = /\bfunction\b|=>/.test(line) && wordRe.test(line.split(/=>|\{\s*$/)[0]);
    if (isSignature || paramLineRe.test(line)) {
      return makeLoc(file, i, line, "param", Math.max(0, line.search(wordRe)));
    }
  }

  return null;
}

// --- Declarations ---
export function findDeclaration(index, name, preferFile, nearLine) {
  if (!index || !name) {
    return null;
  }

  const prefer = normalizeSourcePath(preferFile);

  if (index.files[prefer]) {
    const local = scanFile(index, prefer, declarationPatterns(name));
    if (local) {
      return local;
    }

    const parameter = findParameter(index, prefer, name, nearLine);
    if (parameter) {
      return parameter;
    }

    const imported = findImportOf(index, prefer, name);
    if (imported) {
      const target = resolveImportPath(index, prefer, imported.specifier);
      if (!target) {
        return imported.loc;
      }

      const definition =
        scanFile(index, target, declarationPatterns(imported.original).slice(0, 4)) ||
        (imported.isDefault
          ? scanFile(index, target, [{ kind: "default export", re: /\bexport\s+default\b/ }])
          : null);
      return definition ? { ...definition, via: imported.loc } : imported.loc;
    }
  }

  const exportedPatterns = declarationPatterns(name, { exportedOnly: true });
  for (const file of index.paths) {
    if (file === prefer) continue;
    const found = scanFile(index, file, exportedPatterns);
    if (found) {
      return found;
    }
  }

  return null;
}

export function findComponentDefinition(index, name, preferFile) {
  return findDeclaration(index, name, preferFile);
}

export function getStateSetterName(declaration, name) {
  if (declaration?.kind !== "state") {
    return null;
  }
  const match = new RegExp(`\\[\\s*${escapeRegExp(name)}\\s*,\\s*([\\w$]+)\\s*\\]`).exec(
    declaration.text
  );
  return match ? match[1] : null;
}

export function findSetterCalls(index, setterName, preferFile, limit = 8) {
  const file = normalizeSourcePath(preferFile);
  const entry = index?.files[file];
  if (!entry || !setterName) {
    return [];
  }

  const callRe = new RegExp(`(^|[^\\w$.])${escapeRegExp(setterName)}\\s*\\(`);
  const results = [];

  for (let i = 0; i < entry.lines.length && results.length < limit; i += 1) {
    const match = callRe.exec(entry.lines[i]);
    if (match) {
      results.push(makeLoc(file, i, entry.lines[i], "setter call", match.index + match[1].length));
    }
  }

  return results;
}

// --- StyleSheet rules (React Native equivalent of CSS rules) ---
function parseStyleBlock(file, entry, keyOffset, braceOffset) {
  const { text } = entry;
  let depth = 0;
  let end = braceOffset;

  for (let i = braceOffset; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const startLine = lineIndexAt(text, keyOffset);
  const endLine = lineIndexAt(text, end);
  const props = {};

  for (let i = startLine + 1; i <= endLine; i += 1) {
    const match = /^\s*["']?([A-Za-z]+)["']?\s*:\s*(.+?)\s*,?\s*$/.exec(entry.lines[i] || "");
    if (match && !props[match[1]]) {
      props[match[1]] = { line: i + 1, value: match[2].replace(/,$/, "") };
    }
  }

  return { file, line: startLine + 1, endLine: endLine + 1, props };
}

function findStyleBlockInFile(index, file, styleVar, key) {
  const entry = index.files[file];
  if (!entry) {
    return null;
  }

  const createRe = new RegExp(`\\b${escapeRegExp(styleVar)}\\s*=\\s*StyleSheet\\.create\\s*\\(`);
  const createMatch = createRe.exec(entry.text);
  if (!createMatch) {
    return null;
  }

  const keyRe = new RegExp(`(^|[\\s,{])["']?${escapeRegExp(key)}["']?\\s*:\\s*\\{`, "g");
  keyRe.lastIndex = createMatch.index;
  const keyMatch = keyRe.exec(entry.text);
  if (!keyMatch) {
    return null;
  }

  const keyOffset = keyMatch.index + keyMatch[1].length;
  const braceOffset = entry.text.indexOf("{", keyOffset);
  return parseStyleBlock(file, entry, keyOffset, braceOffset);
}

export function findStyleRule(index, styleVar, key, preferFile) {
  if (!index || !styleVar || !key) {
    return null;
  }

  const prefer = normalizeSourcePath(preferFile);
  const local = findStyleBlockInFile(index, prefer, styleVar, key);
  if (local) {
    return local;
  }

  const imported = findImportOf(index, prefer, styleVar);
  const target = imported ? resolveImportPath(index, prefer, imported.specifier) : null;
  if (target) {
    return findStyleBlockInFile(index, target, imported.original, key);
  }

  return null;
}

// --- Text & search ---
export function findTextLiteral(index, file, text, nearLine = 1) {
  const entry = index?.files[normalizeSourcePath(file)];
  const needle = String(text || "").trim().split("\n")[0].slice(0, 40).trim();
  if (!entry || needle.length < 2) {
    return null;
  }

  let best = null;
  entry.lines.forEach((line, i) => {
    const column = line.indexOf(needle);
    if (column === -1 || /^\s*(\/\/|\/\*|\{\/\*|\*)/.test(line)) return;
    const offset = i + 1 - nearLine;
    const distance = offset >= 0 ? offset : 1000 - offset;
    if (!best || distance < best.distance) {
      best = { distance, loc: makeLoc(file, i, line, "text", column) };
    }
  });

  return best ? best.loc : null;
}

export function searchSource(index, query, limit = MAX_SEARCH_RESULTS) {
  const needle = String(query || "").trim().toLowerCase();
  if (!index || needle.length < 2) {
    return [];
  }

  const results = [];
  for (const file of index.paths) {
    const { lines } = index.files[file];
    for (let i = 0; i < lines.length; i += 1) {
      const column = lines[i].toLowerCase().indexOf(needle);
      if (column !== -1) {
        results.push(makeLoc(file, i, lines[i], "match", column));
        if (results.length >= limit) {
          return results;
        }
      }
    }
  }

  return results;
}
