import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    platform: "node",
    target: "node24",
    // GitHub runs dist/index.js straight from the repository, without node_modules,
    // so every dependency has to be bundled in.
    noExternal: [/.*/],
    // Some bundled dependencies are CommonJS and call require() for Node built-ins.
    banner: {
        js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    clean: true,
    sourcemap: true,
});
