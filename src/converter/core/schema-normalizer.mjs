import { resolveRef } from "./ref-resolver.mjs";
import { extractRefName, normalizeRef } from "./ref-resolver.mjs";

export function normalizeComposedSchema(schema, context, state = {}) {
  const resolved = resolveSchemaForNormalization(schema, context, state);
  if (!resolved) return resolved;
  if (resolved.allOf?.length) {
    const merged = { ...resolved, allOf: undefined, properties: {}, required: [] };
    for (const item of resolved.allOf) {
      const n = normalizeComposedSchema(item, context, nextSchemaState(state)) ?? {};
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

function resolveSchemaForNormalization(schema, context, state) {
  if (!schema?.$ref) {
    return schema;
  }

  const ref = normalizeRef(schema.$ref);
  const refStack = state.refStack ?? [];

  if (refStack.includes(ref) || isPastMaxDepth(state)) {
    return schema;
  }

  const resolved = resolveRef(schema, context);

  if (resolved === schema) {
    return resolved;
  }

  return normalizeComposedSchema(resolved, context, {
    ...nextSchemaState(state),
    refStack: [...refStack, ref]
  });
}

function nextSchemaState(state) {
  return {
    ...state,
    depth: (state.depth ?? 0) + 1
  };
}

function isPastMaxDepth(state) {
  return (state.depth ?? 0) > 50;
}
