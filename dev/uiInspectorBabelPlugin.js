// ===== [UI INSPECTOR] Dev-only Babel transform (web dev bundles only, see babel.config.js) =====
// Tags every JSX element in the app source with data-insp-* props so the
// in-browser inspector (dev/DevUiInspector.jsx) can map DOM nodes back to
// file:line through React fiber props. Attributes are inserted into the
// existing opening element, so original line/column locations are preserved.
const path = require("path");

const SOURCE_DIRS = ["app", "components", "hooks", "lib", "utils", "constants"];
const SKIP_MODULES = [/^react$/, /^expo-router(\/|$)/, /^@react-navigation\//];
const ICON_MODULE = /^@expo\/vector-icons(?:\/(.+))?$/;
const SKIP_ELEMENTS = new Set(["Fragment", "StrictMode", "Suspense", "Profiler"]);
const IGNORED_PROPS = new Set(["key", "children", "ref", "__source", "__self"]);
const IGNORED_NAMES = new Set([
  "undefined",
  "NaN",
  "Infinity",
  "require",
  "console",
  "Math",
  "JSON",
  "Number",
  "String",
  "Boolean",
  "Object",
  "Array",
  "Date",
]);
const INSPECTOR_ATTRS = new Set(["data-insp-src", "data-insp-use"]);
const MAX_NAMES_PER_PROP = 6;
const MAX_ATTR_LENGTH = 320;

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function isStyleProp(name) {
  return name === "style" || /Style$/.test(name);
}

function truncate(value) {
  return value.length > MAX_ATTR_LENGTH ? value.slice(0, MAX_ATTR_LENGTH) : value;
}

module.exports = function uiInspectorBabelPlugin({ types: t }) {
  // --- Collect referenced names / style refs / asset requires from one prop expression ---
  function scanExpression(expression, { styleProp, file, root }) {
    const names = [];
    const styleRefs = [];
    const assets = [];
    const excluded = new Set();

    const addName = (name) => {
      if (!excluded.has(name) && !IGNORED_NAMES.has(name) && !names.includes(name)) {
        names.push(name);
      }
    };

    const walk = (node, parent, parentKey) => {
      if (!node || typeof node.type !== "string") {
        return;
      }

      if (
        node.type === "ArrowFunctionExpression" ||
        node.type === "FunctionExpression"
      ) {
        node.params.forEach((param) => {
          Object.keys(t.getBindingIdentifiers(param)).forEach((name) =>
            excluded.add(name)
          );
        });
        walk(node.body, node, "body");
        return;
      }

      if (node.type === "Identifier") {
        const isMemberProperty =
          parent &&
          (parent.type === "MemberExpression" ||
            parent.type === "OptionalMemberExpression") &&
          parentKey === "property" &&
          !parent.computed;
        const isObjectKey =
          parent &&
          parent.type === "ObjectProperty" &&
          parentKey === "key" &&
          !parent.computed;

        if (!isMemberProperty && !isObjectKey) {
          addName(node.name);
        }
        return;
      }

      if (
        styleProp &&
        (node.type === "MemberExpression" ||
          node.type === "OptionalMemberExpression") &&
        !node.computed &&
        node.object.type === "Identifier" &&
        node.property.type === "Identifier"
      ) {
        const ref = `${node.object.name}.${node.property.name}`;
        if (!styleRefs.includes(ref)) {
          styleRefs.push(ref);
        }
        return;
      }

      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "require" &&
        node.arguments.length === 1 &&
        node.arguments[0].type === "StringLiteral"
      ) {
        const absolute = path.resolve(path.dirname(file), node.arguments[0].value);
        assets.push(toPosix(path.relative(root, absolute)));
        return;
      }

      (t.VISITOR_KEYS[node.type] || []).forEach((key) => {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach((item) => walk(item, node, key));
        } else {
          walk(child, node, key);
        }
      });
    };

    walk(expression, null, null);
    return { names: names.slice(0, MAX_NAMES_PER_PROP), styleRefs, assets };
  }

  // --- Build data-insp-fx / data-insp-sty / data-insp-asset values for one element ---
  function describeProps(attributes, context) {
    const fx = [];
    const sty = [];
    const assets = [];

    attributes.forEach((attribute) => {
      if (attribute.type === "JSXSpreadAttribute") {
        const { names } = scanExpression(attribute.argument, context);
        if (names.length) {
          fx.push(`...:${names.join(",")}`);
        }
        return;
      }

      const propName =
        attribute.name.type === "JSXNamespacedName"
          ? `${attribute.name.namespace.name}:${attribute.name.name.name}`
          : attribute.name.name;

      if (
        IGNORED_PROPS.has(propName) ||
        !attribute.value ||
        attribute.value.type !== "JSXExpressionContainer" ||
        attribute.value.expression.type === "JSXEmptyExpression"
      ) {
        return;
      }

      const scanned = scanExpression(attribute.value.expression, {
        ...context,
        styleProp: isStyleProp(propName),
      });

      if (scanned.names.length) {
        fx.push(`${propName}:${scanned.names.join(",")}`);
      }
      if (scanned.styleRefs.length) {
        sty.push(`${propName}:${scanned.styleRefs.join(",")}`);
      }
      assets.push(...scanned.assets);
    });

    return {
      fx: truncate(fx.join(";")),
      sty: truncate(sty.join(";")),
      asset: truncate(assets.join(",")),
    };
  }

  function stringAttr(name, value) {
    return t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value));
  }

  return {
    name: "citisense-ui-inspector",
    visitor: {
      Program(programPath, state) {
        const filename = state.filename || "";
        const root = state.file.opts.root || state.file.opts.cwd || process.cwd();
        const relative = toPosix(path.relative(root, filename));
        const topDir = relative.split("/")[0];

        state.inspSkip =
          !filename ||
          filename.includes("node_modules") ||
          filename.includes("?") ||
          filename.includes("\0") ||
          !SOURCE_DIRS.includes(topDir) ||
          !/\.(jsx?|tsx?)$/.test(filename);

        if (state.inspSkip) {
          return;
        }

        state.inspRoot = root;
        state.inspRelative = relative;
        state.inspPackageNames = new Set();
        state.inspSkipNames = new Set();
        state.inspIconNames = new Map();

        programPath.get("body").forEach((statement) => {
          if (!statement.isImportDeclaration()) {
            return;
          }

          const source = statement.node.source.value;
          const isRelative = source.startsWith(".") || source.startsWith("@/");
          const skip = SKIP_MODULES.some((pattern) => pattern.test(source));
          const iconMatch = ICON_MODULE.exec(source);

          statement.node.specifiers.forEach((specifier) => {
            const local = specifier.local.name;

            if (skip) {
              state.inspSkipNames.add(local);
            } else if (iconMatch) {
              const family =
                specifier.type === "ImportSpecifier"
                  ? specifier.imported.name || specifier.imported.value
                  : iconMatch[1] || local;
              state.inspIconNames.set(local, family);
            } else if (!isRelative) {
              state.inspPackageNames.add(local);
            }
          });
        });
      },

      JSXOpeningElement(elementPath, state) {
        if (state.inspSkip) {
          return;
        }

        const { node } = elementPath;
        const hasInspectorAttr = node.attributes.some(
          (attribute) =>
            attribute.type === "JSXAttribute" &&
            attribute.name.type === "JSXIdentifier" &&
            INSPECTOR_ATTRS.has(attribute.name.name)
        );

        if (hasInspectorAttr || !node.loc) {
          return;
        }

        let kind = null;
        let iconFamily = null;

        if (node.name.type === "JSXIdentifier") {
          const tag = node.name.name;

          if (/^[a-z]/.test(tag)) {
            kind = "host";
          } else if (SKIP_ELEMENTS.has(tag) || state.inspSkipNames.has(tag)) {
            kind = null;
          } else if (state.inspIconNames.has(tag)) {
            kind = "host";
            iconFamily = state.inspIconNames.get(tag);
          } else if (state.inspPackageNames.has(tag)) {
            kind = "host";
          } else {
            kind = "component";
          }
        } else if (
          node.name.type === "JSXMemberExpression" &&
          node.name.object.type === "JSXIdentifier" &&
          state.inspPackageNames.has(node.name.object.name)
        ) {
          kind = "host";
        }

        if (!kind) {
          return;
        }

        const loc = `${state.inspRelative}:${node.loc.start.line}:${node.loc.start.column + 1}`;
        const { fx, sty, asset } = describeProps(node.attributes, {
          file: state.filename,
          root: state.inspRoot,
        });

        const attributes =
          kind === "host"
            ? [stringAttr("data-insp-src", loc)]
            : [stringAttr("data-insp-use", loc)];

        if (iconFamily) {
          attributes.push(stringAttr("data-insp-icon", iconFamily));
        }
        if (fx) {
          attributes.push(stringAttr(kind === "host" ? "data-insp-fx" : "data-insp-usefx", fx));
        }
        if (sty) {
          attributes.push(stringAttr("data-insp-sty", sty));
        }
        if (asset) {
          attributes.push(stringAttr("data-insp-asset", asset));
        }

        node.attributes.unshift(...attributes);
      },
    },
  };
};
