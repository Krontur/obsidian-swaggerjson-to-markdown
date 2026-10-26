import { normalizeComposedSchema, formatSchemaType, getSchemaDisplayType } from "../core/schema-normalizer.mjs";
import { extractRefName, getRefAnchor, normalizeRef, resolveRef } from "../core/ref-resolver.mjs";
import { buildExample, formatExample } from "../core/example-generator.mjs";
import { getSchemaTypes, needsSchemaDefinition } from "../core/schema-types.mjs";
import {
  escapeHtml,
  escapeHtmlAttribute,
  renderContentType,
  renderExampleBlock,
  renderSemanticHeading,
  renderTable
} from "./html-renderer.mjs";
import { extractDescriptionTables, renderDescriptionBlock, renderRichText } from "./rich-text-renderer.mjs";

export function renderSchemas(context, renderMode) {
  const schemas = getSchemas(context.spec);

  if (!Object.keys(schemas).length) {
    return "";
  }

  const out = [];

  out.push(renderSemanticHeading(
    context,
    renderMode === "full" ? "mainSection" : "tag",
    "Schemas",
    renderMode === "full" ? "api-main-section-title" : "api-tag-title api-tag-title-fragment"
  ));
  out.push("");

  for (const [schemaName, schema] of Object.entries(schemas)) {
    const schemaRef = getSchemaDefinitionRef(context, schemaName);
    const renderState = { refStack: [schemaRef] };
    const resolvedSchema = normalizeComposedSchema(schema, context, renderState);

    out.push(renderSemanticHeading(context, "schema", schemaName, "api-schema-title"));
    out.push("");
    out.push(`<div class="api-schema-card">`);

    if (resolvedSchema?.description) {
      out.push(renderDescriptionBlock("api-description", resolvedSchema.description));
    }

    out.push(renderContentType("Type", getSchemaDisplayType(resolvedSchema, context)));
    out.push("");
    out.push(renderSchemaPropertiesTable(context, schema, renderState));

    const example = buildExample(resolvedSchema, context, renderState);

    if (example !== undefined) {
      if (context.options.useHeadings) {
        out.push(renderSemanticHeading(context, "subsection", "Example Value", "api-example-title"));
        out.push("");
        out.push(renderExampleBlock("", formatExample(example, "application/json"), "json"));
      } else {
        out.push(renderExampleBlock("Example Value", formatExample(example, "application/json"), "json"));
      }
    }

    out.push(`</div>`);
    out.push("");
  }

  return compactJoin(out);
}

export function renderSchemaPropertiesTable(context, schema, state = {}) {
  const resolvedSchema = normalizeComposedSchema(schema, context, state);
  const tableState = getSchemaTableState(schema, state);

  if (resolvedSchema === undefined) {
    return "";
  }

  const definition = renderSchemaDefinitions(schema, context);
  const types = getSchemaTypes(resolvedSchema);
  if (types.includes("array")) {
    const typeLabel = types.length > 1 ? `<div class="api-primitive-schema"><code>${escapeHtml(formatSchemaType(schema, context))}</code></div>\n` : "";
    if ((state.depth ?? 0) > 50) {
      context.warnings.add("Schema table rendering reached its depth limit; a reference is shown instead.");
      return `<div class="api-primitive-schema"><code>${escapeHtml(formatSchemaType(schema, context))}</code></div>`;
    }
    return [
      ...(typeLabel ? [typeLabel] : []),
      `<div class="api-array-label">Array of:</div>`,
      "",
      renderSchemaPropertiesTable(context, resolvedSchema.items ?? {}, { ...tableState, depth: (state.depth ?? 0) + 1 }),
      ...(definition ? [definition] : [])
    ].join("\n");
  }

  const properties = resolvedSchema.properties ?? {};
  const required = new Set(resolvedSchema.required ?? []);

  if (!Object.keys(properties).length) {
    return [
      `<div class="api-primitive-schema"><code>${escapeHtml(formatSchemaType(resolvedSchema, context))}</code></div>`,
      "",
      ...(definition ? [definition] : [])
    ].join("\n");
  }

  const propertyEntries = Object.entries(properties).map(([propertyName, propertySchema]) => {
    const recursiveRef = getRecursivePropertyRef(context, propertySchema, tableState);
    const resolvedProperty = recursiveRef ? {} : normalizeComposedSchema(propertySchema, context, tableState) ?? {};
    const descriptionDetails = recursiveRef
      ? { inlineDescription: "Recursive reference.", tables: [] }
      : extractDescriptionTables(resolvedProperty.description ?? "none");

    return {
      propertyName,
      propertySchema,
      recursiveRef,
      descriptionDetails
    };
  });

  const rows = propertyEntries.map(({ propertyName, propertySchema, recursiveRef, descriptionDetails }) => {
    return [
      `<code>${escapeHtml(propertyName)}</code>`,
      recursiveRef ? renderRecursiveType(propertySchema, recursiveRef, context) : `<code>${escapeHtml(formatSchemaType(propertySchema, context))}</code>`,
      required.has(propertyName) ? `<span class="api-required">yes</span>` : "no",
      renderRichText(descriptionDetails.inlineDescription)
    ];
  });

  const detailBlocks = propertyEntries
    .map(({ propertyName, descriptionDetails }) => {
      if (!descriptionDetails.tables.length) {
        return "";
      }

      return [
        renderSemanticHeading(context, "section", `\`${propertyName}\` values`, "api-property-values-title"),
        "",
        descriptionDetails.tables.join("\n\n")
      ].join("\n");
    })
    .filter(Boolean);

  return [
    ...(types.length > 1 ? [`<div class="api-primitive-schema"><code>${escapeHtml(formatSchemaType(schema, context))}</code></div>`] : []),
    renderTable(["Property", "Type", "Required", "Description"], rows, "api-table api-schema-table"),
    "",
    ...detailBlocks,
    "",
    ...(definition ? [definition] : [])
  ].join("\n");
}

function getSchemas(spec) {
  return spec.components?.schemas ?? spec.definitions ?? {};
}

function getSchemaDefinitionRef(context, schemaName) {
  if (context.spec.components?.schemas?.[schemaName] !== undefined) {
    return normalizeRef(`#/components/schemas/${escapePointerToken(schemaName)}`);
  }

  return normalizeRef(`#/definitions/${escapePointerToken(schemaName)}`);
}

function getSchemaTableState(schema, state) {
  const ref = normalizeRef(schema?.$ref);

  if (!ref || (state.refStack ?? []).includes(ref)) {
    return state;
  }

  return {
    ...state,
    refStack: [...(state.refStack ?? []), ref]
  };
}

function getRecursivePropertyRef(context, schema, state) {
  const directRef = normalizeRef(schema?.$ref);

  if (directRef) {
    if ((state.refStack ?? []).includes(directRef)) {
      return directRef;
    }

    return schemaRefCreatesCycle(context, directRef, [...(state.refStack ?? []), directRef]) ? directRef : null;
  }

  if (getSchemaTypes(schema).includes("array")) {
    return getRecursivePropertyRef(context, schema.items ?? {}, state);
  }

  if (schema?.additionalProperties && schema.additionalProperties !== true) {
    return getRecursivePropertyRef(context, schema.additionalProperties, state);
  }

  return null;
}

function schemaRefCreatesCycle(context, ref, refStack, seen = new Set()) {
  if (seen.has(ref)) {
    return false;
  }

  seen.add(ref);

  const resolved = resolveRef({ $ref: ref }, context);

  if (!resolved || resolved.$ref === ref) {
    return false;
  }

  return schemaContainsRefCycle(context, resolved, refStack, seen);
}

function schemaContainsRefCycle(context, schema, refStack, seen) {
  if (!schema) {
    return false;
  }

  const ref = normalizeRef(schema.$ref);

  if (ref) {
    if (refStack.includes(ref)) {
      return true;
    }

    return schemaRefCreatesCycle(context, ref, [...refStack, ref], seen);
  }

  const childSchemas = [
    ...(schema.allOf ?? []),
    ...(schema.oneOf ?? []),
    ...(schema.anyOf ?? []),
    schema.items,
    schema.additionalProperties === true ? null : schema.additionalProperties,
    ...Object.values(schema.properties ?? {})
  ].filter(Boolean);

  return childSchemas.some((childSchema) => schemaContainsRefCycle(context, childSchema, refStack, seen));
}

function renderRefLink(ref) {
  return `<a href="${escapeHtmlAttribute(getRefAnchor(ref))}"><code>${escapeHtml(extractRefName(ref))}</code></a>`;
}

function renderRecursiveType(schema, ref, context) {
  if (schema.$ref !== undefined) return `${renderRefLink(ref)}${schema.nullable === true ? " | null" : ""}`;
  if (getSchemaTypes(schema).length > 1) return `<code>${escapeHtml(formatSchemaType(schema, context))}</code> (${renderRefLink(ref)})`;
  return renderRefLink(ref);
}

function escapePointerToken(value) {
  return encodeURIComponent(value.replace(/~/g, "~0").replace(/\//g, "~1"));
}

function renderSchemaDefinitions(schema, context) {
  const definitions = [];
  const seen = new Set();
  let current = schema;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    if (needsSchemaDefinition(current)) {
      definitions.push([
        "<details><summary>Schema definition (additional constraints)</summary>",
        "",
        renderExampleBlock("", JSON.stringify(current, null, 2), "json"),
        "",
        "</details>"
      ].join("\n"));
    }
    if (current?.$ref === undefined) break;
    current = resolveRef(current, context);
  }
  return definitions.join("\n\n");
}

function compactJoin(parts) {
  return parts
    .filter((part) => part !== null && part !== undefined)
    .join("\n");
}
