export function resolveRef(value, context) {
  if (!value?.$ref) return value;
  const ref = value.$ref;
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
