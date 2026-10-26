import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { WarningCollector } from "../../src/converter/shared/warnings.mjs";

export const OPTIONS = {
  mode: "full", tag: null, operationId: null, method: null, path: null,
  useHeadings: true, headingOffset: 0
};

export function createContext(spec = {}) {
  return { spec, options: OPTIONS, warnings: new WarningCollector() };
}

export function documentForSchema(schema, version = "3.1.0") {
  return {
    openapi: version,
    info: { title: "Schema regression", version: "1.0.0" },
    paths: {
      "/values": {
        post: {
          tags: ["values"], operationId: "createValue",
          requestBody: { content: { "application/json": { schema } } },
          responses: { "200": { description: "OK", content: { "application/json": { schema } } } }
        }
      }
    },
    components: { schemas: { Value: schema, Base: { type: "object", properties: { id: { type: "integer" } } } } }
  };
}

// Exercise the public TypeScript API using the project's bundler, without disk output.
export async function loadConverterApi() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../../src/converter-api.ts", import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external"
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}
