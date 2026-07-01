import { normalizeComposedSchema, formatSchemaType, getSchemaDisplayType } from "../core/schema-normalizer.mjs";
import { extractRefName, getRefAnchor, normalizeRef, resolveRef } from "../core/ref-resolver.mjs";
import { buildExample, formatExample } from "../core/example-generator.mjs";
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

    if (resolvedSchema.description) {
      out.push(renderDescriptionBlock("api-description", resolvedSchema.description));
    }

    out.push(renderContentType("Type", getSchemaDisplayType(resolvedSchema, context)));
    out.push("");
    out.push(renderSchemaPropertiesTable(context, resolvedSchema, renderState));

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

  if (!resolvedSchema) {
    return "";
  }

  if (resolvedSchema.type === "array") {
    return [
      `<div class="api-array-label">Array of:</div>`,
      "",
      renderSchemaPropertiesTable(context, resolvedSchema.items ?? {}, tableState)
    ].join("\n");
  }

  const properties = resolvedSchema.properties ?? {};
  const required = new Set(resolvedSchema.required ?? []);

  if (!Object.keys(properties).length) {
    return [
      `<div class="api-primitive-schema"><code>${escapeHtml(formatSchemaType(resolvedSchema, context))}</code></div>`,
      ""
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
      recursiveRef ? renderRefLink(recursiveRef) : `<code>${escapeHtml(formatSchemaType(propertySchema, context))}</code>`,
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
    renderTable(["Property", "Type", "Required", "Description"], rows, "api-table api-schema-table"),
    "",
    ...detailBlocks,
    ""
  ].join("\n");
}

function getSchemas(spec) {
  return spec.components?.schemas ?? spec.definitions ?? {};
}

function getSchemaDefinitionRef(context, schemaName) {
  if (context.spec.components?.schemas?.[schemaName]) {
    return normalizeRef(`#/components/schemas/${schemaName}`);
  }

  return normalizeRef(`#/definitions/${schemaName}`);
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

  if (schema?.type === "array") {
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

function compactJoin(parts) {
  return parts
    .filter((part) => part !== null && part !== undefined)
    .join("\n");
}
