// moti's index re-exports a SafeAreaView built on React Native's deprecated
// SafeAreaView, which logs a deprecation warning as soon as `moti` is imported
// (and would crash once React Native removes it). Planado never uses it; screens
// use react-native-safe-area-context instead. metro.config.js swaps it for this.
export const SafeAreaView = undefined;
