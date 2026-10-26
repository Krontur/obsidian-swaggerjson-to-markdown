import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectOperations } from "../src/converter/core/operation-collector.mjs";
import { resolveRef } from "../src/converter/core/ref-resolver.mjs";
import { getSchemaTypes } from "../src/converter/core/schema-types.mjs";
import { escapeHtml } from "../src/converter/renderer/html-renderer.mjs";
import { createContext, documentForSchema, loadConverterApi, OPTIONS } from "./helpers/conversion.mjs";

const api = await loadConverterApi();
const convert = (spec, options = {}) => api.convertOpenApiToMarkdown(spec, { ...OPTIONS, ...options });
const fixture = JSON.parse(await readFile(new URL("./fixtures/springdoc-nullable.json", import.meta.url), "utf8"));

test("public JSON parser reports invalid JSON clearly", () => {
  assert.throws(() => api.parseOpenApiJson("{broken"), /Invalid JSON:/);
});

test("Swagger 2.0 file response schemas remain supported", () => {
  const spec = { swagger: "2.0", info: { title: "Download", version: "1.0" }, paths: { "/download": { get: { produces: ["application/octet-stream"], responses: { "200": { description: "File", schema: { type: "file" } } } } } } };
  assert.match(convert(spec).markdown, /<code>file<\/code>/);
});

test("Swagger 2.0 parameter types use the same safe formatter", () => {
  const spec = { swagger: "2.0", info: { title: "Parameters", version: "1.0" }, paths: { "/values": { get: { parameters: [{ name: "ids", in: "query", type: "array", items: { type: "integer" } }], responses: { "200": { description: "OK" } } } } } };
  assert.match(convert(spec).markdown, /array\[integer\]/);
  spec.paths["/values"].get.parameters[0].type = {};
  assert.throws(() => convert(spec), (error) => error.name === "UserError");
});

function assertOperationContent(spec, operation, markdown) {
  assert.ok(markdown.includes(`<span class="api-method">${operation.method}</span>`));
  assert.ok(markdown.includes(`<code class="api-path">${escapeHtml(operation.path)}</code>`));
  for (const status of Object.keys(operation.operation.responses ?? {})) {
    assert.ok(markdown.includes(`Response ${status}`), `${operation.method} ${operation.path}: response ${status}`);
  }
  const context = createContext(spec);
  for (const parameter of [...operation.pathParameters, ...(operation.operation.parameters ?? [])]) {
    const resolved = resolveRef(parameter, context);
    assert.match(markdown, /Parameters/);
    assert.ok(markdown.includes(`<code>${escapeHtml(resolved.name ?? "body")}</code>`), `Missing parameter: ${resolved.name}`);
    if (resolved.in) assert.ok(markdown.includes(`<code>(${escapeHtml(resolved.in)})</code>`));
  }
  const request = resolveRef(operation.operation.requestBody, context);
  const schemas = [];
  if (request?.content) {
    assert.match(markdown, /Request Body/);
    schemas.push(...Object.values(request.content).map((media) => media.schema));
  }
  for (const response of Object.values(operation.operation.responses ?? {})) {
    const resolved = resolveRef(response, context);
    for (const media of Object.values(resolved?.content ?? {})) {
      if (media.schema !== undefined) { assert.match(markdown, /Model/); schemas.push(media.schema); }
    }
  }
  for (const schema of schemas) {
    let resolved = resolveRef(schema, context);
    if (getSchemaTypes(resolved).includes("array")) resolved = resolveRef(resolved.items, context);
    for (const name of Object.keys(resolved?.properties ?? {})) {
      assert.ok(markdown.includes(`<code>${escapeHtml(name)}</code>`), `Missing request/response property: ${name}`);
    }
  }
}

test("SpringDoc 3.1 regression fixture converts all endpoints, bodies, and nullable properties", () => {
  const original = JSON.stringify(fixture);
  const { markdown, warnings } = convert(fixture);
  assert.equal([...markdown.matchAll(/class="api-operation api-/g)].length, 3);
  assert.equal([...markdown.matchAll(/class="api-schema-card"/g)].length, 2);
  assert.match(markdown, /## items/);
  assert.match(markdown, /## health/);
  assert.match(markdown, /string \| null/);
  assert.match(markdown, /integer \| null/);
  assert.match(markdown, /array\[Item\] \| null/);
  assert.match(markdown, /map\[string, any\] \| null/);
  assert.match(markdown, /string\(\$uri\) \| null/);
  assert.match(markdown, /"count": 0/);
  assert.match(markdown, /"title": "string"/);
  assert.ok(warnings.some((message) => message.includes("JSON definition is preserved")));
  for (const operation of collectOperations(fixture)) {
    const fragment = convert(fixture, { mode: "fragment", method: operation.method, path: operation.path }).markdown;
    assertOperationContent(fixture, operation, fragment);
  }
  assert.equal(JSON.stringify(fixture), original);
});

for (const [name, schema, expected] of [
  ["simple string", { type: "string" }, "<code>string</code>"],
  ["nullable 3.0", { type: "string", nullable: true }, "string | null"],
  ["nullable string 3.1", { type: ["string", "null"] }, "string | null"],
  ["nullable object 3.1", { type: ["object", "null"], properties: { name: { type: "string" } } }, "object | null"],
  ["nullable referenced array", { type: ["array", "null"], items: { $ref: "#/components/schemas/Base" } }, "array[Base] | null"],
  ["missing type", { properties: { name: { type: "string" } } }, "<code>name</code>"],
  ["empty schema", {}, "<code>object</code>"],
  ["reference only", { $ref: "#/components/schemas/Base" }, "<code>id</code>"],
  ["referenced array", { type: "array", items: { $ref: "#/components/schemas/Base" } }, "<code>id</code>"],
  ["anyOf", { anyOf: [{ type: "string" }, { type: "null" }] }, "string | null"],
  ["oneOf", { oneOf: [{ type: "integer" }, { type: "string" }] }, "integer | string"],
  ["allOf", { allOf: [{ $ref: "#/components/schemas/Base" }, { type: "object", properties: { other: { type: "string" } } }] }, "<code>other</code>"],
  ["boolean true", true, "<code>any</code>"],
  ["boolean false", false, "<code>never</code>"]
]) {
  test(`full conversion documents ${name}`, () => {
    const { markdown } = convert(documentForSchema(schema, name === "nullable 3.0" ? "3.0.3" : "3.1.0"));
    assert.ok(markdown.includes(expected), expected);
    assert.match(markdown, /Request Body/);
    assert.match(markdown, /Response 200/);
    assert.match(markdown, /Model/);
  });
}

test("nested objects, composition branches, enums and constraints retain original information", () => {
  const schema = {
    oneOf: [
      { type: "object", description: "First branch", properties: { inner: { type: "object", properties: { status: { type: "string", enum: ["new", "done"], description: "Lifecycle" } } } } },
      { type: "object", description: "Second branch", additionalProperties: { type: "integer", minimum: 0 } }
    ]
  };
  const { markdown, warnings } = convert(documentForSchema(schema));
  assert.match(markdown, /Schema definition \(additional constraints\)/);
  assert.ok(markdown.includes(JSON.stringify(schema, null, 2)));
  assert.match(markdown, /"done"/);
  assert.match(markdown, /Lifecycle/);
  assert.match(markdown, /Second branch/);
  assert.ok(warnings.some((message) => message.includes("not fully represented")));
});

test("unsupported valid 3.1 constraints are preserved with explicit warnings", () => {
  const schema = { type: "array", prefixItems: [{ const: "start" }], items: false };
  const { markdown, warnings } = convert(documentForSchema(schema));
  assert.ok(markdown.includes(JSON.stringify(schema, null, 2)));
  assert.ok(warnings.some((message) => message.includes("example was not generated")));
});

test("fragments retain constraints reached through reference chains", () => {
  const spec = documentForSchema({ $ref: "#/components/schemas/Alias" });
  spec.components.schemas.Alias = { $ref: "#/components/schemas/Constrained" };
  const schema = { type: "object", properties: { status: { type: "string", enum: ["new", "done"] } } };
  spec.components.schemas.Constrained = schema;
  const { markdown } = convert(spec, { mode: "fragment" });
  assert.ok(markdown.includes(JSON.stringify(schema, null, 2)));
  assert.match(markdown, /"done"/);
});

test("global allOf schemas retain the original unflattened definition", () => {
  const schema = { allOf: [{ $ref: "#/components/schemas/Base" }, { type: "object", properties: { extra: { type: "string" } } }] };
  const { markdown } = convert(documentForSchema(schema));
  const globalSchemas = markdown.slice(markdown.indexOf("## Schemas"));
  assert.ok(globalSchemas.includes(JSON.stringify(schema, null, 2)));
  assert.match(globalSchemas, /<code>id<\/code>/);
  assert.match(globalSchemas, /<code>extra<\/code>/);
});

test("nullable recursive arrays remain finite, linked, and nullable", () => {
  const schema = { type: "object", properties: { children: { type: ["array", "null"], items: { $ref: "#/components/schemas/Value" } } } };
  const { markdown } = convert(documentForSchema(schema));
  assert.match(markdown, /array\[Value\] \| null/);
  assert.match(markdown, /href="#value"/);
  assert.match(markdown, /Recursive reference/);
  assert.match(markdown, /"\$ref": "Value"/);
});

test("malformed schema declarations fail contextually, not with raw JavaScript errors", () => {
  for (const schema of [null, [], 42, { type: {} }, { type: [] }, { $ref: [] }, { anyOf: "string" }, { properties: { bad: null } }, { items: [] }, { additionalProperties: null }]) {
    assert.throws(() => convert(documentForSchema(schema)), (error) => {
      assert.equal(error.name, "UserError");
      assert.match(error.message, /Invalid .*#\//);
      return true;
    });
  }
});

test("arbitrary example payloads are not mistaken for schema declarations", () => {
  const spec = documentForSchema({ type: "object" });
  const example = { type: {}, schema: null, properties: [], $ref: { arbitrary: true } };
  spec.paths["/values"].post.requestBody.content["application/json"].example = example;
  const { markdown } = convert(spec);
  assert.ok(markdown.includes(JSON.stringify(example, null, 2)));
});

test("malformed metadata containers report controlled errors", () => {
  const mutations = [
    (spec) => { spec.tags = {}; },
    (spec) => { spec.servers = [null]; },
    (spec) => { spec.paths["/values"].post.parameters = {}; },
    (spec) => { spec.paths["/values"].post.tags = [42]; },
    (spec) => { spec.paths["/values"].post.responses["200"] = null; },
    (spec) => { spec.paths["/values"].post.requestBody.content["application/json"] = null; }
  ];
  for (const mutate of mutations) {
    const spec = documentForSchema({ type: "string" });
    mutate(spec);
    assert.throws(() => convert(spec), (error) => error.name === "UserError" && /Invalid .*#\//.test(error.message));
  }
});

test("unimplemented authentication rendering is reported instead of implied supported", () => {
  const spec = documentForSchema({ type: "string" });
  spec.security = [{ bearerAuth: [] }];
  spec.components.securitySchemes = { bearerAuth: { type: "http", scheme: "bearer" } };
  const { warnings } = convert(spec);
  assert.ok(warnings.some((message) => message.includes("Authentication requirements")));
});

test("the original local SpringDoc file converts with every endpoint and response model", { skip: !process.env.OPENAPI_REGRESSION_FILE }, async () => {
  // Opt-in local fixture: do not commit private API metadata to the repository.
  const source = await readFile(process.env.OPENAPI_REGRESSION_FILE, "utf8");
  const spec = api.parseOpenApiJson(source);
  const before = JSON.stringify(spec);
  const operations = collectOperations(spec);
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(operations.length, 36);
  assert.equal(Object.keys(spec.components.schemas).length, 47);
  const { markdown } = convert(spec);
  assert.equal([...markdown.matchAll(/class="api-operation api-/g)].length, 36);
  assert.equal([...markdown.matchAll(/class="api-schema-card"/g)].length, 47);
  for (const operation of operations) {
    const fragment = convert(spec, { mode: "fragment", method: operation.method, path: operation.path }).markdown;
    assertOperationContent(spec, operation, fragment);
  }
  assert.match(markdown, /string \| null/);
  assert.match(markdown, /map\[string, any\] \| null/);
  assert.equal(JSON.stringify(spec), before);
});
