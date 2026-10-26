import assert from "node:assert/strict";
import test from "node:test";
import { assertSchema, getExampleType, getSchemaTypes } from "../src/converter/core/schema-types.mjs";
import { formatSchemaType, getSchemaDisplayType, normalizeComposedSchema } from "../src/converter/core/schema-normalizer.mjs";
import { buildExample } from "../src/converter/core/example-generator.mjs";
import { extractRefName, normalizeRef, resolveRef } from "../src/converter/core/ref-resolver.mjs";
import { UserError } from "../src/converter/shared/user-error.mjs";
import { createContext } from "./helpers/conversion.mjs";

for (const [schema, label, example] of [
  [{ type: "string" }, "string", "string"],
  [{ type: "string", nullable: true }, "string | null", "string"],
  [{ type: ["string", "null"] }, "string | null", "string"],
  [{ type: ["integer", "null"] }, "integer | null", 0],
  [{ type: ["number", "null"] }, "number | null", 0],
  [{ type: ["boolean", "null"] }, "boolean | null", true],
  [{ type: ["string", "integer"] }, "string | integer", "string"],
  [{ type: ["null", "string"], format: "uri" }, "null | string($uri)", "string"],
  [{ type: ["object", "null"], properties: { value: { type: "string" } } }, "object | null", { value: "string" }],
  [{ type: ["array", "null"], items: { type: "integer" } }, "array[integer] | null", [0]],
  [{ type: "array", nullable: true, items: { type: "string" } }, "array[string] | null", ["string"]],
  [{ type: "object", nullable: true, properties: { value: { type: "integer" } } }, "object | null", { value: 0 }],
  [{ type: ["array", "object"], items: { type: "string" }, properties: { value: { type: "integer" } } }, "array[string] | object", ["string"]],
  [{ type: "null" }, "null", null],
  [{}, "object", {}],
  [{ properties: { id: { type: "integer" } } }, "object", { id: 0 }],
  [true, "any", {}],
  [false, "never", undefined]
]) {
  test(`type formatting and examples: ${JSON.stringify(schema)}`, () => {
    const context = createContext();
    assert.equal(formatSchemaType(schema, context), label);
    assert.equal(typeof getSchemaDisplayType(schema, context), "string");
    assert.deepEqual(buildExample(schema, context), example);
  });
}

test("union interpretation does not mutate schemas or duplicate null", () => {
  const schema = Object.freeze({ type: Object.freeze(["string", "null"]), nullable: true });
  assert.deepEqual(getSchemaTypes(schema), ["string", "null"]);
  assert.equal(getExampleType(schema), "string");
});

test("arrays with forbidden items generate an empty array, not a null item", () => {
  assert.deepEqual(buildExample({ type: "array", items: false }, createContext()), []);
});

test("explicit null examples/defaults and structured enum values are preserved", () => {
  const context = createContext();
  assert.equal(buildExample({ type: ["string", "null"], example: null }, context), null);
  assert.equal(buildExample({ type: ["integer", "null"], default: null }, context), null);
  assert.deepEqual(buildExample({ enum: [{ key: "value" }, null] }, context), { key: "value" });
  assert.equal(buildExample({ const: 42 }, context), 42);
  assert.equal(buildExample({ examples: ["declared", "other"] }, context), "declared");
});

for (const schema of [null, 12, "string", [], { type: [] }, { type: ["string", 1] }, { type: ["string", "string"] }, { type: "unknown" }, { type: {} }, { format: {} }, { $ref: [] }, { $ref: 42 }, { required: true }, { properties: [] }, { items: null }, { additionalProperties: [] }, { anyOf: "string" }, { oneOf: [] }, { allOf: {} }]) {
  test(`malformed schema gets a controlled error: ${JSON.stringify(schema)}`, () => {
    assert.throws(() => assertSchema(schema), UserError);
    assert.throws(() => buildExample(schema, createContext()), UserError);
  });
}

test("allOf preserves parent properties and required fields", () => {
  const schema = { type: "object", properties: { own: { type: "string" } }, required: ["own"], allOf: [{ type: "object", required: ["id"], properties: { id: { type: "integer" } } }] };
  const before = JSON.stringify(schema);
  const context = createContext();
  const normalized = normalizeComposedSchema(schema, context);
  assert.deepEqual(normalized.required, ["own", "id"]);
  assert.deepEqual(buildExample(schema, context), { own: "string", id: 0 });
  assert.equal(JSON.stringify(schema), before);
});

test("non-object allOf intersections are not flattened into misleading examples", () => {
  const schema = { allOf: [{ type: "string" }, { type: "integer" }] };
  const context = createContext();
  assert.equal(formatSchemaType(schema, context), "string & integer");
  assert.equal(buildExample(schema, context), undefined);
  assert.ok(context.warnings.items.some((message) => message.includes("allOf intersection")));
});

test("references decode JSON Pointer escapes and URI encoding exactly once", () => {
  const schemas = { "A/B": { type: "string" }, "A~B": { type: "integer" }, "A B": { type: "boolean" }, "100%": { type: "number" }, "%20": { type: "null" } };
  const context = createContext({ components: { schemas } });
  for (const [token, name] of [["A~1B", "A/B"], ["A~0B", "A~B"], ["A%20B", "A B"], ["100%25", "100%"], ["%2520", "%20"]]) {
    const ref = `#/components/schemas/${token}`;
    assert.equal(resolveRef({ $ref: ref }, context), schemas[name]);
    assert.equal(extractRefName(ref), name);
    assert.equal(normalizeRef(normalizeRef(ref)), normalizeRef(ref));
    assert.equal(resolveRef({ $ref: normalizeRef(ref) }, context), schemas[name]);
  }
  assert.equal(context.warnings.items.length, 0);
});

test("non-string references and invalid URI encodings have controlled errors", () => {
  for (const ref of [null, [], {}, 1, "#/schemas/%ZZ"]) {
    assert.throws(() => resolveRef({ $ref: ref }, createContext()), UserError);
  }
});

test("root and empty URI references resolve to the document root", () => {
  const context = createContext({ type: "string" });
  for (const ref of ["#", ""]) {
    assert.equal(resolveRef({ $ref: ref }, context), context.spec);
    assert.equal(extractRefName(ref), "schema");
    assert.equal(buildExample({ $ref: ref }, context), "string");
  }
});

test("unresolved, external, and named-anchor refs retain their identity with warnings", () => {
  const context = createContext({});
  for (const ref of ["#/missing", "./other.json#/Value", "https://example.com/schema", "#named"]) {
    const schema = { $ref: ref };
    assert.equal(resolveRef(schema, context), schema);
    assert.equal(buildExample(schema, context) instanceof Object, true);
  }
  assert.equal(context.warnings.items.length, 4);
});
