import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("build", { recursive: true });
await build({ entryPoints: ["src/main.ts"], bundle: true, platform: "node", target: "node22", format: "cjs", outfile: "build/host.cjs", external: ["@napi-rs/keyring"],
  banner: { js: 'var require = require("node:module").createRequire(require("node:path").join(require("node:path").dirname(process.execPath), "host.cjs"));' } });
