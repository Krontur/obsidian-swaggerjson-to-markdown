import { resolveRef } from "../core/ref-resolver.mjs";
import { formatSchemaType } from "../core/schema-normalizer.mjs";
import { buildExample, formatExample } from "../core/example-generator.mjs";
import {
  escapeHtml,
  renderContentType,
  renderExampleBlock,
  renderSemanticHeading,
  renderTable
} from "./html-renderer.mjs";
import { getPlainDescriptionForTable, renderDescriptionBlock, renderRichText } from "./rich-text-renderer.mjs";
import { renderSchemaPropertiesTable } from "./schema-renderer.mjs";

export function renderOperation(context, operationItem) {
  const { method, path: apiPath, operation, pathParameters } = operationItem;
  const out = [];
  const methodClass = method.toLowerCase();
  const summary = operation.summary ?? operation.operationId ?? `${method} ${apiPath}`;

  out.push(renderSemanticHeading(context, "operation", summary, "api-operation-title"));
  out.push("");

  out.push(`<div class="api-operation api-${methodClass}">`);
  out.push(`  <span class="api-method">${method}</span>`);
  out.push(`  <code class="api-path">${escapeHtml(apiPath)}</code>`);
  out.push(`</div>`);
  out.push("");

  if (operation.deprecated) {
    out.push(`<div class="api-deprecated">`);
    out.push(`  <strong>Deprecated</strong>`);
    out.push(`  <span>This operation is deprecated.</span>`);
    out.push(`</div>`);
    out.push("");
  }

  if (operation.description) {
    out.push(renderDescriptionBlock("api-operation-description", operation.description));
    out.push("");
  }

  out.push(renderParameters(context, pathParameters, operation));
  out.push(renderRequestBody(context, operation));
  out.push(renderResponses(context, operation));

  out.push(`<div class="api-operation-separator"></div>`);
  out.push("");

  return compactJoin(out);
}

function renderParameters(context, pathParameters, operation) {
  const parameters = [
    ...normalizeParameters(context, pathParameters),
    ...normalizeParameters(context, operation.parameters ?? [])
  ];

  const uniqueParameters = deduplicateParameters(parameters);

  if (!uniqueParameters.length) {
    return "";
  }

  const rows = uniqueParameters.map((parameter) => {
    const name = parameter.name ?? "body";
    const required = parameter.required ? ` <strong class="api-required">required</strong>` : "";
    const location = parameter.in ? `(${parameter.in})` : "";
    const type = formatParameterType(context, parameter);
    const descriptionParts = [renderRichText(parameter.description ?? "none")];
    const examples = collectParameterExamples(context, parameter);

    if (examples.length) {
      descriptionParts.push(renderInlineExamples(examples));
    }

    return [
      `<code>${escapeHtml(name)}</code>${required}<br><code>${escapeHtml(type)}</code><br>${location ? `<code>${escapeHtml(location)}</code>` : ""}`,
      descriptionParts.filter(Boolean).join("\n")
    ];
  });

  return [
    renderSemanticHeading(context, "section", "Parameters", "api-section api-section-parameters"),
    "",
    renderTable(["Name", "Description"], rows, "api-table api-parameters-table"),
    ""
  ].join("\n");
}

function normalizeParameters(context, parameters) {
  return parameters.map((parameter) => resolveRef(parameter, context)).filter(Boolean);
}

function deduplicateParameters(parameters) {
  const seen = new Set();
  const result = [];

  for (const parameter of parameters) {
    const key = `${parameter.in ?? "unknown"}:${parameter.name ?? "unknown"}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(parameter);
  }

  return result;
}

function formatParameterType(context, parameter) {
  if (parameter.type === "file") {
    return "file";
  }

  if (parameter.schema) {
    return formatSchemaType(parameter.schema, context);
  }

  if (parameter.content) {
    const firstMediaType = Object.values(parameter.content)[0];
    return formatSchemaType(firstMediaType?.schema ?? {}, context);
  }

  const type = parameter.type ?? "object";
  const format = parameter.format ? `($${parameter.format})` : "";

  if (parameter.type === "array" && parameter.items) {
    return `array[${formatSchemaType(parameter.items, context)}]`;
  }

  return `${type}${format}`;
}

function renderRequestBody(context, operation) {
  const out = [];

  if (operation.requestBody) {
    const requestBody = resolveRef(operation.requestBody, context);

    if (!requestBody.content) {
      context.warnings.add(`requestBody found without content in operation '${operation.operationId ?? operation.summary ?? "unknown"}'.`);
      return "";
    }

    out.push(renderSemanticHeading(context, "section", "Request Body", "api-section api-section-request"));
    out.push("");

    if (requestBody.description) {
      out.push(renderDescriptionBlock("api-operation-description", requestBody.description));
      out.push("");
    }

    for (const [contentType, mediaType] of Object.entries(requestBody.content ?? {})) {
      out.push(renderContentType("Content-Type", contentType));
      out.push("");
      out.push(renderSchemaPropertiesTable(context, mediaType.schema));

      out.push(renderMediaTypeExamples(context, mediaType, contentType, {
        fallbackSchema: mediaType.schema,
        fallbackTitle: "Example Value"
      }));
    }

    out.push("");
    return compactJoin(out);
  }

  const bodyParameter = operation.parameters
    ?.map((parameter) => resolveRef(parameter, context))
    .find((parameter) => parameter.in === "body");

  if (bodyParameter?.schema) {
    out.push(renderSemanticHeading(context, "section", "Request Body", "api-section api-section-request"));
    out.push("");

    if (bodyParameter.description) {
      out.push(renderDescriptionBlock("api-operation-description", bodyParameter.description));
      out.push("");
    }

    const consumes = operation.consumes ?? context.spec.consumes ?? ["application/json"];

    for (const contentType of consumes) {
      out.push(renderContentType("Content-Type", contentType));
      out.push("");
      out.push(renderSchemaPropertiesTable(context, bodyParameter.schema));
      out.push(renderExampleWithHeading(context, "Example Value", buildExample(bodyParameter.schema, context), contentType));
    }

    out.push("");
  }

  return compactJoin(out);
}

function renderResponses(context, operation) {
  const out = [];
  const responses = operation.responses ?? {};

  if (!Object.keys(responses).length) {
    return "";
  }

  out.push(renderSemanticHeading(context, "section", "Responses", "api-section api-section-responses"));
  out.push("");

  const responseRows = Object.entries(responses).map(([statusCode, response]) => {
    const resolvedResponse = resolveRef(response, context);

    return [
      `<code>${escapeHtml(statusCode)}</code>`,
      escapeHtml(getPlainDescriptionForTable(resolvedResponse.description ?? "none"))
    ];
  });

  out.push(renderTable(["Code", "Description"], responseRows, "api-table api-responses-table"));
  out.push("");

  for (const [statusCode, response] of Object.entries(responses)) {
    const renderedResponse = renderResponseDetail(context, operation, statusCode, response);

    if (renderedResponse) {
      out.push(renderedResponse);
      out.push("");
    }
  }

  return compactJoin(out);
}

function renderResponseDetail(context, operation, statusCode, response) {
  const resolvedResponse = resolveRef(response, context);
  const out = [];

  out.push(renderSemanticHeading(
    context,
    "subsection",
    `Response ${statusCode}`,
    "api-response-title"
  ));
  out.push("");

  if (resolvedResponse.description && hasDetailedResponseDescription(resolvedResponse.description)) {
    out.push(renderDescriptionBlock("api-operation-description", resolvedResponse.description));
    out.push("");
  }

  const contentEntries = getResponseContentEntries(context, operation, resolvedResponse);

  if (!contentEntries.length) {
    return compactJoin(out);
  }

  for (const [contentType, mediaType] of contentEntries) {
    out.push(renderContentType("Content-Type", contentType));
    out.push("");

    out.push(renderMediaTypeExamples(context, mediaType, contentType, {
      fallbackSchema: mediaType?.schema,
      fallbackTitle: `Example Value - Status ${statusCode}`,
      titlePrefix: "Example Value - "
    }));

    if (mediaType?.schema) {
      out.push(renderSemanticHeading(context, "subsection", "Model", "api-model-title"));
      out.push("");
      out.push(renderSchemaPropertiesTable(context, mediaType.schema));
      out.push("");
    }
  }

  return compactJoin(out);
}

function getResponseContentEntries(context, operation, response) {
  if (response.content) {
    return Object.entries(response.content);
  }

  if (response.schema) {
    const contentTypes = operation.produces ?? context.spec.produces ?? ["application/json"];
    return contentTypes.map((contentType) => [
      contentType,
      {
        schema: response.schema,
        examples: response.examples,
        example: response.example
      }
    ]);
  }

  return [];
}

function renderMediaTypeExamples(context, mediaType, contentType, options = {}) {
  const examples = collectMediaTypeExamples(context, mediaType, options.fallbackSchema);

  if (!examples.length) {
    return "";
  }

  return examples
    .map((example) => {
      const title = getExampleHeadingTitle(example, options);
      return renderExampleWithHeading(context, title, example.value, contentType);
    })
    .join("\n\n");
}

function collectMediaTypeExamples(context, mediaType, fallbackSchema) {
  const out = [];

  if (mediaType?.examples && Object.keys(mediaType.examples).length) {
    for (const [name, exampleObject] of Object.entries(mediaType.examples)) {
      const resolvedExample = resolveRef(exampleObject, context);
      const title = resolvedExample?.summary || resolvedExample?.description || name;

      if (resolvedExample?.value !== undefined) {
        out.push({ title, value: resolvedExample.value });
      } else if (resolvedExample?.externalValue) {
        out.push({ title, value: { externalValue: resolvedExample.externalValue } });
      } else if (resolvedExample?.summary || resolvedExample?.description) {
        out.push({ title, value: "" });
      } else if (resolvedExample !== undefined) {
        out.push({ title, value: resolvedExample });
      }
    }

    return out;
  }

  if (mediaType?.example !== undefined) {
    out.push({ title: null, value: mediaType.example });
    return out;
  }

  if (fallbackSchema) {
    const generatedExample = buildExample(fallbackSchema, context);

    if (generatedExample !== undefined) {
      out.push({ title: null, value: generatedExample });
    }
  }

  return out;
}

function getExampleHeadingTitle(example, options) {
  if (!example.title) {
    return options.fallbackTitle ?? "Example Value";
  }

  const prefix = options.titlePrefix ?? "Example Value - ";
  return `${prefix}${example.title}`;
}

function collectParameterExamples(context, parameter) {
  const out = [];

  if (parameter.examples && Object.keys(parameter.examples).length) {
    for (const [name, exampleObject] of Object.entries(parameter.examples)) {
      const resolvedExample = resolveRef(exampleObject, context);
      const title = resolvedExample?.summary || resolvedExample?.description || name;

      if (resolvedExample?.value !== undefined) {
        out.push({ title, value: resolvedExample.value });
      } else if (resolvedExample?.externalValue) {
        out.push({ title, value: resolvedExample.externalValue });
      } else if (resolvedExample?.summary || resolvedExample?.description) {
        out.push({ title, value: "" });
      } else if (resolvedExample !== undefined) {
        out.push({ title, value: resolvedExample });
      }
    }
  }

  if (!out.length && parameter.example !== undefined) {
    out.push({ title: "Example", value: parameter.example });
  }

  if (!out.length && parameter.schema?.example !== undefined) {
    out.push({ title: "Example", value: parameter.schema.example });
  }

  if (!out.length && parameter.schema?.default !== undefined) {
    out.push({ title: "Default", value: parameter.schema.default });
  }

  return out;
}

function renderInlineExamples(examples) {
  const rows = examples.map((example) => {
    const title = example.title ? `${escapeHtml(example.title)}: ` : "";
    return `<div class="api-parameter-example">${title}<code>${escapeHtml(formatInlineExampleValue(example.value))}</code></div>`;
  });

  return `<div class="api-parameter-examples">${rows.join("")}</div>`;
}

function formatInlineExampleValue(value) {
  if (value === "") {
    return "(empty)";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function hasDetailedResponseDescription(value) {
  return /<(table|ul|ol|li|p|br|pre|code|strong|b|em|i|span|a)[\s\S]*?>/i.test(String(value ?? ""));
}

function renderExampleWithHeading(context, title, example, contentType) {
  const isEmptyExample = example === "";
  const language = isEmptyExample ? "text" : (contentType?.includes("xml") ? "xml" : "json");
  const formattedExample = isEmptyExample ? "(empty)" : formatExample(example, contentType);

  if (context.options.useHeadings) {
    return [
      renderSemanticHeading(context, "subsection", title, "api-example-title"),
      "",
      renderExampleBlock("", formattedExample, language)
    ].join("\n");
  }

  return renderExampleBlock(title, formattedExample, language);
}

function compactJoin(parts) {
  return parts
    .filter((part) => part !== null && part !== undefined)
    .join("\n");
}
