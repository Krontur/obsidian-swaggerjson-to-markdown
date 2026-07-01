export function resolveRef(value, context) {
  if (!value?.$ref) return value;
  const ref = normalizeRef(value.$ref);
  if (!ref.startsWith("#/") && !ref.startsWith("./") && !ref.startsWith("../")) { context.warnings.add(`External or remote $ref is not resolved: ${ref}`); return value; }
  if (ref.startsWith("./") || ref.startsWith("../")) { context.warnings.add(`External file $ref is not resolved: ${ref}`); return value; }
  const parts = ref.replace(/^#\//, "").split("/").map(decodeURIComponent);
  let current = context.spec;
  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) { context.warnings.add(`Unresolved internal $ref: ${ref}`); return value; }
  }
  return current;
}
export function extractRefName(ref) { return decodeURIComponent(ref.split("/").pop() ?? ref); }

export function normalizeRef(ref) {
  if (!ref) return "";
  const text = String(ref);

  if (!text.startsWith("#/")) {
    return text;
  }

  return `#/${text.replace(/^#\//, "").split("/").map(decodeURIComponent).join("/")}`;
}

export function getRefAnchor(ref) {
  const name = extractRefName(normalizeRef(ref));
  const anchor = name
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  return `#${anchor || "schema"}`;
}
