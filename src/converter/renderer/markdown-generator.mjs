import { collectOperations, groupOperationsByTag } from "../core/operation-collector.mjs";
import { filterOperations } from "../core/operation-filter.mjs";
import { renderFullDocument, renderFragmentDocument } from "./document-renderer.mjs";

export function generateMarkdown(spec, options, warnings) {
  const context = { spec, options, warnings };
  const operations = collectOperations(spec);
  const filteredOperations = filterOperations(operations, options);
  const operationsByTag = groupOperationsByTag(filteredOperations, options.tag);
  if (options.mode === "fragment") return renderFragmentDocument(context, operationsByTag);
  return renderFullDocument(context, operationsByTag);
}
