// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// framer-motion (used by moti for AnimatePresence) imports `tslib`. In the Node
// environment Expo uses for web static rendering, tslib's "node" export wraps a
// CommonJS file and Metro's interop leaves `tslib.default` undefined. Resolving
// every `tslib` import to its ES module build works on web, Node, and native.
const tslibModule = require.resolve('tslib/tslib.es6.js');

// See shims/moti-safe-area-view.js.
const motiSafeAreaShim = path.resolve(__dirname, 'shims/moti-safe-area-view.js');
const motiComponentsIndex = /[\\/]node_modules[\\/]moti[\\/]build[\\/]components[\\/]index\.js$/;

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return { type: 'sourceFile', filePath: tslibModule };
  }
  if (moduleName === './safe-area-view' && motiComponentsIndex.test(context.originModulePath)) {
    return { type: 'sourceFile', filePath: motiSafeAreaShim };
  }
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  return resolve(context, moduleName, platform);
};

module.exports = config;
