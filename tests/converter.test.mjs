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
