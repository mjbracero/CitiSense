// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// ===== [UI INSPECTOR] Dev-server endpoints for the Cmd+I inspector (never used by exports) =====
if (process.env.NODE_ENV !== "production") {
  const { createUiInspectorMiddleware } = require("./dev/uiInspectorMiddleware");
  const inspectorMiddleware = createUiInspectorMiddleware(__dirname);
  const previousEnhanceMiddleware = config.server.enhanceMiddleware;

  config.server.enhanceMiddleware = (metroMiddleware, server) => {
    const nextMiddleware = previousEnhanceMiddleware
      ? previousEnhanceMiddleware(metroMiddleware, server)
      : metroMiddleware;

    return (req, res, next) =>
      inspectorMiddleware(req, res, () => nextMiddleware(req, res, next));
  };
}

module.exports = config;
