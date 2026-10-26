import { resolveRef } from "./ref-resolver.mjs";
import { extractRefName, normalizeRef } from "./ref-resolver.mjs";
import { assertSchema, getSchemaTypes } from "./schema-types.mjs";

export function normalizeComposedSchema(schema, context, state = {}) {
  assertSchema(schema);
  const resolved = resolveSchemaForNormalization(schema, context, state);
  if (!resolved) return resolved;
  assertSchema(resolved);
  if (resolved.allOf?.length) {
    const members = resolved.allOf.map((item) => normalizeComposedSchema(item, context, nextSchemaState(state)));
    if (members.some((member) => !member || typeof member !== "object" || member.$ref || member.allOf || getSchemaTypes(member).some((type) => type !== "object") || (!member.properties && member.type !== "object"))) {
      return resolved;
    }
    const merged = { ...resolved, allOf: undefined, properties: { ...resolved.properties }, required: [...(resolved.required ?? [])] };
    for (const n of members) {
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

export function formatSchemaType(schema, context, state = {}) {
  assertSchema(schema);
  if (schema === true) return "any";
  if (schema === false) return "never";
  if (schema?.$ref !== undefined) {
    const name = extractRefName(schema.$ref);
    return schema.nullable === true ? `${name} | null` : name;
  }
  if (isPastMaxDepth(state)) {
    context.warnings.add("Schema type rendering reached its depth limit; nested type details were not expanded.");
    return "object";
  }
  const resolved = normalizeComposedSchema(resolveRef(schema, context), context);
  if (!resolved) return "object";
  const types = getSchemaTypes(resolved);
  const formatChild = (child) => formatSchemaType(child, context, nextSchemaState(state));
  const alternatives = resolved.oneOf ?? resolved.anyOf;
  if (alternatives?.length) {
    const label = alternatives.map(formatChild).join(" | ");
    return resolved.nullable === true && !label.split(" | ").includes("null") ? `${label} | null` : label;
  }
  if (resolved.allOf?.length) return resolved.allOf.map(formatChild).join(" & ");
  const labels = (types.length ? types : ["object"]).map((type) => {
    if (type === "null") return "null";
    if (type === "array") return `array[${formatChild(resolved.items ?? {})}]`;
    if (type === "object" && resolved.additionalProperties && !resolved.properties) {
      const value = resolved.additionalProperties;
      return `map[string, ${value === true || Object.keys(value).length === 0 ? "any" : formatChild(value)}]`;
    }
    return resolved.format ? `${type}($${resolved.format})` : type;
  });
  return labels.join(" | ");
}

export function getSchemaDisplayType(schema, context) {
  const resolved = normalizeComposedSchema(schema, context);
  if (resolved === true) return "any";
  if (resolved === false) return "never";
  const types = getSchemaTypes(resolved);
  return types.length ? types.join(" | ") : "object";
}

function resolveSchemaForNormalization(schema, context, state) {
  if (schema?.$ref === undefined) {
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
