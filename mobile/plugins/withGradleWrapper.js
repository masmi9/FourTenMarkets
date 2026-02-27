const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Config plugin to update the Gradle wrapper to 8.13.
 * Required because Expo 54 uses AGP 8.8+ which needs Gradle 8.13,
 * but the prebuild template generates a wrapper with Gradle 8.10.2.
 */
module.exports = (config) => {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const wrapperPropsPath = path.join(
        config.modRequest.platformProjectRoot,
        "gradle/wrapper/gradle-wrapper.properties"
      );

      if (fs.existsSync(wrapperPropsPath)) {
        let content = fs.readFileSync(wrapperPropsPath, "utf-8");
        content = content.replace(
          /distributionUrl=.*/,
          "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.13-bin.zip"
        );
        fs.writeFileSync(wrapperPropsPath, content);
      }

      return config;
    },
  ]);
};
