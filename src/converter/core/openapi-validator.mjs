import { UserError } from "../shared/user-error.mjs";
import { collectOperations } from "./operation-collector.mjs";
import { validateDocumentSchemas } from "./schema-validator.mjs";
import { isRecord } from "./schema-types.mjs";

export function validateOpenApiDocument(document, warnings) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new UserError("The input document must be a JSON object.");
  if (!document.openapi && !document.swagger) throw new UserError("The document is neither OpenAPI nor Swagger. Missing 'openapi' or 'swagger' field.");
  for (const field of ["openapi", "swagger"]) {
    if (document[field] !== undefined && typeof document[field] !== "string") throw new UserError(`Invalid '${field}' field: expected a string.`);
  }
  if (document.openapi && !document.openapi.startsWith("3.")) warnings.add(`OpenAPI version '${document.openapi}' detected. The generator is mainly tested with OpenAPI 3.x.`);
  if (document.swagger && document.swagger !== "2.0") warnings.add(`Swagger version '${document.swagger}' detected. The generator is mainly tested with Swagger 2.0.`);
  if (!isRecord(document.info)) throw new UserError("Missing required 'info' object.");
  if (!document.paths || typeof document.paths !== "object" || Array.isArray(document.paths)) throw new UserError("Missing or invalid required 'paths' object.");
  validateMetadataShapes(document);
  if (!collectOperations(document).length) throw new UserError("No operations found under 'paths'.");
  validateDocumentSchemas(document, warnings);
  if (document.security || document.components?.securitySchemes || document.securityDefinitions || collectOperations(document).some(({ operation }) => operation.security)) {
    warnings.add("Authentication requirements and security scheme definitions are not rendered by this generator; consult the original OpenAPI document.");
  }
}

export function validateFilterCombination(options, warnings) {
  if ((options.method && !options.path) || (!options.method && options.path)) warnings.add("Using --method without --path, or --path without --method, may match more or fewer operations than expected.");
}

// Guard the metadata containers consumed by renderers; this is not a full OAS validator.
function validateMetadataShapes(document) {
  function record(value, path) {
    if (!isRecord(value)) throw new UserError(`Invalid object at ${path}.`);
    if (value.$ref !== undefined && typeof value.$ref !== "string") throw new UserError(`Invalid $ref at ${path}: expected a string.`);
    for (const key of ["description", "summary", "operationId", "name", "url"]) {
      if (value[key] !== undefined && typeof value[key] !== "string") throw new UserError(`Invalid ${key} at ${path}: expected a string.`);
    }
  }
  function array(value, path, visit) {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new UserError(`Invalid array at ${path}.`);
    value.forEach((item, index) => visit(item, `${path}/${index}`));
  }
  function text(value, path) {
    if (typeof value !== "string") throw new UserError(`Invalid string at ${path}.`);
  }
  function content(value, path) {
    record(value, path);
    if (value.content === undefined) return;
    if (!isRecord(value.content)) throw new UserError(`Invalid content at ${path}: expected an object.`);
    for (const [name, media] of Object.entries(value.content)) record(media, `${path}/content/${name}`);
  }
  record(document.info, "#/info");
  array(document.tags, "#/tags", record);
  array(document.servers, "#/servers", record);
  for (const key of ["schemes", "consumes", "produces"]) array(document[key], `#/${key}`, text);
  for (const [path, item] of Object.entries(document.paths)) {
    record(item, `#/paths/${path}`);
    array(item.parameters, `#/paths/${path}/parameters`, content);
  }
  for (const { path, method, operation } of collectOperations(document)) {
    const location = `#/paths/${path}/${method.toLowerCase()}`;
    record(operation, location);
    array(operation.tags, `${location}/tags`, text);
    array(operation.parameters, `${location}/parameters`, content);
    for (const key of ["consumes", "produces"]) array(operation[key], `${location}/${key}`, text);
    if (operation.requestBody !== undefined) content(operation.requestBody, `${location}/requestBody`);
    if (operation.responses !== undefined) {
      if (!isRecord(operation.responses)) throw new UserError(`Invalid responses at ${location}: expected an object.`);
      for (const [status, response] of Object.entries(operation.responses)) content(response, `${location}/responses/${status}`);
    }
  }
}
