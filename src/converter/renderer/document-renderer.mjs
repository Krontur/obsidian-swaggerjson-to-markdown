import { CSS_CLASS } from "../shared/constants.mjs";
import { escapeHtml, renderSemanticHeading } from "./html-renderer.mjs";
import { renderDescriptionBlock } from "./rich-text-renderer.mjs";
import { renderOperation } from "./operation-renderer.mjs";
import { renderSchemas } from "./schema-renderer.mjs";

export function renderFullDocument(context, operationsByTag) {
  const out = [];

  out.push(renderFrontmatter(["swagger-api-full"]));
  out.push("");

  out.push(renderDocumentHeader(context));
  out.push(renderServers(context));

  for (const [tagName, operations] of operationsByTag.entries()) {
    out.push(renderTag(context, tagName, "full"));

    for (const operation of operations) {
      out.push(renderOperation(context, operation));
    }
  }

  out.push(renderSchemas(context, "full"));

  return compactJoin(out);
}

export function renderFragmentDocument(context, operationsByTag) {
  const out = [];

  out.push(renderFrontmatter(["swagger-api-fragment"]));
  out.push(`<!-- Generated API fragment. Insert this file in an Obsidian note that also uses cssclasses: ${CSS_CLASS}. -->`);
  out.push("");

  for (const [tagName, operations] of operationsByTag.entries()) {
    out.push(renderTag(context, tagName, "fragment"));

    for (const operation of operations) {
      out.push(renderOperation(context, operation));
    }
  }

  return compactJoin(out);
}

function renderFrontmatter(extraClasses = []) {
  const classes = [CSS_CLASS, ...extraClasses];

  return [
    "---",
    "cssclasses:",
    ...classes.map((className) => `  - ${className}`),
    "---",
    ""
  ].join("\n");
}

function renderDocumentHeader(context) {
  const { spec } = context;
  const out = [];

  out.push(renderSemanticHeading(
    context,
    "document",
    spec.info?.title ?? "API Documentation",
    "api-document-title"
  ));
  out.push("");

  out.push(`<div class="api-info-card">`);

  if (spec.openapi) {
    out.push(`  <div class="api-info-item"><span>OpenAPI Version</span><code>${escapeHtml(spec.openapi)}</code></div>`);
  }

  if (spec.swagger) {
    out.push(`  <div class="api-info-item"><span>Swagger Version</span><code>${escapeHtml(spec.swagger)}</code></div>`);
  }

  if (spec.info?.version) {
    out.push(`  <div class="api-info-item"><span>API Version</span><code>${escapeHtml(spec.info.version)}</code></div>`);
  }

  out.push(`</div>`);
  out.push("");

  if (spec.info?.description) {
    out.push(renderDescriptionBlock("api-description", spec.info.description));
    out.push("");
  }

  return compactJoin(out);
}

function renderServers(context) {
  const { spec } = context;
  const out = [];
  const servers = spec.servers ?? [];

  if (servers.length) {
    out.push(renderSemanticHeading(context, "mainSection", "Servers", "api-main-section-title"));
    out.push("");
    out.push(`<div class="api-servers">`);

    for (const server of servers) {
      out.push(`  <div class="api-server">`);
      out.push(`    <code>${escapeHtml(server.url)}</code>`);

      if (server.description) {
        out.push(`    <span>${escapeHtml(server.description)}</span>`);
      }

      out.push(`  </div>`);
    }

    out.push(`</div>`);
    out.push("");
    return compactJoin(out);
  }

  if (spec.host) {
    const schemes = spec.schemes?.length ? spec.schemes : ["https"];
    const basePath = spec.basePath ?? "";

    out.push(renderSemanticHeading(context, "mainSection", "Servers", "api-main-section-title"));
    out.push("");
    out.push(`<div class="api-servers">`);

    for (const scheme of schemes) {
      out.push(`  <div class="api-server">`);
      out.push(`    <code>${escapeHtml(`${scheme}://${spec.host}${basePath}`)}</code>`);
      out.push(`  </div>`);
    }

    out.push(`</div>`);
    out.push("");
  }

  return compactJoin(out);
}

function renderTag(context, tagName, renderMode) {
  const { spec } = context;
  const out = [];
  const tag = spec.tags?.find((item) => item.name === tagName);
  const fallbackClass = renderMode === "full"
    ? "api-tag-title api-tag-title-full"
    : "api-tag-title api-tag-title-fragment";

  out.push(renderSemanticHeading(context, "tag", tagName, fallbackClass));
  out.push("");

  if (tag?.description) {
    out.push(renderDescriptionBlock("api-tag-description", tag.description));
    out.push("");
  }

  if (tag?.externalDocs?.url) {
    const label = tag.externalDocs.description ?? "Find out more";
    out.push(`<a class="api-external-doc" href="${escapeHtml(tag.externalDocs.url)}">${escapeHtml(label)}</a>`);
    out.push("");
  }

  return compactJoin(out);
}

function compactJoin(parts) {
  return parts
    .filter((part) => part !== null && part !== undefined)
    .join("\n");
}