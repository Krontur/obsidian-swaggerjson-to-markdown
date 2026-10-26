import { UserError } from "../shared/user-error.mjs";

export function resolveRef(value, context) {
  if (value?.$ref === undefined) return value;
  assertRef(value.$ref);
  const ref = normalizeRef(value.$ref);
  if (ref === "#") return context.spec;
  if (ref.startsWith("#") && !ref.startsWith("#/")) {
    context.warnings.add(`Named anchor $ref is not resolved: ${ref}`);
    return value;
  }
  if (!ref.startsWith("#/") && !ref.startsWith("./") && !ref.startsWith("../")) { context.warnings.add(`External or remote $ref is not resolved: ${ref}`); return value; }
  if (ref.startsWith("./") || ref.startsWith("../")) { context.warnings.add(`External file $ref is not resolved: ${ref}`); return value; }
  const parts = getPointerParts(ref);
  let current = context.spec;
  for (const part of parts) {
    current = current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined;
    if (current === undefined) { context.warnings.add(`Unresolved internal $ref: ${ref}`); return value; }
  }
  return current;
}
export function extractRefName(ref) {
  assertRef(ref);
  if (ref === "#" || ref === "") return "schema";
  if (ref.startsWith("#/")) return getPointerParts(ref).pop() ?? "schema";
  return decodeRef(ref.split("/").pop() ?? ref);
}

export function normalizeRef(ref) {
  if (ref === undefined) return "";
  assertRef(ref);
  if (ref === "") return "#";
  if (!ref.startsWith("#/")) return ref;
  return `#/${getPointerParts(ref).map((part) => encodeURIComponent(part.replace(/~/g, "~0").replace(/\//g, "~1"))).join("/")}`;
}

function assertRef(ref) {
  if (typeof ref !== "string") throw new UserError("Invalid $ref: expected a string.");
}

function decodeRef(ref) {
  try {
    return decodeURIComponent(ref);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    throw new UserError(`Invalid $ref URI encoding: ${ref}`);
  }
}

function getPointerParts(ref) {
  return decodeRef(ref.slice(1)).slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
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
