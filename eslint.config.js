// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // Loading and resetting server-backed forms in an effect is intentional in this app.
      "react-hooks/set-state-in-effect": "off",
    },
  }
]);
