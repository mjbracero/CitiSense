const {
  createRunOncePlugin,
  withAndroidManifest,
} = require("expo/config-plugins");

/**
 * Force MainActivity to adjustNothing so the OS never pans/resizes the
 * whole window when the keyboard opens. Screens lift their own composers.
 */
function withAndroidAdjustNothing(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    const activities = application?.activity;
    if (!Array.isArray(activities)) {
      return cfg;
    }

    for (const activity of activities) {
      if (activity?.$?.["android:name"] === ".MainActivity") {
        activity.$["android:windowSoftInputMode"] = "adjustNothing";
      }
    }

    return cfg;
  });
}

module.exports = createRunOncePlugin(
  withAndroidAdjustNothing,
  "withAndroidAdjustNothing",
  "1.0.0"
);
