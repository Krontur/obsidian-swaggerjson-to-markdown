import { assertSchema, getSchemaTypes, isRecord, needsSchemaDefinition } from "./schema-types.mjs";
import { UserError } from "../shared/user-error.mjs";

// Inspect schema locations, not example/default payloads or property-name maps.
export function validateDocumentSchemas(document, warnings) {
  function visitSchema(schema, path) {
    if (schema === undefined) throw new UserError(`Invalid schema at ${path}: schema is missing.`);
    assertSchema(schema, path);
    if (typeof schema === "boolean") return;
    if (getSchemaTypes(schema).includes("file") && (document.swagger !== "2.0" || Array.isArray(schema.type))) throw new UserError(`Invalid type at ${path}: file schemas are only supported in Swagger 2.0.`);
    if (needsSchemaDefinition(schema)) {
      warnings.add(`Schema at ${path} contains information not fully represented by tables; its JSON definition is preserved in the documentation.`);
    }
    for (const [name, child] of Object.entries(schema.properties ?? {})) visitSchema(child, `${path}/properties/${name}`);
    for (const keyword of ["items", "additionalProperties", "not", "contains", "propertyNames", "if", "then", "else"]) {
      if (schema[keyword] !== undefined) visitSchema(schema[keyword], `${path}/${keyword}`);
    }
    for (const keyword of ["allOf", "oneOf", "anyOf", "prefixItems"]) {
      if (schema[keyword] === undefined) continue;
      if (!Array.isArray(schema[keyword])) throw new UserError(`Invalid ${keyword} at ${path}: expected an array.`);
      schema[keyword].forEach((child, index) => visitSchema(child, `${path}/${keyword}/${index}`));
    }
    for (const keyword of ["$defs", "patternProperties", "dependentSchemas"]) {
      if (schema[keyword] === undefined) continue;
      if (!isRecord(schema[keyword])) throw new UserError(`Invalid ${keyword} at ${path}: expected an object.`);
      for (const [name, child] of Object.entries(schema[keyword])) visitSchema(child, `${path}/${keyword}/${name}`);
    }
  }

  function visit(value, path) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["example", "examples", "default", "enum", "const"].includes(key) || key.startsWith("x-")) continue;
      if (key === "schema") visitSchema(child, `${path}/${key}`);
      else if ((path === "#/components" && key === "schemas") || (path === "#" && key === "definitions")) {
        if (!isRecord(child)) throw new UserError(`Invalid schema collection at ${path}/${key}: expected an object.`);
        for (const [name, schema] of Object.entries(child)) visitSchema(schema, `${path}/${key}/${name}`);
      } else visit(child, `${path}/${key}`);
    }
  }
  visit(document, "#");
}
