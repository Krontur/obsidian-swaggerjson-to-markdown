import { normalizeComposedSchema, formatSchemaType, getSchemaDisplayType } from "../core/schema-normalizer.mjs";
import { buildExample, formatExample } from "../core/example-generator.mjs";
import {
  escapeHtml,
  renderContentType,
  renderExampleBlock,
  renderSemanticHeading,
  renderTable
} from "./html-renderer.mjs";
import { renderDescriptionBlock, renderRichText } from "./rich-text-renderer.mjs";

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
    const resolvedSchema = normalizeComposedSchema(schema, context);

    out.push(renderSemanticHeading(context, "schema", schemaName, "api-schema-title"));
    out.push("");
    out.push(`<div class="api-schema-card">`);

    if (resolvedSchema.description) {
      out.push(renderDescriptionBlock("api-description", resolvedSchema.description));
    }

    out.push(renderContentType("Type", getSchemaDisplayType(resolvedSchema, context)));
    out.push("");
    out.push(renderSchemaPropertiesTable(context, resolvedSchema));

    const example = buildExample(resolvedSchema, context);

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

export function renderSchemaPropertiesTable(context, schema) {
  const resolvedSchema = normalizeComposedSchema(schema, context);

  if (!resolvedSchema) {
    return "";
  }

  if (resolvedSchema.type === "array") {
    return [
      `<div class="api-array-label">Array of:</div>`,
      "",
      renderSchemaPropertiesTable(context, resolvedSchema.items ?? {})
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

  const rows = Object.entries(properties).map(([propertyName, propertySchema]) => {
    const resolvedProperty = normalizeComposedSchema(propertySchema, context) ?? {};

    return [
      `<code>${escapeHtml(propertyName)}</code>`,
      `<code>${escapeHtml(formatSchemaType(propertySchema, context))}</code>`,
      required.has(propertyName) ? `<span class="api-required">yes</span>` : "no",
      renderRichText(resolvedProperty.description ?? "none")
    ];
  });

  return renderTable(["Property", "Type", "Required", "Description"], rows, "api-table api-schema-table") + "\n";
}

function getSchemas(spec) {
  return spec.components?.schemas ?? spec.definitions ?? {};
}

function compactJoin(parts) {
  return parts
    .filter((part) => part !== null && part !== undefined)
    .join("\n");
}