
const ESM_DEPS_TO_TRANSFORM = "@naviprotocol|@mysten";

export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  rootDir: "__tests__", // root directory for Jest
  extensionsToTreatAsEsm: [".ts"], // Treat TypeScript files as ESM
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true, // ts-jest ESM support
        tsconfig: "tsconfig.esm.json", // Path to your TypeScript config for ESM
      },
    ],
    [`node_modules/(${ESM_DEPS_TO_TRANSFORM})/.+\\.(js|mjs)$`]: [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.esm.json",
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1", // Handle .js imports in TypeScript
  },
  transformIgnorePatterns: [`/node_modules/(?!(${ESM_DEPS_TO_TRANSFORM})/)`],
};
