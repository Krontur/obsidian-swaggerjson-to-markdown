import { HTTP_METHODS } from "../shared/constants.mjs";

export function collectOperations(spec) {
  const result = [];
  for (const [apiPath, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (operation) result.push({ method: method.toUpperCase(), path: apiPath, operation, pathParameters: pathItem.parameters ?? [] });
    }
  }
  return result;
}

export function groupOperationsByTag(operations, tagFilter = null) {
  const operationsByTag = new Map();
  for (const item of operations) {
    const tags = item.operation.tags?.length ? item.operation.tags : ["default"];
    for (const tag of tags) {
      if (tagFilter && tag !== tagFilter) continue;
      if (!operationsByTag.has(tag)) operationsByTag.set(tag, []);
      operationsByTag.get(tag).push(item);
    }
  }
  return operationsByTag;
}
