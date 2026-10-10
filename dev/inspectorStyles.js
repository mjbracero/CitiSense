// ===== [UI INSPECTOR] Dev-only style attribution for React Native StyleSheet styles =====
// RN equivalent of "which CSS rule wins": walk the element's style prop in order,
// the last entry that defines a property wins, then map that entry back to its
// StyleSheet.create key (file:line) or to the inline object in the JSX.
import { findDeclaration, findStyleRule } from "./inspectorLookup";

export const COLOR_PROPS = [
  { prop: "color", label: "Text", css: "color", inheritFromParent: false },
  { prop: "backgroundColor", label: "Background", css: "background-color", inheritFromParent: true },
  { prop: "borderColor", label: "Border", css: "border-top-color", inheritFromParent: false },
  { prop: "tintColor", label: "Tint", css: null, inheritFromParent: false },
];

const PRESSABLE_STATE = { pressed: false, hovered: false, focused: false };
const MAX_STYLE_DEPTH = 20;
const INLINE_SEARCH_LINES = 15;
const HELPER_SEARCH_LINES = 60;

export function flattenStyleEntries(style, out = [], depth = 0) {
  if (style == null || style === false || depth > MAX_STYLE_DEPTH) {
    return out;
  }

  if (Array.isArray(style)) {
    style.forEach((item) => flattenStyleEntries(item, out, depth + 1));
  } else if (typeof style === "function") {
    try {
      flattenStyleEntries(style(PRESSABLE_STATE), out, depth + 1);
    } catch {
      // Style callbacks can depend on runtime state; skip when they throw.
    }
  } else if (typeof style === "object") {
    out.push(style);
  }

  return out;
}

function normalizeValue(value) {
  return String(value).replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, "");
}

function getStyleRefs(entry, propName = "style") {
  const group = entry.sty.find((item) => item.prop === propName);
  return group ? group.names : [];
}

export function resolveStyleEntries(index, entry) {
  if (!entry) {
    return [];
  }

  const objects = flattenStyleEntries(entry.props?.style);
  const rules = getStyleRefs(entry)
    .map((ref) => {
      const [styleVar, key] = ref.split(".");
      return { ref, rule: findStyleRule(index, styleVar, key, entry.loc.file) };
    })
    .filter((item) => item.rule);
  const used = new Set();

  return objects.map((style, order) => {
    const keys = Object.keys(style);
    const fromStyleSheet = Object.isFrozen(style);
    let best = null;
    let bestScore = 0;

    if (fromStyleSheet) {
      rules.forEach((candidate, i) => {
        if (used.has(i)) return;
        const score = keys.reduce((total, key) => {
          const declared = candidate.rule.props[key];
          if (!declared) return total;
          return total + (normalizeValue(declared.value) === normalizeValue(style[key]) ? 2 : 1);
        }, 0);
        if (score > bestScore) {
          best = { ...candidate, i };
          bestScore = score;
        }
      });
    }

    if (best) {
      used.add(best.i);
    }

    return {
      order,
      style,
      keys,
      source: best
        ? { kind: "stylesheet", ref: best.ref, rule: best.rule }
        : { kind: fromStyleSheet ? "stylesheet-external" : "inline" },
    };
  });
}

export function findWinningEntry(entries, prop) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const value = entries[i].style[prop];
    if (value !== undefined && value !== null) {
      return { styleEntry: entries[i], value };
    }
  }
  return null;
}

function searchPropLine(index, file, fromLine, maxLines, prop) {
  const fileEntry = index?.files[file];
  if (!fileEntry) {
    return null;
  }

  const propRe = new RegExp(`\\b${prop}\\s*:`);
  const end = Math.min(fileEntry.lines.length, fromLine - 1 + maxLines);
  for (let i = Math.max(0, fromLine - 1); i < end; i += 1) {
    if (propRe.test(fileEntry.lines[i])) {
      return { file, line: i + 1, col: 1, text: fileEntry.lines[i].trim() };
    }
  }
  return null;
}

export function locateStyleProp(index, entry, styleEntry, prop) {
  const { source } = styleEntry;

  if (source.kind === "stylesheet") {
    const declared = source.rule.props[prop];
    return {
      file: source.rule.file,
      line: declared ? declared.line : source.rule.line,
      col: 1,
      label: source.ref,
      text: declared ? `${prop}: ${declared.value}` : "",
    };
  }

  const inline = searchPropLine(index, entry.loc.file, entry.loc.line, INLINE_SEARCH_LINES, prop);
  if (inline) {
    return { ...inline, label: "inline style" };
  }

  const styleGroup = entry.fx.find((group) => group.prop === "style");
  for (const name of styleGroup ? styleGroup.names : []) {
    const declaration = findDeclaration(index, name, entry.loc.file, entry.loc.line);
    if (declaration?.kind === "function" || declaration?.kind === "variable") {
      const helperLine = searchPropLine(
        index,
        declaration.file,
        declaration.line,
        HELPER_SEARCH_LINES,
        prop
      );
      if (helperLine) {
        return { ...helperLine, label: `via ${name}()` };
      }
    }
  }

  return {
    ...entry.loc,
    label: source.kind === "inline" ? "inline style" : "StyleSheet passed via props",
  };
}

export function readComputedColor(element, cssProperty) {
  if (!element || !cssProperty) {
    return null;
  }
  const value = window.getComputedStyle(element).getPropertyValue(cssProperty);
  return value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent" ? value : null;
}

export function readComputedMotion(element) {
  if (!element) {
    return [];
  }

  const computed = window.getComputedStyle(element);
  const rows = [];

  if (computed.animationName && computed.animationName !== "none") {
    rows.push(`animation: ${computed.animationName} ${computed.animationDuration}`);
  }
  if (computed.transitionDuration && !/^0s(,\s*0s)*$/.test(computed.transitionDuration)) {
    rows.push(`transition: ${computed.transitionProperty} ${computed.transitionDuration}`);
  }
  if (computed.transform && computed.transform !== "none") {
    rows.push(`transform: ${computed.transform}`);
  }

  return rows;
}
