import { createRequire } from "node:module";
import path from "node:path";
import { runPackageFormatterCommand } from "./runFormatterCommand.js";
import { wrapSafe } from "./wrapSafe.js";
const prettierInternalCliModules = [
  "prettier/internal/legacy-cli.mjs",
  "prettier/internal/cli.mjs"
];
function requirePrettierInternalCli(cwd) {
  const require2 = createRequire(path.join(cwd, "index.js"));
  for (const moduleName of prettierInternalCliModules) {
    const prettierCli = wrapSafe(
      () => require2(moduleName)
    );
    if (prettierCli) {
      return prettierCli;
    }
  }
  return void 0;
}
const runPrettier = async ({ cwd, patterns }) => {
  const prettierCli = path.resolve(cwd) === process.cwd() ? requirePrettierInternalCli(cwd) : void 0;
  if (!prettierCli) {
    return await runPackageFormatterCommand(
      { args: ["--write"], command: "prettier" },
      { cwd, patterns }
    );
  }
  await prettierCli.run(["--log-level", "silent", "--write", ...patterns]);
  return {
    runner: "virtual"
  };
};
export {
  runPrettier
};
