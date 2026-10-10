// ===== [UI INSPECTOR] Dev-only Metro middleware (registered in metro.config.js) =====
// GET /__insp-open?file=&line=&col=  -> opens the file at that line in VS Code
// GET /__insp-index                  -> raw source text for the inspector lookups
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const SOURCE_DIRS = ["app", "components", "hooks", "lib", "utils", "constants"];
const SOURCE_FILE = /\.(jsx?|tsx?)$/;
const SAFE_FILE = /^[A-Za-z0-9_\-./]+$/;
const MAX_SOURCE_BYTES = 512 * 1024;
const EDITOR_EXIT_TIMEOUT_MS = 4000;
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function resolveProjectFile(projectRoot, file) {
  if (!file || !SAFE_FILE.test(file) || file.includes("..")) {
    return null;
  }

  const absolute = path.resolve(projectRoot, file);
  if (!absolute.startsWith(projectRoot + path.sep)) {
    return null;
  }

  try {
    return fs.statSync(absolute).isFile() ? absolute : null;
  } catch {
    return null;
  }
}

const VSCODE_BUNDLE_ID = "com.microsoft.VSCode";
const VSCODE_APP_BIN = "Contents/Resources/app/bin/code";

// VS Code may live outside /Applications (e.g. still in Downloads), so ask Spotlight too.
function findMacVsCodeApps() {
  const apps = [
    "/Applications/Visual Studio Code.app",
    path.join(os.homedir(), "Applications", "Visual Studio Code.app"),
    path.join(os.homedir(), "Downloads", "Visual Studio Code.app"),
  ];

  try {
    execFileSync("mdfind", [`kMDItemCFBundleIdentifier == '${VSCODE_BUNDLE_ID}'`], {
      encoding: "utf8",
      timeout: 2000,
    })
      .split("\n")
      .filter(Boolean)
      .forEach((app) => apps.push(app));
  } catch {
    // Spotlight unavailable; the fixed locations and PATH still apply.
  }

  return apps;
}

let cachedEditorCandidates = null;

function getEditorCandidates() {
  if (cachedEditorCandidates) {
    return cachedEditorCandidates;
  }

  const candidates = [];

  if (process.env.INSP_EDITOR) {
    candidates.push(process.env.INSP_EDITOR);
  }

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "bin", "code.cmd")
    );
  }

  if (process.platform === "darwin") {
    findMacVsCodeApps().forEach((app) => candidates.push(path.join(app, VSCODE_APP_BIN)));
  }

  cachedEditorCandidates = [
    ...new Set(candidates.filter((binary) => fs.existsSync(binary))),
    "code",
  ];
  return cachedEditorCandidates;
}

function launchEditor(binary, target) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (launched) => {
      if (!settled) {
        settled = true;
        resolve(launched);
      }
    };

    let child;
    try {
      child = spawn(`"${binary}" -r -g "${target}"`, {
        shell: true,
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      finish(false);
      return;
    }

    child.on("error", () => finish(false));
    child.on("exit", (code) => finish(code === 0));
    setTimeout(() => {
      child.unref();
      finish(true);
    }, EDITOR_EXIT_TIMEOUT_MS);
  });
}

async function openInEditor(projectRoot, query) {
  const absolute = resolveProjectFile(projectRoot, query.get("file"));
  const line = Number.parseInt(query.get("line") || "1", 10);
  const col = Number.parseInt(query.get("col") || "1", 10);

  if (!absolute || !Number.isInteger(line) || line < 1 || !Number.isInteger(col) || col < 1) {
    return 400;
  }

  const target = `${absolute}:${line}:${col}`;
  for (const binary of getEditorCandidates()) {
    if (await launchEditor(binary, target)) {
      return 204;
    }
  }
  return 500;
}

function collectSourceFiles(projectRoot) {
  const files = {};

  const walk = (directory) => {
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    entries.forEach((entry) => {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        return;
      }

      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        return;
      }

      if (!SOURCE_FILE.test(entry.name) || fs.statSync(absolute).size > MAX_SOURCE_BYTES) {
        return;
      }

      const relative = path.relative(projectRoot, absolute).split(path.sep).join("/");
      files[relative] = fs.readFileSync(absolute, "utf8");
    });
  };

  SOURCE_DIRS.forEach((directory) => walk(path.join(projectRoot, directory)));
  return files;
}

function createUiInspectorMiddleware(projectRoot) {
  const root = path.resolve(projectRoot);

  return (req, res, next) => {
    const url = new URL(req.url || "/", "http://localhost");

    if (url.pathname !== "/__insp-open" && url.pathname !== "/__insp-index") {
      next();
      return;
    }

    if (req.method !== "GET" || !LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress)) {
      res.statusCode = 403;
      res.end();
      return;
    }

    if (url.pathname === "/__insp-index") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ files: collectSourceFiles(root) }));
      return;
    }

    openInEditor(root, url.searchParams)
      .then((status) => {
        res.statusCode = status;
        res.end();
      })
      .catch(() => {
        res.statusCode = 500;
        res.end();
      });
  };
}

module.exports = { createUiInspectorMiddleware };
