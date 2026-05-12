# Swagger JSON to Markdown for Obsidian

Obsidian plugin to convert `swagger.json` or `openapi.json` files into static Swagger-style Markdown.

The goal is to generate API documentation that feels close to Swagger UI, but works well inside Obsidian notes and PDF exports. The plugin does not try to reproduce interactive Swagger UI controls such as `Try it out`, editable fields, or `Execute` buttons, because those controls do not provide value in static Markdown or PDF output.

## Features

- Converts Swagger 2.0 and OpenAPI 3.x JSON files to Markdown.
- Adds a context menu action to `.json` files in your vault.
- Adds a command to convert the active JSON file.
- Provides an options modal before generating the Markdown file.
- Generates complete documentation with `full` mode.
- Generates reusable fragments with `fragment` mode.
- Groups operations by `tags`.
- Filters fragment output by `tag`, `operationId`, HTTP method, and path.
- Uses real Markdown headings for Obsidian outline support and PDF bookmarks.
- Can disable Markdown headings and use HTML title blocks instead.
- Generates sections for API information, servers, endpoints, parameters, request bodies, responses, examples, and schemas.
- Keeps controlled HTML blocks with `api-*` classes so the bundled plugin CSS can render a Swagger-like layout.
- Sanitizes rich HTML found in OpenAPI `description` fields, including tables, lists, `code`, `tt`, links, and line breaks.
- Renders named `examples` from request bodies, responses, and parameters.
- Renders details for every response status code, not only the first one.
- Emits examples as fenced Markdown code blocks such as `json`, `xml`, or `text`.
- Resolves internal `$ref` values and reports warnings for unresolved internal, external, or remote references.

## Installation

For manual installation in a vault, copy these files:

```text
main.js
manifest.json
styles.css
```

into:

```text
VaultFolder/.obsidian/plugins/swaggerjson-to-markdown/
```

Then enable the plugin in Obsidian under `Settings -> Community plugins`.

## Basic Usage

1. Right-click a `.json` file in Obsidian.
2. Select `Convert Swagger/OpenAPI to Markdown`.
3. Choose the generation mode and filters in the modal.
4. Click `Convert`.

You can also open a JSON file and run the command:

```text
Convert active JSON to Swagger-style Markdown
```

The generated Markdown file is created next to the JSON file by default, unless you set an output folder in the modal or plugin settings.

## Generation Modes

### Full Mode

`full` mode generates complete API documentation. It includes:

- Obsidian frontmatter.
- Main API title.
- General API information.
- Server definitions.
- All operations grouped by tags.
- Global schemas.

When `full` mode is selected, the modal automatically fixes all filters to `All` and disables tag, operation, operation ID, method, and path controls. This is intentional: full mode means the whole API document.

The generated note includes:

```md
---
cssclasses:
  - swagger-api-doc
  - swagger-api-full
---
```

### Fragment Mode

`fragment` mode generates a reusable piece of documentation. It is useful when you want to embed a specific tag or operation inside a larger hand-written note.

Fragments can be filtered by:

- `tag`
- `operationId`
- HTTP method
- path

The generated fragment includes:

```md
---
cssclasses:
  - swagger-api-doc
  - swagger-api-fragment
---
```

If you embed a generated fragment in another note with Obsidian embeds:

```md
![[docs/generated/fragments/add-pet.md]]
```

the parent note should also include:

```md
---
cssclasses:
  - swagger-api-doc
---
```

This ensures the bundled plugin CSS applies correctly to the embedded content.

## Modal Options

- `Mode`: choose `Full` or `Fragment`.
- `Tag`: limits fragment output to operations with the selected tag.
- `Operation`: selects one specific operation from the current tag selection.
- `Manual operation ID`: filters by a specific `operationId`.
- `Manual method and path`: filters endpoints that do not have an `operationId`.
- `Markdown headings`: uses real Markdown headings, recommended for Obsidian outlines and PDF bookmarks.
- `Fragment heading offset`: changes the base heading level for fragments, from 1 to 5.
- `Output folder`: custom destination folder inside the vault. Empty means next to the JSON file.
- `Markdown file name`: output file name.
- `Overwrite if it exists`: replaces an existing Markdown file instead of creating a numbered file name.
- `Open when finished`: opens the generated note after conversion.

The method and path controls are dynamic. Methods only show values available for the current tag selection, and paths only show values available for the selected method.

## Generated Content

For each operation, the output includes static documentation equivalent to the useful reading parts of Swagger UI:

- Summary and description.
- HTTP method and path.
- Parameters, including declared `example` and `examples`.
- Request body description, schema, and named examples.
- Response summary table.
- Details for each response status code.
- Response content types.
- Named response examples.
- Response model/schema.
- Global schemas in full mode.

Interactive Swagger UI controls are intentionally not generated:

- `Try it out`
- editable inputs
- `Execute` buttons
- interactive selectors

## Examples and XML/JSON Code

Examples are rendered as fenced Markdown code blocks:

````md
```xml
<env:Header>
  <ns3:Action>...</ns3:Action>
</env:Header>
```
````

This prevents XML examples from appearing as escaped text such as:

```text
&lt;env:Header&gt;
```

In Obsidian and PDF exports, XML/JSON examples remain readable as code.

## Rich Text Descriptions

OpenAPI descriptions sometimes contain HTML. The plugin sanitizes this HTML and keeps useful content such as:

- paragraphs
- line breaks
- lists
- tables
- `code` and `tt`
- safe `http`, `https`, and `mailto` links
- `colspan` and `rowspan` in tables

Description tables receive the `api-description-table` class. The bundled CSS keeps them PDF-friendly with fixed layout, full width, wrapping, and smaller print sizing.

## CSS in Obsidian

The Swagger-style CSS is bundled in the plugin `styles.css` file. You do not need to manually install a separate CSS snippet.

Generated notes include the required frontmatter:

```md
---
cssclasses:
  - swagger-api-doc
  - swagger-api-full
---
```

Fragments use:

```md
---
cssclasses:
  - swagger-api-doc
  - swagger-api-fragment
---
```

The styles are visible in Reading View and in rendered Markdown views. The final appearance can still vary depending on your active Obsidian theme.

## PDF Export

For reliable PDF bookmarks, generate a document in `full` mode and export the generated Markdown file directly.

Recommended workflow:

1. Generate a `full` document.
2. Open the generated `.md` file directly in Obsidian.
3. Keep `Markdown headings` enabled.
4. Export the generated file.

For formal PDFs with bookmarks, the Obsidian plugin **Better Export PDF** is recommended. Obsidian's native PDF export may fail to create reliable bookmarks for complex documents that mix Markdown, HTML blocks, large tables, code blocks, and embedded fragments.

Avoid exporting a parent note that only embeds the generated full document:

```md
![[docs/generated/api-full.md]]
```

Fragments are useful for manual documentation, but direct export of a full generated file is more reliable for final PDFs.

## Recommended Vault Structure

```text
my-vault/
  docs/
    openapi/
      swagger.json
    generated/
      api-full.md
      fragments/
        add-pet.md
```

One practical workflow is:

- Keep source OpenAPI JSON files under `docs/openapi/`.
- Generate full documentation into `docs/generated/`.
- Generate operation fragments into `docs/generated/fragments/`.
- Embed fragments in hand-written documentation notes when needed.

## Errors and Warnings

When Markdown generation fails, Obsidian shows a short notice and opens an error modal with the full details. The modal includes a `Copy details` button so the error can be copied into an issue, chat, or debugging note.

Errors can happen when:

- the selected file is not valid JSON;
- the document is missing `openapi` or `swagger`;
- the document is missing the required `info` object;
- the document is missing a valid `paths` object;
- no operations are found under `paths`;
- the selected filters do not match any operation;
- the output file cannot be created or overwritten.

Warnings do not stop generation. They are reported in the Obsidian developer console and the completion notice shows the warning count. Typical warnings include:

- unresolved internal `$ref`;
- external file `$ref`;
- remote URL `$ref`;
- unexpected Swagger/OpenAPI version values.

## Known Limitations

- External file `$ref` values are not resolved.
- Remote URL `$ref` values are not resolved.
- Automatic XML generation is limited; declared XML examples are preserved and rendered as code.
- Extremely complex schemas may require manual review.
- The visual result depends on the active Obsidian theme.
- PDF bookmark quality depends on the exporter; **Better Export PDF** is recommended for formal exports.
- Input support is JSON-focused. YAML OpenAPI files are not converted by this plugin.

## Troubleshooting

### Styles Do Not Appear

Check that:

- the plugin is enabled;
- the generated note contains `cssclasses: swagger-api-doc`;
- you are viewing the note in Reading View or rendered Markdown mode;
- the parent note also has `cssclasses: swagger-api-doc` when embedding fragments.

### PDF Bookmarks Are Missing

Use **Better Export PDF** and check that:

- you generated a `full` document;
- `Markdown headings` was enabled;
- you are exporting the generated file directly;
- you are not exporting only a parent note that embeds the generated file.

### XML Examples Show `&lt;` and `&gt;`

The current generator emits examples as fenced code blocks, so XML should render as code rather than escaped HTML. Regenerate the document and check that the source example is declared as an OpenAPI example.

### There Are Unresolved `$ref` Warnings

Check that the referenced schema, parameter, response, or component exists in the same JSON document. If your OpenAPI file uses external references, bundle it into a single JSON file before running the plugin.

## Development

Install dependencies:

```bash
npm install
```

Start the development build:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Run lint:

```bash
npm run lint
```

## Credits

Based on the functionality from `Krontur/swaggerjson_to_markdown`.

Author: Oscar Gonzalez Tur

- Website: https://oscartur.dev/
- Support the project: https://buymeacoffee.com/krontur

## License

MIT.
