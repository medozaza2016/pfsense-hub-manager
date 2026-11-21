import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const root = process.cwd();
if (process.platform !== "win32") {
  console.log("Native optional-dependency repair is only needed by the Windows development installer.");
  process.exit(0);
}

function findPackageRoot(entry, expectedName) {
  let current = path.dirname(entry);
  while (true) {
    const manifest = path.join(current, "package.json");
    if (fs.existsSync(manifest)) {
      const data = JSON.parse(fs.readFileSync(manifest, "utf8"));
      if (data.name === expectedName) return { directory: current, data };
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Cannot locate package root for ${expectedName}.`);
    current = parent;
  }
}

function resolvePackage(name, fromDirectory) {
  const req = createRequire(path.join(fromDirectory, "package.json"));
  return findPackageRoot(req.resolve(name), name);
}

const rollup = resolvePackage("rollup", path.join(root, "node_modules"));
const vite = resolvePackage("vite", path.join(root, "node_modules"));
const viteEsbuild = resolvePackage("esbuild", vite.directory);
const tsx = resolvePackage("tsx", path.join(root, "node_modules"));
const apiEsbuild = resolvePackage("esbuild", tsx.directory);

const arch = process.arch;
const esbuildNativeName = `@esbuild/win32-${arch}`;
const rollupNativeName = arch === "x64"
  ? "@rollup/rollup-win32-x64-msvc"
  : arch === "arm64"
    ? "@rollup/rollup-win32-arm64-msvc"
    : arch === "ia32"
      ? "@rollup/rollup-win32-ia32-msvc"
      : null;

if (!rollupNativeName) {
  throw new Error(`Unsupported Windows architecture for Rollup native package: ${arch}`);
}

function installedVersion(name, fromDirectory) {
  const packageJson = path.join(path.dirname(fromDirectory), ...name.split("/"), "package.json");
  try {
    const data = JSON.parse(fs.readFileSync(packageJson, "utf8"));
    return data.name === name ? data.version : null;
  } catch {
    return null;
  }
}

const requirements = [
  { owner: "Rollup", name: rollupNativeName, version: rollup.data.optionalDependencies?.[rollupNativeName], from: rollup.directory, targetNodeModules: path.dirname(rollup.directory) },
  { owner: "Vite esbuild", name: esbuildNativeName, version: viteEsbuild.data.optionalDependencies?.[esbuildNativeName], from: viteEsbuild.directory, targetNodeModules: path.dirname(viteEsbuild.directory) },
  { owner: "API esbuild", name: esbuildNativeName, version: apiEsbuild.data.optionalDependencies?.[esbuildNativeName], from: apiEsbuild.directory, targetNodeModules: path.dirname(apiEsbuild.directory) }
];

const repairs = [];
for (const item of requirements) {
  if (!item.version) throw new Error(`${item.owner} does not declare the expected native package ${item.name}.`);
  const actual = installedVersion(item.name, item.from);
  if (actual !== item.version) {
    console.log(`${item.owner}: ${item.name} requires ${item.version}, found ${actual ?? "missing"}.`);
    repairs.push(item);
  }
}

for (const item of repairs) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pfsense-native-deps-"));
  try {
    const spec = `${item.name}@${item.version}`;
    console.log(`Installing ${spec} in an isolated temporary directory...`);
    const result = spawnSync("npm.cmd", [
      "install",
      "--prefix", tempDirectory,
      "--no-save",
      "--package-lock=false",
      "--workspaces=false",
      "--ignore-scripts",
      spec
    ], {
      cwd: tempDirectory,
      stdio: "inherit",
      shell: true
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`npm failed to install ${spec} in the temporary directory (exit code ${result.status}).`);

    const source = path.join(tempDirectory, "node_modules", ...item.name.split("/"));
    const destination = path.join(item.targetNodeModules, ...item.name.split("/"));
    if (!fs.existsSync(path.join(source, "package.json"))) {
      throw new Error(`npm completed but did not produce the expected package at ${source}.`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true, force: true });
    console.log(`Installed ${spec} at ${destination}.`);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

const failures = [];
for (const item of requirements) {
  const actual = installedVersion(item.name, item.from);
  if (actual !== item.version) failures.push(`${item.owner}: expected ${item.name}@${item.version}, found ${actual ?? "missing"}`);
}
if (failures.length) throw new Error(`Native dependency verification failed:\\n${failures.join("\\n")}`);
console.log("Windows native Rollup and esbuild dependencies are present at their required versions.");
