// ===== [UI INSPECTOR] Dev-only React fiber helpers (React 19 has no _debugSource) =====
import { parseLoc } from "./inspectorLookup";

const MAX_FIBER_DEPTH = 400;

export function parsePropGroups(value) {
  return String(value || "")
    .split(";")
    .filter(Boolean)
    .map((group) => {
      const separator = group.indexOf(":", group.startsWith("...") ? 3 : 0);
      return {
        prop: group.slice(0, separator),
        names: group.slice(separator + 1).split(",").filter(Boolean),
      };
    });
}

export function getFiberFromNode(node) {
  let current = node;
  while (current && current !== document.documentElement) {
    const key = Object.keys(current).find((name) => name.startsWith("__reactFiber$"));
    if (key) {
      return current[key];
    }
    current = current.parentNode;
  }
  return null;
}

export function getFiberName(fiber) {
  const type = fiber?.type;
  if (!type) return null;
  if (typeof type === "string") return type;
  return (
    type.displayName ||
    type.name ||
    type.render?.displayName ||
    type.render?.name ||
    type.type?.displayName ||
    type.type?.name ||
    "Anonymous"
  );
}

export function getFiberDomNode(fiber) {
  let current = fiber;
  for (let depth = 0; current && depth < MAX_FIBER_DEPTH; depth += 1) {
    if (current.stateNode instanceof Element) {
      return current.stateNode;
    }
    current = current.child;
  }
  return null;
}

// Tagged JSX sites from the innermost element outwards (element first, then its owners).
// Library components often spread props (and our tags) onto inner elements, so for
// each tag the outermost fiber wins: that one holds the props written in the JSX.
export function getInspectorChain(node, limit = 12) {
  const chain = [];
  const positions = new Map();
  let fiber = getFiberFromNode(node);

  for (let depth = 0; fiber && depth < MAX_FIBER_DEPTH; depth += 1) {
    const props = fiber.memoizedProps;
    const raw =
      props && typeof props === "object"
        ? props["data-insp-src"] || props["data-insp-use"]
        : null;

    if (raw && positions.has(raw)) {
      const entry = chain[positions.get(raw)];
      entry.fiber = fiber;
      entry.props = props;
      entry.name = getFiberName(fiber);
    } else if (raw) {
      if (chain.length >= limit) break;
      positions.set(raw, chain.length);
      const isHost = Boolean(props["data-insp-src"]);
      chain.push({
        fiber,
        props,
        name: getFiberName(fiber),
        kind: isHost ? "host" : "component",
        loc: parseLoc(raw),
        fx: parsePropGroups(isHost ? props["data-insp-fx"] : props["data-insp-usefx"]),
        sty: parsePropGroups(props["data-insp-sty"]),
        assets: String(props["data-insp-asset"] || "").split(",").filter(Boolean),
        icon: props["data-insp-icon"] || null,
      });
    }

    fiber = fiber.return;
  }

  return chain;
}
