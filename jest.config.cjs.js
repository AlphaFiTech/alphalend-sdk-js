export default {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "__tests__", // root directory for Jest
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: false, // Do not treat files as ESM
        tsconfig: "tsconfig.cjs.json", // Path to your TypeScript config for CJS
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1", // Handle .js imports in TypeScript
  },
};
