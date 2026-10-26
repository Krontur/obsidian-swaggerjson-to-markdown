import { UserError } from "../shared/user-error.mjs";

// Swagger 2.0 additionally permits file schemas in responses.
const SCHEMA_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null", "file"]);

export function assertSchema(schema, path = "schema") {
  if (schema === undefined || typeof schema === "boolean") return;
  if (!isRecord(schema)) throw new UserError(`Invalid schema at ${path}: expected an object or boolean.`);
  getSchemaTypes(schema, path);
  for (const keyword of ["format", "description", "$ref"]) {
    if (schema[keyword] !== undefined && typeof schema[keyword] !== "string") {
      throw new UserError(`Invalid ${keyword} at ${path}: expected a string.`);
    }
  }
  if (schema.nullable !== undefined && typeof schema.nullable !== "boolean") {
    throw new UserError(`Invalid nullable at ${path}: expected a boolean.`);
  }
  if (schema.properties !== undefined && !isRecord(schema.properties)) {
    throw new UserError(`Invalid properties at ${path}: expected an object.`);
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every((name) => typeof name === "string"))) {
    throw new UserError(`Invalid required at ${path}: expected an array of strings.`);
  }
  for (const keyword of ["allOf", "anyOf", "oneOf", "enum"]) {
    if (schema[keyword] !== undefined && (!Array.isArray(schema[keyword]) || !schema[keyword].length)) {
      throw new UserError(`Invalid ${keyword} at ${path}: expected a non-empty array.`);
    }
  }
  for (const keyword of ["items", "additionalProperties"]) {
    const child = schema[keyword];
    if (child !== undefined && typeof child !== "boolean" && !isRecord(child)) {
      throw new UserError(`Invalid ${keyword} at ${path}: expected a schema object or boolean.`);
    }
  }
}

// A type list is semantic data, never a display label or an example value.
export function getSchemaTypes(schema, path = "schema") {
  const declaration = schema?.type;
  if (declaration === undefined) return [];
  const types = Array.isArray(declaration) ? declaration : [declaration];
  if (!types.length || types.some((type) => typeof type !== "string" || !SCHEMA_TYPES.has(type)) || new Set(types).size !== types.length) {
    throw new UserError(`Invalid type at ${path}: expected a supported schema type or a non-empty array of unique schema types.`);
  }
  return schema.nullable === true && !types.includes("null") ? [...types, "null"] : [...types];
}

export function getExampleType(schema) {
  const types = getSchemaTypes(schema);
  return types.find((type) => type !== "null") ?? types[0] ?? (schema?.items ? "array" : "object");
}

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// These features cannot be fully expressed by the existing four-column table.
// Keep their original definition rather than pretending they were flattened.
export function needsSchemaDefinition(schema) {
  if (!isRecord(schema)) return false;
  const tableKeywords = new Set(["type", "format", "nullable", "description", "properties", "required", "items", "$ref", "example", "default"]);
  return Object.keys(schema).some((key) => !tableKeywords.has(key))
    || (schema.items !== undefined && schema.type === undefined)
    || (Array.isArray(schema.type) && schema.type.filter((type) => type !== "null").length > 1)
    || Object.values(schema.properties ?? {}).some((property) => isRecord(property) && (property.properties || needsSchemaDefinition(property)))
    || (isRecord(schema.items) && needsSchemaDefinition(schema.items))
    || (schema.$ref !== undefined && Object.keys(schema).some((key) => key !== "$ref"));
}
