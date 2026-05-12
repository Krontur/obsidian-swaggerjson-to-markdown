import { UserError } from "../shared/user-error.mjs";

export function filterOperations(operations, options) {
  const filtered = operations.filter((item) => operationMatchesFilters(item, options));
  if (!filtered.length) throw new UserError("No operations matched the provided filters.", describeFilters(options));
  return filtered;
}

function operationMatchesFilters({ method, path: apiPath, operation }, options) {
  if (options.operationId && operation.operationId !== options.operationId) return false;
  if (options.method && method !== options.method) return false;
  if (options.path && apiPath !== options.path) return false;
  return true;
}

export function describeFilters(options) {
  return [options.tag ? `--tag ${options.tag}` : null, options.operationId ? `--operation-id ${options.operationId}` : null, options.method ? `--method ${options.method}` : null, options.path ? `--path ${options.path}` : null].filter(Boolean).join("\n") || "No filters provided.";
}
