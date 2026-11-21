import fs from "node:fs";
import path from "node:path";
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
const apiEsbuild = resolvePackage("esbuild", path.join(root, "node_modules"));

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
  try {
    const req = createRequire(path.join(fromDirectory, "package.json"));
    const entry = req.resolve(name);
    return findPackageRoot(entry, name).data.version;
  } catch {
    return null;
  }
}

const requirements = [
  { owner: "Rollup", name: rollupNativeName, version: rollup.data.optionalDependencies?.[rollupNativeName], from: rollup.directory },
  { owner: "Vite esbuild", name: esbuildNativeName, version: viteEsbuild.data.optionalDependencies?.[esbuildNativeName], from: viteEsbuild.directory },
  { owner: "API esbuild", name: esbuildNativeName, version: apiEsbuild.data.optionalDependencies?.[esbuildNativeName], from: apiEsbuild.directory }
];

const repairs = new Map();
for (const item of requirements) {
  if (!item.version) throw new Error(`${item.owner} does not declare the expected native package ${item.name}.`);
  const actual = installedVersion(item.name, item.from);
  if (actual !== item.version) {
    console.log(`${item.owner}: ${item.name} requires ${item.version}, found ${actual ?? "missing"}.`);
    const previous = repairs.get(item.name);
    if (previous && previous !== item.version) {
      throw new Error(`Conflicting native package versions requested for ${item.name}: ${previous} and ${item.version}.`);
    }
    repairs.set(item.name, item.version);
  }
}

if (repairs.size > 0) {
  const specs = [...repairs].map(([name, version]) => `${name}@${version}`);
  console.log("Repairing Windows native optional dependencies in one npm operation...");
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["install", "--no-save", "--package-lock=false", ...specs], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm native dependency repair failed with exit code ${result.status}.`);
}

const failures = [];
for (const item of requirements) {
  const actual = installedVersion(item.name, item.from);
  if (actual !== item.version) failures.push(`${item.owner}: expected ${item.name}@${item.version}, found ${actual ?? "missing"}`);
}
if (failures.length) throw new Error(`Native dependency verification failed:\\n${failures.join("\\n")}`);
console.log("Windows native Rollup and esbuild dependencies are present at their required versions.");
