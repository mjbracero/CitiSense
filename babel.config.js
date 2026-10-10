module.exports = function (api) {
  api.cache.using(() => process.env.NODE_ENV);

  // [UI INSPECTOR] Cmd+I source tagging, only for web dev bundles (never native or production).
  const isWebDev = api.caller(
    (caller) => Boolean(caller && caller.platform === "web" && caller.isDev)
  );

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      ...(isWebDev ? ["./dev/uiInspectorBabelPlugin"] : []),
      "react-native-reanimated/plugin",
    ],
  };
};
