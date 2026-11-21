import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

if (process.platform !== "linux" || process.arch !== "x64") {
  console.log("Linux x64 Rollup native repair is not required on this platform.");
  process.exit(0);
}

const root = process.cwd();
const requireFromRoot = createRequire(path.join(root, "package.json"));
const rollupEntry = requireFromRoot.resolve("rollup");
let rollupDirectory = path.dirname(rollupEntry);
while (path.dirname(rollupDirectory) !== rollupDirectory) {
  const manifestPath = path.join(rollupDirectory, "package.json");
  if (fs.existsSync(manifestPath) && JSON.parse(fs.readFileSync(manifestPath, "utf8")).name === "rollup") break;
  rollupDirectory = path.dirname(rollupDirectory);
}
const rollup = JSON.parse(fs.readFileSync(path.join(rollupDirectory, "package.json"), "utf8"));
const packageName = "@rollup/rollup-linux-x64-gnu";
const version = rollup.optionalDependencies?.[packageName];
if (!version) throw new Error(`Installed Rollup does not declare ${packageName}.`);

const destination = path.join(root, "node_modules", ...packageName.split("/"));
const installedManifest = path.join(destination, "package.json");
if (fs.existsSync(installedManifest) && JSON.parse(fs.readFileSync(installedManifest, "utf8")).version === version) {
  console.log(`Verified ${packageName}@${version}.`);
  process.exit(0);
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "pfsense-rollup-native-"));
try {
  const result = spawnSync("npm", [
    "install", "--prefix", temporary, "--no-save", "--package-lock=false",
    "--workspaces=false", "--ignore-scripts", `${packageName}@${version}`
  ], { cwd: temporary, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Failed to install ${packageName}@${version} in an isolated directory.`);
  const source = path.join(temporary, "node_modules", ...packageName.split("/"));
  if (!fs.existsSync(path.join(source, "package.json"))) throw new Error("The isolated install did not produce the expected native package.");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
  const verified = JSON.parse(fs.readFileSync(installedManifest, "utf8"));
  if (verified.name !== packageName || verified.version !== version) throw new Error("Installed Rollup native package failed verification.");
  console.log(`Installed and verified ${packageName}@${version}.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
