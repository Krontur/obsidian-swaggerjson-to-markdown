import { resolveRef } from "./ref-resolver.mjs";
import { normalizeComposedSchema, getSchemaDisplayType } from "./schema-normalizer.mjs";

export function getMediaTypeExample(mediaType, context) {
  if (!mediaType) return undefined;
  if (mediaType.example !== undefined) return mediaType.example;
  if (mediaType.examples) {
    const firstExample = Object.values(mediaType.examples)[0];
    const resolvedExample = resolveRef(firstExample, context);
    if (resolvedExample?.value !== undefined) return resolvedExample.value;
  }
  if (mediaType.schema) return buildExample(mediaType.schema, context);
  return undefined;
}

export function buildExample(schema, context) {
  const resolved = normalizeComposedSchema(resolveRef(schema, context), context);
  if (!resolved) return undefined;
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum?.length) return resolved.enum[0];
  if (resolved.oneOf?.length) return buildExample(resolved.oneOf[0], context);
  if (resolved.anyOf?.length) return buildExample(resolved.anyOf[0], context);
  const type = getSchemaDisplayType(resolved, context);
  if (resolved.type === "array") return [buildExample(resolved.items ?? {}, context)];
  if (resolved.type === "object" || resolved.properties || resolved.additionalProperties) {
    const result = {};
    for (const [k, v] of Object.entries(resolved.properties ?? {})) result[k] = buildExample(v, context);
    if (!Object.keys(result).length && resolved.additionalProperties) result.additionalProperty = buildExample(resolved.additionalProperties === true ? { type: "string" } : resolved.additionalProperties, context);
    return result;
  }
  if (type.startsWith("integer") || type.startsWith("number")) return 0;
  if (resolved.type === "boolean") return true;
  if (resolved.type === "string") {
    if (resolved.format === "date-time") return "2026-01-01T00:00:00Z";
    if (resolved.format === "date") return "2026-01-01";
    if (resolved.format === "binary") return "file";
    return "string";
  }
  return {};
}

export function formatExample(example, contentType) {
  if (contentType?.includes("xml")) return typeof example === "string" ? example : "<!-- XML example not generated -->";
  return JSON.stringify(example, null, 2);
}
