// ===== [UI INSPECTOR] Dev-only: build the panel sections for a selected DOM element =====
import { getFiberDomNode, getInspectorChain } from "./inspectorFiber";
import {
  extractRequiredAsset,
  findComponentDefinition,
  findDeclaration,
  findSetterCalls,
  findTextLiteral,
  getJsxTagAt,
  getStateSetterName,
} from "./inspectorLookup";
import {
  COLOR_PROPS,
  findWinningEntry,
  locateStyleProp,
  readComputedColor,
  readComputedMotion,
  resolveStyleEntries,
} from "./inspectorStyles";

const MOTION_HINT =
  /useAnimatedStyle|useSharedValue|useAnimatedProps|Animated\.Value|Animated\.timing|withTiming|withSpring|withRepeat|withSequence|withDelay|interpolate/;
const MOTION_PROPS = ["entering", "exiting", "layout"];
const HANDLER_PROP = /^on[A-Z]/;
const MAX_LOGIC_OWNERS = 6;
const MAX_ANCESTOR_STYLES = 4;
const MAX_LAYERS = 10;
const MAX_TEXT_LENGTH = 80;

function describeName(index, name, loc) {
  const declaration = findDeclaration(index, name, loc.file, loc.line);
  const setter = getStateSetterName(declaration, name);
  const callsFor = setter || (declaration?.kind === "state" && /^set[A-Z]/.test(name) ? name : null);

  return {
    name,
    declaration,
    setter,
    setterCalls: callsFor ? findSetterCalls(index, callsFor, declaration.file) : [],
  };
}

function describeElement(el, chain, index) {
  const top = chain[0] || null;
  const rawText = String(el.innerText || el.textContent || "").trim().slice(0, MAX_TEXT_LENGTH);
  const text = /[\p{L}\p{N}]/u.test(rawText) ? rawText : "";
  const components = chain
    .filter((entry) => entry.kind === "component")
    .slice(0, 6)
    .map((entry) => ({
      name: entry.name,
      usage: entry.loc,
      definition: findComponentDefinition(index, entry.name, entry.loc.file),
    }));

  return {
    tag: el.tagName.toLowerCase(),
    name: top?.name || null,
    loc: top?.loc || null,
    text,
    textLoc: top && text ? findTextLiteral(index, top.loc.file, text, top.loc.line) : null,
    components,
  };
}

function describeLogic(chain, index) {
  const owners = [];
  const top = chain[0];
  if (top) owners.push(top);

  const handlerOwner = chain
    .slice(0, MAX_LOGIC_OWNERS)
    .find((entry) => entry.fx.some((group) => HANDLER_PROP.test(group.prop)));
  if (handlerOwner && handlerOwner !== top) owners.push(handlerOwner);

  return owners.map((entry) => ({
    name: entry.name,
    loc: entry.loc,
    groups: entry.fx.map((group) => ({
      prop: group.prop,
      items: group.names.map((name) => describeName(index, name, entry.loc)),
    })),
  }));
}

function collectRenderedImages(el) {
  const urls = new Set();
  const candidates = [el, ...el.querySelectorAll("img, div")].slice(0, 30);
  if (el.parentElement) candidates.push(el.parentElement);

  candidates.forEach((node) => {
    if (node.tagName === "IMG" && node.currentSrc) urls.add(node.currentSrc);
    const background = window.getComputedStyle(node).backgroundImage;
    const match = /url\(["']?(.*?)["']?\)/.exec(background || "");
    if (match) urls.add(match[1]);
  });

  return [...urls].slice(0, 4);
}

function describeImages(el, chain, index) {
  const sources = [];

  chain.slice(0, MAX_LOGIC_OWNERS).forEach((entry) => {
    entry.assets.forEach((asset) => sources.push({ via: entry.name, loc: entry.loc, asset }));

    const sourceGroup = entry.fx.find((group) => group.prop === "source");
    (sourceGroup ? sourceGroup.names : []).forEach((name) => {
      const declaration = findDeclaration(index, name, entry.loc.file, entry.loc.line);
      sources.push({
        via: `${entry.name} source={${name}}`,
        loc: declaration || entry.loc,
        asset: extractRequiredAsset(declaration),
      });
    });

    const remote = entry.props?.source?.uri;
    if (typeof remote === "string" && remote) {
      sources.push({ via: `${entry.name} source.uri`, loc: entry.loc, remote: remote.slice(0, 160) });
    }
  });

  return { rendered: collectRenderedImages(el), sources };
}

function describeIcon(chain) {
  const entry = chain.slice(0, 3).find((item) => item.icon);
  if (!entry) {
    return null;
  }

  return {
    family: entry.icon,
    glyph: typeof entry.props?.name === "string" ? entry.props.name : null,
    color: entry.props?.color || null,
    loc: entry.loc,
  };
}

function describeColors(el, hostEntries, index) {
  const primary = hostEntries[0];
  if (!primary) {
    return [];
  }

  const rows = [];
  const resolved = new Map();
  const entriesFor = (entry) => {
    if (!resolved.has(entry)) resolved.set(entry, resolveStyleEntries(index, entry));
    return resolved.get(entry);
  };

  COLOR_PROPS.forEach(({ prop, label, css, inheritFromParent }) => {
    const owners = inheritFromParent ? hostEntries.slice(0, MAX_ANCESTOR_STYLES) : [primary];

    for (const owner of owners) {
      const winner = findWinningEntry(entriesFor(owner), prop);
      if (!winner) continue;

      const domNode = owner === primary ? el : getFiberDomNode(owner.fiber) || el;
      rows.push({
        label,
        value: String(winner.value),
        rendered: readComputedColor(domNode, css),
        owner: owner === primary ? owner.name : `${owner.name} (parent)`,
        loc: locateStyleProp(index, owner, winner.styleEntry, prop),
      });
      return;
    }

    const rendered = readComputedColor(el, css);
    if (rendered && prop === "color") {
      rows.push({ label, value: rendered, rendered, owner: "inherited / default", loc: null });
    }
  });

  if (primary.icon && primary.props?.color) {
    rows.push({
      label: "Icon color",
      value: String(primary.props.color),
      rendered: readComputedColor(el, "color"),
      owner: `${primary.name} color prop`,
      loc: primary.loc,
    });
  }

  return rows;
}

function describeMotion(el, chain, index) {
  const rows = [];

  chain.slice(0, 3).forEach((entry) => {
    entry.fx.forEach((group) => {
      const isMotionProp = MOTION_PROPS.includes(group.prop);
      if (!isMotionProp && !/style$/i.test(group.prop)) return;

      group.names.forEach((name) => {
        const declaration = findDeclaration(index, name, entry.loc.file, entry.loc.line);
        if (isMotionProp || MOTION_HINT.test(declaration?.text || "")) {
          rows.push({ label: `${entry.name} ${group.prop}: ${name}`, loc: declaration || entry.loc });
        }
      });
    });

    flattenAnimatedKeys(entry).forEach((key) =>
      rows.push({ label: `${entry.name} animated value: ${key}`, loc: entry.loc })
    );
  });

  return { rows, computed: readComputedMotion(el) };
}

function flattenAnimatedKeys(entry) {
  const style = entry.props?.style;
  const list = Array.isArray(style) ? style.flat(4) : [style];
  const keys = new Set();

  list.forEach((item) => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    Object.keys(item).forEach((key) => {
      const value = item[key];
      if (value && typeof value === "object" && !Array.isArray(value)) keys.add(key);
    });
  });

  return [...keys];
}

function describeStyleEntries(entry, index) {
  if (!entry) {
    return { applied: [], inline: [] };
  }

  const entries = resolveStyleEntries(index, entry);
  const applied = entries.map((styleEntry) => {
    const firstKey = styleEntry.keys[0];
    return {
      label:
        styleEntry.source.ref ||
        (styleEntry.source.kind === "inline" ? "inline object" : "StyleSheet via props"),
      keys: styleEntry.keys,
      loc: firstKey
        ? locateStyleProp(index, entry, styleEntry, firstKey)
        : entry.loc,
    };
  });

  const inline = entries
    .filter((styleEntry) => styleEntry.source.kind === "inline")
    .flatMap((styleEntry) =>
      styleEntry.keys.map((key) => ({
        key,
        value: formatValue(styleEntry.style[key]),
        loc: locateStyleProp(index, entry, styleEntry, key),
      }))
    );

  return { applied, inline };
}

function formatValue(value) {
  if (value == null || typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value).slice(0, 80);
  } catch {
    return "[object]";
  }
}

function describeLayers(point, index, isInspectorNode) {
  if (!point) {
    return [];
  }

  const layers = [];
  const seen = new Set();

  document.elementsFromPoint(point.x, point.y).forEach((node) => {
    if (layers.length >= MAX_LAYERS || isInspectorNode(node)) return;
    const top = getChainWithTags(node, index, 1)[0];
    const key = top ? `${top.loc.file}:${top.loc.line}:${top.loc.col}` : node.tagName;
    if (seen.has(key)) return;
    seen.add(key);

    const computed = window.getComputedStyle(node);
    layers.push({
      node,
      tag: node.tagName.toLowerCase(),
      name: top?.name || null,
      loc: top?.loc || null,
      hidden: computed.opacity === "0" || computed.visibility === "hidden",
      zIndex: computed.zIndex,
    });
  });

  return layers;
}

// Library wrappers report internal fiber names (e.g. TouchableOpacity -> "View"); prefer the JSX tag.
export function getChainWithTags(node, index, limit) {
  return getInspectorChain(node, limit).map((entry) => ({
    ...entry,
    name: getJsxTagAt(index, entry.loc) || entry.name,
  }));
}

export function describeSelection({ el, point }, index, isInspectorNode) {
  const chain = getChainWithTags(el, index);
  const hostEntries = chain.filter((entry) => entry.kind === "host");

  return {
    chain,
    element: describeElement(el, chain, index),
    logic: describeLogic(chain, index),
    images: describeImages(el, chain, index),
    icon: describeIcon(chain),
    colors: describeColors(el, hostEntries, index),
    motion: describeMotion(el, chain, index),
    styles: describeStyleEntries(hostEntries[0], index),
    inlineAttr: el.getAttribute("style") || "",
    layers: describeLayers(point, index, isInspectorNode),
  };
}
