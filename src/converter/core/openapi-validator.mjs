import { UserError } from "../shared/user-error.mjs";
import { collectOperations } from "./operation-collector.mjs";

export function validateOpenApiDocument(document, warnings) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new UserError("The input document must be a JSON object.");
  if (!document.openapi && !document.swagger) throw new UserError("The document is neither OpenAPI nor Swagger. Missing 'openapi' or 'swagger' field.");
  if (document.openapi && !String(document.openapi).startsWith("3.")) warnings.add(`OpenAPI version '${document.openapi}' detected. The generator is mainly tested with OpenAPI 3.x.`);
  if (document.swagger && String(document.swagger) !== "2.0") warnings.add(`Swagger version '${document.swagger}' detected. The generator is mainly tested with Swagger 2.0.`);
  if (!document.info || typeof document.info !== "object") throw new UserError("Missing required 'info' object.");
  if (!document.paths || typeof document.paths !== "object" || Array.isArray(document.paths)) throw new UserError("Missing or invalid required 'paths' object.");
  if (!collectOperations(document).length) throw new UserError("No operations found under 'paths'.");
}

export function validateFilterCombination(options, warnings) {
  if ((options.method && !options.path) || (!options.method && options.path)) warnings.add("Using --method without --path, or --path without --method, may match more or fewer operations than expected.");
}
