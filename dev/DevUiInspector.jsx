// ===== [UI INSPECTOR] Dev-only Cmd+I UI inspector panel (Expo web dev server only) =====
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { describeSelection, getChainWithTags } from "./inspectorDescribe";
import { getInspectorChain } from "./inspectorFiber";
import { formatLoc, loadSourceIndex, openInEditor, searchSource } from "./inspectorLookup";

const STORAGE_KEYS = {
  open: "citisense.uiInspector.open",
  minimized: "citisense.uiInspector.minimized",
  side: "citisense.uiInspector.side",
  lastLoc: "citisense.uiInspector.lastLoc",
  position: "citisense.uiInspector.position",
};
const DRAG_MARGIN = 40;

function readPosition() {
  try {
    const value = JSON.parse(readStorage(STORAGE_KEYS.position, "null"));
    return Number.isFinite(value?.x) && Number.isFinite(value?.y) ? value : null;
  } catch {
    return null;
  }
}

// Keep at least DRAG_MARGIN px of the panel on screen so the header stays grabbable.
function clampPosition(x, y, width) {
  return {
    x: Math.min(Math.max(x, DRAG_MARGIN - width), window.innerWidth - DRAG_MARGIN),
    y: Math.min(Math.max(y, 0), window.innerHeight - DRAG_MARGIN),
  };
}
const PICKING_CLASS = "insp-picking";
const BLOCKED_EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
const NARROW_VIEWPORT = 520;
const Z_INDEX = 2147483000;
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
const TOGGLE_LABEL = IS_MAC ? "Cmd+I" : "Ctrl+I";
const HELP_TEXT =
  `${TOGGLE_LABEL} toggle \u00B7 Esc clear/close \u00B7 Click select \u00B7 Shift+click pass through \u00B7 Alt+click open source \u00B7 Touch: drag to preview, lift to select (pause to scroll)`;

const PANEL_CSS = `
.${PICKING_CLASS}, .${PICKING_CLASS} * { cursor: crosshair !important; }
.${PICKING_CLASS} input, .${PICKING_CLASS} textarea, .${PICKING_CLASS} [contenteditable="true"] { cursor: text !important; }
.${PICKING_CLASS} [data-insp-root], .${PICKING_CLASS} [data-insp-root] * { cursor: default !important; }
[data-insp-root] button { cursor: pointer !important; font: inherit; }
.${PICKING_CLASS} [data-insp-root] [data-insp-drag] { cursor: move !important; }
[data-insp-panel] { opacity: 0.6; transition: opacity 120ms ease; }
[data-insp-panel]:hover, [data-insp-panel]:focus-within { opacity: 1; }
[data-insp-pill] { opacity: 0.45; }
[data-insp-pill]:hover { opacity: 1; }
@media (hover: none) { [data-insp-panel], [data-insp-pill] { opacity: 1; } }
`;

const COLORS = {
  panel: "rgba(17, 20, 26, 0.92)",
  border: "rgba(255, 255, 255, 0.12)",
  text: "rgba(230, 233, 238, 1)",
  muted: "rgba(150, 158, 170, 1)",
  badge: "rgba(96, 165, 250, 1)",
  badgeBg: "rgba(96, 165, 250, 0.12)",
  amber: "rgba(245, 158, 11, 1)",
  hover: "rgba(96, 165, 250, 0.9)",
  label: "rgba(10, 12, 16, 0.92)",
};

function readStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the inspector still works.
  }
}

// Cmd+I only means "italic" in rich-text editors; plain inputs still toggle the inspector.
function isRichTextTarget(target) {
  return Boolean(target instanceof Element && target.isContentEditable);
}

// Form fields stay usable while picking: clicks pass through (and still select them).
function isFormField(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isInspectorNode(node) {
  return Boolean(node instanceof Element && node.closest("[data-insp-root]"));
}

function centerOf(el) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function placeBox(box, el) {
  if (!box) return;
  if (!el || !el.isConnected) {
    box.style.display = "none";
    return;
  }
  const rect = el.getBoundingClientRect();
  box.style.display = "block";
  box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
}

// ===== [UI INSPECTOR] Small presentational pieces =====
function Badge({ loc, label }) {
  if (!loc?.file) return null;
  return (
    <button
      type="button"
      title={`Open ${loc.file}:${loc.line} in VS Code`}
      onClick={(event) => {
        event.stopPropagation();
        openInEditor(loc);
      }}
      style={styles.badge}
    >
      {label || formatLoc(loc)}
    </button>
  );
}

function Section({ title, children, hidden }) {
  if (hidden) return null;
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function Row({ children }) {
  return <div style={styles.row}>{children}</div>;
}

function Swatch({ color }) {
  if (!color) return null;
  return <span style={{ ...styles.swatch, background: color }} />;
}

function Code({ children }) {
  return <span style={styles.code}>{children}</span>;
}

// ===== [UI INSPECTOR] Panel =====
export default function DevUiInspector() {
  const [open, setOpen] = useState(() => readStorage(STORAGE_KEYS.open, "0") === "1");
  const [picking, setPicking] = useState(true);
  const [minimized, setMinimized] = useState(() => readStorage(STORAGE_KEYS.minimized, "0") === "1");
  const [side, setSide] = useState(() => readStorage(STORAGE_KEYS.side, "right"));
  const [lastLoc, setLastLoc] = useState(() => readStorage(STORAGE_KEYS.lastLoc, ""));
  const [position, setPosition] = useState(readPosition);
  const dragRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const [query, setQuery] = useState("");
  const [indexState, setIndexState] = useState({ status: "idle", index: null, error: null });
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_VIEWPORT);

  const hoverBoxRef = useRef(null);
  const hoverLabelRef = useRef(null);
  const selectBoxRef = useRef(null);
  const hoverTargetRef = useRef(null);
  const hoverLabelTargetRef = useRef(null);
  const selectedElRef = useRef(null);
  const openRef = useRef(open);
  const selectionRef = useRef(selection);

  const indexRef = useRef(null);

  openRef.current = open;
  selectionRef.current = selection;
  indexRef.current = indexState.index;

  const selectElement = useCallback((el, point) => {
    if (!el) return;
    selectedElRef.current = el;
    setSelection({ el, point: point || centerOf(el), at: Date.now() });

    const top = getInspectorChain(el, 1)[0];
    if (top) {
      const value = formatLoc(top.loc);
      setLastLoc(value);
      writeStorage(STORAGE_KEYS.lastLoc, value);
    }
  }, []);

  const clearSelection = useCallback(() => {
    selectedElRef.current = null;
    setSelection(null);
  }, []);

  // --- Cmd+I toggle & Esc ---
  useEffect(() => {
    const onKeyDown = (event) => {
      const key = String(event.key || "").toLowerCase();

      const toggleModifier = IS_MAC
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;

      if (key === "i" && toggleModifier && !event.altKey && !event.shiftKey) {
        if (isRichTextTarget(event.target)) return;
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }

      if (key === "escape" && openRef.current) {
        if (selectionRef.current) clearSelection();
        else setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [clearSelection]);

  // --- Phone-width viewports dock the panel as a bottom sheet ---
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < NARROW_VIEWPORT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // --- Source index (refreshed every time the panel opens) ---
  useEffect(() => {
    writeStorage(STORAGE_KEYS.open, open ? "1" : "0");
    if (!open) return undefined;
    let cancelled = false;

    setIndexState((state) => ({ ...state, status: "loading", error: null }));
    loadSourceIndex({ refresh: true })
      .then((index) => {
        if (!cancelled) setIndexState({ status: "ready", index, error: null });
      })
      .catch((error) => {
        if (!cancelled) setIndexState({ status: "error", index: null, error: String(error.message || error) });
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // --- Picking: block page clicks, track hover target ---
  const isPicking = open && picking && !minimized;

  useEffect(() => {
    if (!isPicking) return undefined;

    const onBlockedEvent = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || isInspectorNode(target) || event.shiftKey) return;

      if (isFormField(target)) {
        if (event.type === "click") selectElement(target, { x: event.clientX, y: event.clientY });
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.type !== "click") return;
      if (event.altKey) {
        const top = getInspectorChain(target, 1)[0];
        if (top) openInEditor(top.loc);
        return;
      }
      selectElement(target, { x: event.clientX, y: event.clientY });
    };

    const onMouseMove = (event) => {
      const target = event.target;
      hoverTargetRef.current = target instanceof Element && !isInspectorNode(target) ? target : null;
    };

    const onMouseLeave = () => {
      hoverTargetRef.current = null;
    };

    // Touch (phones / DevTools device mode): finger down or drag previews, lift selects.
    // Blocking touchstart also cancels the synthetic mouse/click events.
    const touchTarget = (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return { el: null, point: null };
      const point = { x: touch.clientX, y: touch.clientY };
      const el = document.elementFromPoint(point.x, point.y);
      return { el: el && !isInspectorNode(el) ? el : null, point };
    };

    const onTouchMove = (event) => {
      if (isInspectorNode(event.target)) return;
      if (event.type === "touchstart" && isFormField(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      hoverTargetRef.current = touchTarget(event).el;
    };

    const onTouchEnd = (event) => {
      if (isInspectorNode(event.target) || isFormField(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const { el, point } = touchTarget(event);
      hoverTargetRef.current = null;
      if (el) selectElement(el, point);
    };

    const onTouchCancel = () => {
      hoverTargetRef.current = null;
    };

    const touchOptions = { capture: true, passive: false };
    BLOCKED_EVENTS.forEach((type) =>
      window.addEventListener(type, onBlockedEvent, { capture: true, passive: false })
    );
    window.addEventListener("touchstart", onTouchMove, touchOptions);
    window.addEventListener("touchmove", onTouchMove, touchOptions);
    window.addEventListener("touchend", onTouchEnd, touchOptions);
    window.addEventListener("touchcancel", onTouchCancel, true);
    window.addEventListener("mousemove", onMouseMove, true);
    document.documentElement.addEventListener("mouseleave", onMouseLeave);
    document.documentElement.classList.add(PICKING_CLASS);

    return () => {
      BLOCKED_EVENTS.forEach((type) =>
        window.removeEventListener(type, onBlockedEvent, { capture: true })
      );
      window.removeEventListener("touchstart", onTouchMove, touchOptions);
      window.removeEventListener("touchmove", onTouchMove, touchOptions);
      window.removeEventListener("touchend", onTouchEnd, touchOptions);
      window.removeEventListener("touchcancel", onTouchCancel, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
      document.documentElement.classList.remove(PICKING_CLASS);
      hoverTargetRef.current = null;
    };
  }, [isPicking, selectElement]);

  // --- Overlay boxes positioned imperatively every frame (no React state) ---
  useEffect(() => {
    if (!open) return undefined;
    let frame = 0;

    const paint = () => {
      const hoverTarget = isPicking ? hoverTargetRef.current : null;
      placeBox(hoverBoxRef.current, hoverTarget);
      placeBox(selectBoxRef.current, selectedElRef.current);

      const label = hoverLabelRef.current;
      if (label) {
        if (!hoverTarget || !hoverTarget.isConnected) {
          label.style.display = "none";
          hoverLabelTargetRef.current = null;
        } else {
          if (hoverLabelTargetRef.current !== hoverTarget) {
            hoverLabelTargetRef.current = hoverTarget;
            const top = getChainWithTags(hoverTarget, indexRef.current, 1)[0];
            label.textContent = top
              ? `${top.name || hoverTarget.tagName.toLowerCase()} \u00B7 ${formatLoc(top.loc)}`
              : hoverTarget.tagName.toLowerCase();
          }
          const rect = hoverTarget.getBoundingClientRect();
          label.style.display = "block";
          label.style.transform = `translate(${Math.max(0, rect.left)}px, ${Math.max(0, rect.top - 18)}px)`;
        }
      }

      frame = window.requestAnimationFrame(paint);
    };

    frame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(frame);
  }, [open, isPicking]);

  const details = useMemo(
    () => (selection && selection.el.isConnected ? describeSelection(selection, indexState.index, isInspectorNode) : null),
    [selection, indexState.index]
  );

  const searchResults = useMemo(
    () => (query.trim().length >= 2 ? searchSource(indexState.index, query) : []),
    [query, indexState.index]
  );

  const toggleMinimized = () => {
    setMinimized((value) => {
      writeStorage(STORAGE_KEYS.minimized, value ? "0" : "1");
      return !value;
    });
  };

  // --- Drag the panel by its header (mouse or touch); position persists ---
  const onHeaderPointerDown = (event) => {
    if (event.button > 0 || event.target.closest("button")) return;
    const panel = event.currentTarget.parentElement;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture fails for synthetic pointers; dragging still works while over the header.
    }
    event.preventDefault();
  };

  const onHeaderPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition(
      clampPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY, drag.width)
    );
  };

  const onHeaderPointerUp = (event) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Not captured (synthetic pointer); nothing to release.
    }
    setPosition((value) => {
      if (value) writeStorage(STORAGE_KEYS.position, JSON.stringify(value));
      return value;
    });
  };

  const swapSide = () => {
    setPosition(null);
    writeStorage(STORAGE_KEYS.position, "null");
    setSide((value) => {
      const next = value === "right" ? "left" : "right";
      writeStorage(STORAGE_KEYS.side, next);
      return next;
    });
  };

  const selectParent = () => {
    const el = selectedElRef.current;
    if (!el) return;
    const currentLoc = formatLoc(getInspectorChain(el, 1)[0]?.loc);
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const top = getInspectorChain(parent, 1)[0];
      if (!top || formatLoc(top.loc) !== currentLoc) break;
      parent = parent.parentElement;
    }
    if (parent && parent !== document.body) selectElement(parent, centerOf(parent));
  };

  if (!open || typeof document === "undefined") return null;

  const sideStyle = side === "right" ? { right: 12 } : { left: 12 };
  const panelPlacement = narrow
    ? {
        ...(side === "right" ? { right: 6 } : { left: 6 }),
        top: 6,
        width: "min(300px, calc(100vw - 12px))",
        maxHeight: "45vh",
      }
    : sideStyle;

  return createPortal(
    <div data-insp-root="">
      <style>{PANEL_CSS}</style>
      <div ref={hoverBoxRef} style={styles.hoverBox} />
      <div ref={hoverLabelRef} style={styles.hoverLabel} />
      <div ref={selectBoxRef} style={styles.selectBox} />

      {minimized ? (
        <button
          type="button"
          data-insp-pill=""
          title={`Restore inspector\n${HELP_TEXT}`}
          onClick={toggleMinimized}
          style={{ ...styles.pill, ...sideStyle }}
        >
          {"\u25C9 "}
          {lastLoc || "Inspector"}
        </button>
      ) : (
        <div
          data-insp-panel=""
          style={{
            ...styles.panel,
            ...panelPlacement,
            ...(position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : null),
          }}
        >
          <div
            data-insp-drag=""
            style={styles.header}
            title={`Drag to move \u00B7 \u21C4 resets position\n${HELP_TEXT}`}
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={onHeaderPointerUp}
          >
            <span style={styles.title}>Inspector</span>
            <span style={styles.headerSpacer} />
            <button
              type="button"
              title={picking ? "Pause picking" : "Resume picking"}
              onClick={() => setPicking((value) => !value)}
              style={styles.iconButton}
            >
              {picking ? "\u23F8" : "\u25B6"}
            </button>
            <button type="button" title="Swap side" onClick={swapSide} style={styles.iconButton}>
              {"\u21C4"}
            </button>
            <button type="button" title="Minimize" onClick={toggleMinimized} style={styles.iconButton}>
              {"\u2013"}
            </button>
            <button type="button" title={`Close (${TOGGLE_LABEL})`} onClick={() => setOpen(false)} style={styles.iconButton}>
              {"\u00D7"}
            </button>
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search source (min 2 chars)"
            style={styles.search}
          />

          <div style={styles.body}>
            {indexState.status === "loading" ? <div style={styles.muted}>Loading source index...</div> : null}
            {indexState.status === "error" ? (
              <div style={styles.error}>Source index unavailable: {indexState.error}</div>
            ) : null}

            {searchResults.length > 0 ? (
              <Section title={`Search (${searchResults.length})`}>
                {searchResults.map((loc) => (
                  <Row key={`${loc.file}:${loc.line}:${loc.col}`}>
                    <Badge loc={loc} />
                    <Code>{loc.text.slice(0, 90)}</Code>
                  </Row>
                ))}
              </Section>
            ) : null}

            {!details ? (
              <div style={styles.muted}>
                {picking ? "Hover and click an element to inspect it." : "Picking paused."}
              </div>
            ) : (
              <InspectorDetails details={details} onSelectParent={selectParent} onSelectLayer={selectElement} />
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

// ===== [UI INSPECTOR] Selected element sections =====
function InspectorDetails({ details, onSelectParent, onSelectLayer }) {
  const { element, logic, images, icon, colors, motion, styles: styleInfo, inlineAttr, layers } = details;

  return (
    <>
      <Section title="Element">
        <Row>
          <Code>
            {element.name ? `<${element.name}>` : ""} {element.tag}
          </Code>
          <Badge loc={element.loc} />
        </Row>
        {element.text ? (
          <Row>
            <span style={styles.muted}>text</span>
            <Code>{`"${element.text}"`}</Code>
            <Badge loc={element.textLoc} />
          </Row>
        ) : null}
        {element.components.map((component) => (
          <Row key={`${component.name}-${formatLoc(component.usage)}`}>
            <span style={styles.muted}>in</span>
            <Code>{`<${component.name}>`}</Code>
            <Badge loc={component.usage} label={`used ${formatLoc(component.usage)}`} />
            <Badge loc={component.definition} label="def" />
          </Row>
        ))}
        {!element.loc ? <div style={styles.muted}>No tagged source (rendered by a library).</div> : null}
        <button type="button" onClick={onSelectParent} style={styles.textButton}>
          Select parent
        </button>
      </Section>

      <Section title="Logic" hidden={!logic.some((owner) => owner.groups.length)}>
        {logic.map((owner) =>
          owner.groups.map((group) => (
            <div key={`${formatLoc(owner.loc)}-${group.prop}`} style={styles.group}>
              <Row>
                <Code>{`${owner.name} ${group.prop === "..." ? "{...spread}" : group.prop}`}</Code>
                <Badge loc={owner.loc} />
              </Row>
              {group.items.map((item) => (
                <div key={item.name} style={styles.indent}>
                  <Row>
                    <Code>{item.name}</Code>
                    <span style={styles.muted}>{item.declaration?.kind || "not found"}</span>
                    <Badge loc={item.declaration} />
                  </Row>
                  {item.declaration?.text ? <div style={styles.snippet}>{item.declaration.text.slice(0, 110)}</div> : null}
                  {item.setterCalls.map((call) => (
                    <Row key={`${call.file}:${call.line}`}>
                      <span style={styles.muted}>{item.setter || item.name}()</span>
                      <Badge loc={call} />
                    </Row>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </Section>

      <Section title="Images" hidden={!images.rendered.length && !images.sources.length}>
        {images.sources.map((source, i) => (
          <div key={`${source.via}-${i}`} style={styles.group}>
            <Row>
              <span style={styles.muted}>{source.via}</span>
              <Badge loc={source.loc} />
            </Row>
            {source.asset ? (
              <Row>
                <span style={styles.muted}>replace</span>
                <Code>{source.asset}</Code>
              </Row>
            ) : null}
            {source.remote ? <div style={styles.snippet}>{source.remote}</div> : null}
          </div>
        ))}
        {images.rendered.map((url) => (
          <div key={url} style={styles.snippet}>
            {url.slice(0, 140)}
          </div>
        ))}
      </Section>

      <Section title="Icon" hidden={!icon}>
        {icon ? (
          <Row>
            <Code>{`${icon.family} \u00B7 ${icon.glyph || "(dynamic name)"}`}</Code>
            <Badge loc={icon.loc} />
          </Row>
        ) : null}
      </Section>

      <Section title="Colors" hidden={!colors.length}>
        {colors.map((row) => (
          <div key={`${row.label}-${row.owner}`} style={styles.group}>
            <Row>
              <Swatch color={row.rendered || row.value} />
              <span style={styles.muted}>{row.label}</span>
              <Code>{row.value}</Code>
              <Badge loc={row.loc} />
            </Row>
            <div style={styles.indentMuted}>
              {row.owner}
              {row.loc?.label ? ` \u00B7 ${row.loc.label}` : ""}
              {row.rendered && row.rendered !== row.value ? ` \u00B7 rendered ${row.rendered}` : ""}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Motion" hidden={!motion.rows.length && !motion.computed.length}>
        {motion.rows.map((row, i) => (
          <Row key={`${row.label}-${i}`}>
            <Code>{row.label}</Code>
            <Badge loc={row.loc} />
          </Row>
        ))}
        {motion.computed.map((line) => (
          <div key={line} style={styles.snippet}>
            {line.slice(0, 120)}
          </div>
        ))}
      </Section>

      <Section title="Styles applied (last wins)" hidden={!styleInfo.applied.length}>
        {styleInfo.applied.map((entry, i) => (
          <Row key={`${entry.label}-${i}`}>
            <span style={styles.muted}>{i + 1}.</span>
            <Code>{entry.label}</Code>
            <Badge loc={entry.loc} />
            <span style={styles.muted}>{entry.keys.slice(0, 4).join(", ")}</span>
          </Row>
        ))}
      </Section>

      <Section title="Inline style" hidden={!styleInfo.inline.length && !inlineAttr}>
        {styleInfo.inline.map((item, i) => (
          <Row key={`${item.key}-${i}`}>
            <Code>{`${item.key}: ${item.value}`}</Code>
            <Badge loc={item.loc} />
          </Row>
        ))}
        {inlineAttr ? <div style={styles.snippet}>{inlineAttr.slice(0, 160)}</div> : null}
      </Section>

      <Section title="Layers at this point" hidden={!layers.length}>
        {layers.map((layer, i) => (
          <Row key={`${layer.tag}-${i}`}>
            <button type="button" onClick={() => onSelectLayer(layer.node)} style={styles.textButton}>
              {layer.name || layer.tag}
            </button>
            {layer.hidden ? <span style={styles.muted}>hidden</span> : null}
            {layer.zIndex !== "auto" ? <span style={styles.muted}>z {layer.zIndex}</span> : null}
            <Badge loc={layer.loc} />
          </Row>
        ))}
      </Section>
    </>
  );
}

// ===== [UI INSPECTOR] Styles =====
const styles = {
  panel: {
    position: "fixed",
    top: 12,
    width: 300,
    maxHeight: "65vh",
    display: "flex",
    flexDirection: "column",
    background: COLORS.panel,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
    font: "11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    zIndex: Z_INDEX,
    backdropFilter: "blur(6px)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    cursor: "move",
    touchAction: "none",
    userSelect: "none",
    gap: 2,
    padding: "4px 6px",
    borderBottom: `1px solid ${COLORS.border}`,
  },
  title: { fontWeight: 700, letterSpacing: 0.3 },
  headerSpacer: { flex: 1 },
  iconButton: {
    width: 20,
    height: 18,
    padding: 0,
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: "18px",
  },
  search: {
    margin: "6px 6px 0",
    padding: "3px 6px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 4,
    background: "rgba(255, 255, 255, 0.05)",
    color: COLORS.text,
    font: "inherit",
    outline: "none",
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    touchAction: "pan-y",
    padding: "4px 6px 8px",
  },
  section: { marginTop: 8 },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, margin: "2px 0" },
  group: { marginBottom: 4 },
  indent: { paddingLeft: 10 },
  indentMuted: { paddingLeft: 14, color: COLORS.muted, fontSize: 10 },
  snippet: {
    color: COLORS.muted,
    fontSize: 10,
    paddingLeft: 10,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  code: { color: COLORS.text, wordBreak: "break-all" },
  muted: { color: COLORS.muted },
  error: { color: COLORS.amber },
  badge: {
    padding: "0 4px",
    border: "none",
    borderRadius: 3,
    background: COLORS.badgeBg,
    color: COLORS.badge,
    fontSize: 10,
    lineHeight: "15px",
  },
  textButton: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: COLORS.badge,
    fontSize: 10,
    textDecoration: "underline",
  },
  swatch: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: 2,
    border: `1px solid ${COLORS.border}`,
  },
  pill: {
    position: "fixed",
    bottom: 10,
    maxWidth: 240,
    padding: "2px 8px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 999,
    background: COLORS.panel,
    color: COLORS.text,
    font: "10px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    zIndex: Z_INDEX,
  },
  hoverBox: {
    position: "fixed",
    top: 0,
    left: 0,
    display: "none",
    border: `1px dashed ${COLORS.hover}`,
    pointerEvents: "none",
    zIndex: Z_INDEX - 2,
  },
  hoverLabel: {
    position: "fixed",
    top: 0,
    left: 0,
    display: "none",
    padding: "1px 5px",
    borderRadius: 3,
    background: COLORS.label,
    color: COLORS.text,
    font: "10px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: Z_INDEX - 1,
  },
  selectBox: {
    position: "fixed",
    top: 0,
    left: 0,
    display: "none",
    border: `1.5px solid ${COLORS.amber}`,
    pointerEvents: "none",
    zIndex: Z_INDEX - 2,
  },
};
