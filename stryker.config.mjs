/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  plugins: ["@stryker-mutator/*", "@hughescr/stryker-bun-runner"],
  testRunner: "bun",
  coverageAnalysis: "perTest",
  mutate: ["src/**/*.ts", "!src/generated/**"],
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  reporters: ["clear-text", "progress", "html"],
  bun: {
    inspectorTimeout: 10000,
  },
};
