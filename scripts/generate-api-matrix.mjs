#!/usr/bin/env node
/**
 * Generate the pfSense REST API operation inventory.
 * Run from repository root: node scripts/generate-api-matrix.mjs
 */
import { readFile, writeFile } from "node:fs/promises";

const source = "docs/reference/pfsense-openapi.json";
const output = "docs/API-MATRIX.generated.md";
const spec = JSON.parse(await readFile(source, "utf8"));
const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);

const clean = (value = "") => String(value)
  .replace(/<[^>]*>/g, " ")
  .replace(/\*\*/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .replaceAll("|", "\\|");

function detail(description, label) {
  const line = description.split(/<br\s*\/?\s*>/i)
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("**" + label.toLowerCase() + "**"));
  return line ? clean(line.replace(/^\*\*[^*]+\*\*\s*:\s*/, "")) : "Not specified";
}

function schemaRefs(operation, key) {
  const found = [];
  if (key === "request") {
    for (const media of Object.values(operation.requestBody?.content ?? {})) {
      const schema = media?.schema;
      if (schema?.$ref) found.push(schema.$ref);
      for (const item of schema?.allOf ?? []) if (item.$ref) found.push(item.$ref);
    }
  } else {
    for (const response of Object.values(operation.responses ?? {})) {
      for (const media of Object.values(response?.content ?? {})) {
        const schema = media?.schema;
        if (schema?.$ref) found.push(schema.$ref);
        for (const item of schema?.allOf ?? []) if (item.$ref) found.push(item.$ref);
      }
    }
  }
  return [...new Set(found)].join(", ") || (key === "request" ? "None declared" : "See responses");
}

const rows = [];
for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method.toLowerCase()) || !operation || typeof operation !== "object") continue;
    const description = operation.description ?? "";
    const security = operation.security ?? spec.security ?? [];
    const schemes = [...new Set(security.flatMap((requirement) => Object.keys(requirement)))].join(", ") || "Not specified";
    rows.push({
      tag: (operation.tags ?? pathItem.tags ?? ["Uncategorized"]).join(", "),
      method: method.toUpperCase(),
      path,
      operationId: operation.operationId ?? "",
      summary: clean(operation.summary ?? description.split(/<br\s*\/?\s*>/i)[0] ?? ""),
      schemes,
      privileges: detail(description, "Allowed privileges"),
      packages: detail(description, "Required packages"),
      request: schemaRefs(operation, "request"),
      response: schemaRefs(operation, "response"),
      applies: detail(description, "Applies immediately"),
      cache: detail(description, "Utilizes cache"),
    });
  }
}
rows.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const lines = [
  "# Generated pfSense REST API Operation Inventory",
  "",
  "> Generated file. Do not edit manually. Source: `docs/reference/pfsense-openapi.json`.",
  "",
  `- OpenAPI version: ${clean(spec.openapi)}`,
  `- Specification title: ${clean(spec.info?.title)}`,
  `- Specification metadata version: ${clean(spec.info?.version || "unknown")}`,
  `- Paths: ${Object.keys(spec.paths ?? {}).length}`,
  `- Operations: ${rows.length}`,
  `- Component schemas: ${Object.keys(spec.components?.schemas ?? {}).length}`,
  "",
  "| Tag | Method | Path | Operation ID | Summary | Authentication | Privileges | Required packages | Request schemas | Response schemas | Applies immediately | Cache |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
];
for (const row of rows) {
  lines.push("| " + [
    row.tag, row.method, "`" + clean(row.path) + "`", clean(row.operationId),
    row.summary, row.schemes, row.privileges, row.packages, row.request,
    row.response, row.applies, row.cache,
  ].join(" | ") + " |");
}
lines.push("", "Application implementation, frontend exposure, real-device verification, and automated tests are tracked separately in `docs/API-COMPATIBILITY.md`. Specification presence does not imply device support or approval to invoke a write operation.", "");
await writeFile(output, lines.join("\n"), "utf8");
console.log(`Wrote ${rows.length} operations to ${output}`);
