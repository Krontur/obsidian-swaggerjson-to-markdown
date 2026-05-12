import { resolveRef } from "./ref-resolver.mjs";
import { extractRefName } from "./ref-resolver.mjs";

export function normalizeComposedSchema(schema, context) {
  const resolved = resolveRef(schema, context);
  if (!resolved) return resolved;
  if (resolved.allOf?.length) {
    const merged = { ...resolved, allOf: undefined, properties: {}, required: [] };
    for (const item of resolved.allOf) {
      const n = normalizeComposedSchema(item, context) ?? {};
      Object.assign(merged.properties, n.properties ?? {});
      merged.required.push(...(n.required ?? []));
      if (!merged.type && n.type) merged.type = n.type;
      if (!merged.description && n.description) merged.description = n.description;
    }
    merged.required = [...new Set(merged.required)];
    return merged;
  }
  return resolved;
}

export function formatSchemaType(schema, context) {
  if (schema?.$ref) return extractRefName(schema.$ref);
  const resolved = normalizeComposedSchema(resolveRef(schema, context), context);
  if (!resolved) return "object";
  if (resolved.type === "array") return `array[${formatSchemaType(resolved.items ?? {}, context)}]`;
  if (resolved.oneOf?.length) return resolved.oneOf.map((i) => formatSchemaType(i, context)).join(" | ");
  if (resolved.anyOf?.length) return resolved.anyOf.map((i) => formatSchemaType(i, context)).join(" | ");
  if (resolved.additionalProperties && !resolved.properties) return `map[string, ${formatSchemaType(resolved.additionalProperties === true ? { type: "string" } : resolved.additionalProperties, context)}]`;
  if (resolved.format) return `${resolved.type}($${resolved.format})`;
  return resolved.type ?? "object";
}

export function getSchemaDisplayType(schema, context) {
  const resolved = normalizeComposedSchema(schema, context);
  return resolved?.type ?? (resolved?.properties ? "object" : "object");
}
