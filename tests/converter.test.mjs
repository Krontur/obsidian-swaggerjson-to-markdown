import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateOpenApiDocument, validateFilterCombination } from "../src/converter/core/openapi-validator.mjs";
import { generateMarkdown } from "../src/converter/renderer/markdown-generator.mjs";
import { WarningCollector } from "../src/converter/shared/warnings.mjs";
import { buildExample, formatExample } from "../src/converter/core/example-generator.mjs";

const DEFAULT_OPTIONS = {
  mode: "full",
  tag: null,
  operationId: null,
  method: null,
  path: null,
  useHeadings: true,
  headingOffset: 0
};

function createSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Test API",
      version: "1.0.0",
      description: "<p>Public API <strong>documentation</strong>.</p><script>alert('x')</script>"
    },
    servers: [
      { url: "https://api.example.com", description: "Production" }
    ],
    tags: [
      { name: "pets", description: "Pet operations" },
      { name: "users", description: "User operations" }
    ],
    paths: {
      "/pets": {
        get: {
          tags: ["pets"],
          operationId: "listPets",
          summary: "List pets",
          description: "<p>Returns <code>pets</code>.</p>",
          parameters: [
            {
              name: "limit",
              in: "query",
              description: "Maximum number of pets",
              schema: { type: "integer", default: 20 },
              example: 10
            }
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Pet" }
                  },
                  examples: {
                    success: {
                      summary: "Successful list",
                      value: [{ id: 1, name: "Biscuit" }]
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          tags: ["pets"],
          operationId: "createPet",
          summary: "Create pet",
          requestBody: {
            description: "Pet payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
                example: { id: 2, name: "Mochi" }
              },
              "application/xml": {
                schema: { $ref: "#/components/schemas/Pet" },
                example: "<pet><id>2</id><name>Mochi</name></pet>"
              }
            }
          },
          responses: {
            201: {
              description: "Created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Pet" }
                }
              }
            }
          }
        }
      },
      "/users": {
        get: {
          tags: ["users"],
          operationId: "listUsers",
          summary: "List users",
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        Pet: {
          type: "object",
          required: ["id", "name"],
          properties: {
            id: { type: "integer", format: "int64", example: 1, description: "Pet ID" },
            name: { type: "string", example: "Biscuit", description: "Pet name" },
            tag: { type: "string", description: "Optional label" }
          }
        }
      }
    }
  };
}

function convert(spec, options = {}) {
  const finalOptions = { ...DEFAULT_OPTIONS, ...options };
  const warnings = new WarningCollector();
  validateOpenApiDocument(spec, warnings);
  validateFilterCombination(finalOptions, warnings);
  return {
    markdown: generateMarkdown(spec, finalOptions, warnings),
    warnings: warnings.items
  };
}

function getSchemaPropertyRow(markdown, propertyName) {
  return markdown.match(new RegExp(`<tr><td><code>${propertyName}<\\/code><\\/td>[\\s\\S]*?<\\/tr>`))?.[0] ?? "";
}

test("full mode renders a complete Swagger-style Obsidian document", () => {
  const { markdown, warnings } = convert(createSpec());

  assert.equal(warnings.length, 0);
  assert.match(markdown, /cssclasses:\n  - swagger-api-doc\n  - swagger-api-full/);
  assert.match(markdown, /# Test API/);
  assert.match(markdown, /OpenAPI Version/);
  assert.match(markdown, /https:\/\/api\.example\.com/);
  assert.match(markdown, /## pets/);
  assert.match(markdown, /### List pets/);
  assert.match(markdown, /<span class="api-method">GET<\/span>/);
  assert.match(markdown, /<code class="api-path">\/pets<\/code>/);
  assert.match(markdown, /### Create pet/);
  assert.match(markdown, /## users/);
  assert.match(markdown, /### List users/);
  assert.match(markdown, /## Schemas/);
  assert.match(markdown, /### Pet/);
  assert.doesNotMatch(markdown, /<script/i);
  assert.doesNotMatch(markdown, /alert\('x'\)/);
});

test("fragment mode can filter by tag and omits unrelated operations and global schemas", () => {
  const { markdown } = convert(createSpec(), {
    mode: "fragment",
    tag: "pets",
    headingOffset: 2
  });

  assert.match(markdown, /swagger-api-fragment/);
  assert.match(markdown, /## pets/);
  assert.match(markdown, /### List pets/);
  assert.match(markdown, /### Create pet/);
  assert.doesNotMatch(markdown, /List users/);
  assert.doesNotMatch(markdown, /## Schemas/);
});

test("schema property descriptions extract embedded HTML tables below the properties table", () => {
  const spec = createSpec();
  spec.components.schemas.DeliveryStatus = {
    type: "object",
    properties: {
      code: {
        type: "integer",
        format: "int32",
        description: `Status code
          <table class="legacy" style="width: 100%">
            <thead>
              <tr>
                <th width="10%">Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status Group</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td><span class="dot accepted"></span>Accepted</td>
                <td>Initial status indicating message is accepted for processing.</td>
                <td>Accepted</td>
              </tr>
            </tbody>
          </table>`
      }
    }
  };

  const { markdown } = convert(spec);
  const codeRow = markdown.match(/<tr><td><code>code<\/code><\/td>[\s\S]*?<\/tr>/)?.[0];

  assert.ok(codeRow);
  assert.match(codeRow, /Status code\. See table below\./);
  assert.doesNotMatch(codeRow, /<table/i);
  assert.match(markdown, /#### `code` values/);
  assert.match(markdown, /\| Code \| Name \| Description \| Status Group \|/);
  assert.match(markdown, /\| 1 \| Accepted \| Initial status indicating message is accepted for processing\. \| Accepted \|/);
});

test("schema property descriptions extract embedded Markdown tables below the properties table", () => {
  const spec = createSpec();
  spec.components.schemas.DeliveryStatus = {
    type: "object",
    properties: {
      code: {
        type: "integer",
        format: "int32",
        description: `Status code

| Code | Name |
|---:|---|
| 2 | Rejected |`
      }
    }
  };

  const { markdown } = convert(spec);
  const codeRow = markdown.match(/<tr><td><code>code<\/code><\/td>[\s\S]*?<\/tr>/)?.[0];

  assert.ok(codeRow);
  assert.match(codeRow, /Status code\. See table below\./);
  assert.doesNotMatch(codeRow, /\| Code \| Name \|/);
  assert.match(markdown, /#### `code` values/);
  assert.match(markdown, /\| Code \| Name \|/);
  assert.match(markdown, /\| 2 \| Rejected \|/);
});

test("schema property descriptions without tables render normally", () => {
  const spec = createSpec();
  spec.components.schemas.DeliveryStatus = {
    type: "object",
    properties: {
      code: {
        type: "integer",
        format: "int32",
        description: "Status code with <strong>normal HTML</strong>."
      }
    }
  };

  const { markdown } = convert(spec);
  const codeRow = markdown.match(/<tr><td><code>code<\/code><\/td>[\s\S]*?<\/tr>/)?.[0];

  assert.ok(codeRow);
  assert.match(codeRow, /Status code with <strong>normal HTML<\/strong>\./);
  assert.doesNotMatch(codeRow, /See table below/);
  assert.doesNotMatch(markdown, /#### `code` values/);
});

test("rich HTML descriptions do not escape structural wrapper or heading tags", () => {
  const spec = createSpec();
  spec.info.description = "<div><h2>Purpose and functionality</h2><p>MyLINK SMS API content.</p></div>";

  const { markdown } = convert(spec);

  assert.match(markdown, /<div><div class="api-rich-heading api-rich-heading-2">Purpose and functionality<\/div><p>MyLINK SMS API content\.<\/p><\/div>/);
  assert.doesNotMatch(markdown, /&lt;div&gt;/);
  assert.doesNotMatch(markdown, /&lt;h2&gt;/);
  assert.doesNotMatch(markdown, /<h2>/);
});

test("schema property direct self references render as recursive links", () => {
  const spec = createSpec();
  spec.components.schemas.Media = {
    type: "object",
    properties: {
      thumbnail: { $ref: "#/components/schemas/Media" }
    }
  };

  const { markdown } = convert(spec);
  const thumbnailRow = getSchemaPropertyRow(markdown, "thumbnail");

  assert.match(thumbnailRow, /href="#media"/);
  assert.match(thumbnailRow, /<code>Media<\/code>/);
  assert.match(thumbnailRow, /Recursive reference\./);
  assert.match(markdown, /"\$ref": "Media"/);
});

test("schema property indirect reference cycles render as recursive links", () => {
  const spec = createSpec();
  spec.components.schemas.A = {
    type: "object",
    properties: {
      child: { $ref: "#/components/schemas/B" }
    }
  };
  spec.components.schemas.B = {
    type: "object",
    properties: {
      parent: { $ref: "#/components/schemas/A" }
    }
  };

  const { markdown } = convert(spec);
  const childRow = getSchemaPropertyRow(markdown, "child");
  const parentRow = getSchemaPropertyRow(markdown, "parent");

  assert.match(childRow, /href="#b"/);
  assert.match(childRow, /Recursive reference\./);
  assert.match(parentRow, /href="#a"/);
  assert.match(parentRow, /Recursive reference\./);
  assert.match(markdown, /"\$ref": "A"/);
});

test("schema property repeated non-recursive refs are not treated as cycles", () => {
  const spec = createSpec();
  spec.components.schemas.Shared = {
    type: "object",
    description: "Shared value.",
    properties: {
      id: { type: "string" }
    }
  };
  spec.components.schemas.Container = {
    type: "object",
    properties: {
      first: { $ref: "#/components/schemas/Shared" },
      second: { $ref: "#/components/schemas/Shared" }
    }
  };

  const { markdown } = convert(spec);
  const firstRow = getSchemaPropertyRow(markdown, "first");
  const secondRow = getSchemaPropertyRow(markdown, "second");

  assert.match(firstRow, /<code>Shared<\/code>/);
  assert.match(secondRow, /<code>Shared<\/code>/);
  assert.doesNotMatch(firstRow, /Recursive reference\./);
  assert.doesNotMatch(secondRow, /Recursive reference\./);
});

test("fragment mode can filter by operationId", () => {
  const { markdown } = convert(createSpec(), {
    mode: "fragment",
    operationId: "createPet",
    headingOffset: 3
  });

  assert.match(markdown, /### pets/);
  assert.match(markdown, /#### Create pet/);
  assert.match(markdown, /Request Body/);
  assert.match(markdown, /```xml\n<pet><id>2<\/id><name>Mochi<\/name><\/pet>\n```/);
  assert.doesNotMatch(markdown, /List pets/);
  assert.doesNotMatch(markdown, /List users/);
});

test("fragment mode can filter by HTTP method and path", () => {
  const { markdown } = convert(createSpec(), {
    mode: "fragment",
    method: "GET",
    path: "/users",
    headingOffset: 2
  });

  assert.match(markdown, /## users/);
  assert.match(markdown, /### List users/);
  assert.match(markdown, /<span class="api-method">GET<\/span>/);
  assert.match(markdown, /<code class="api-path">\/users<\/code>/);
  assert.doesNotMatch(markdown, /List pets/);
  assert.doesNotMatch(markdown, /Create pet/);
});

test("no-headings mode uses HTML title blocks instead of Markdown headings", () => {
  const { markdown } = convert(createSpec(), {
    useHeadings: false
  });

  assert.match(markdown, /<div class="api-document-title">Test API<\/div>/);
  assert.doesNotMatch(markdown, /^# Test API/m);
});

test("invalid JSON and invalid OpenAPI documents fail with clear errors", () => {
  assert.throws(() => JSON.parse("{broken"), /Expected property name|Unexpected token/);
  assert.throws(() => convert({ info: { title: "Missing OpenAPI" }, paths: {} }), /neither OpenAPI nor Swagger/);
  assert.throws(() => convert({ openapi: "3.0.3", info: { title: "No paths" } }), /paths/);
  assert.throws(() => convert({ openapi: "3.0.3", info: { title: "Empty" }, paths: {} }), /No operations found/);
});

test("unmatched filters fail instead of generating an empty document", () => {
  assert.throws(() => convert(createSpec(), {
    mode: "fragment",
    operationId: "missingOperation",
    headingOffset: 2
  }), /No operations matched/);

  assert.throws(() => convert(createSpec(), {
    mode: "fragment",
    tag: "missing-tag",
    headingOffset: 2
  }), /No operations matched/);
});

test("warnings are collected for unresolved refs without stopping generation", () => {
  const spec = createSpec();
  spec.paths["/pets"].get.responses[200].content["application/json"].schema.items = { $ref: "#/components/schemas/Missing" };
  spec.paths["/users"].get.responses[200].content["application/json"].schema.items = { $ref: "https://example.com/User.json" };

  const { markdown, warnings } = convert(spec);

  assert.match(markdown, /# Test API/);
  assert.ok(warnings.some((warning) => warning.includes("Unresolved internal $ref")));
  assert.ok(warnings.some((warning) => warning.includes("External or remote $ref")));
});

test("Swagger 2.0 documents are supported", () => {
  const spec = {
    swagger: "2.0",
    info: { title: "Swagger API", version: "1.0.0" },
    host: "api.example.com",
    basePath: "/v1",
    schemes: ["https"],
    paths: {
      "/ping": {
        get: {
          tags: ["health"],
          operationId: "ping",
          produces: ["application/json"],
          responses: {
            200: {
              description: "OK",
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "ok" }
                }
              }
            }
          }
        }
      }
    }
  };

  const { markdown, warnings } = convert(spec);

  assert.equal(warnings.length, 0);
  assert.match(markdown, /Swagger Version/);
  assert.match(markdown, /https:\/\/api\.example\.com\/v1/);
  assert.match(markdown, /### ping/);
  assert.match(markdown, /"status": "ok"/);
});

test("example generation formats JSON, XML, enums, arrays, and composed schemas", () => {
  const context = {
    spec: createSpec(),
    options: DEFAULT_OPTIONS,
    warnings: new WarningCollector()
  };

  const example = buildExample({
    allOf: [
      { type: "object", properties: { id: { type: "integer", example: 5 } } },
      {
        type: "object",
        properties: {
          status: { type: "string", enum: ["available", "sold"] },
          labels: { type: "array", items: { type: "string", example: "small" } }
        }
      }
    ]
  }, context);

  assert.deepEqual(example, {
    id: 5,
    status: "available",
    labels: ["small"]
  });
  assert.equal(formatExample(example, "application/json"), JSON.stringify(example, null, 2));
  assert.equal(formatExample("<pet><id>5</id></pet>", "application/xml"), "<pet><id>5</id></pet>");
  assert.equal(formatExample(example, "application/xml"), "<!-- XML example not generated -->");
});

test("plugin manifest and package metadata stay aligned", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const versions = JSON.parse(await readFile("versions.json", "utf8"));

  assert.equal(manifest.id, "swaggerjson-to-markdown");
  assert.equal(manifest.name, "Swagger JSON to Markdown");
  assert.equal(manifest.version, pkg.version);
  assert.equal(versions[pkg.version], manifest.minAppVersion);
  assert.equal(manifest.authorUrl, "https://oscartur.dev/");
  assert.equal(manifest.fundingUrl, "https://buymeacoffee.com/krontur");
});
