import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OPTIONS } from "./helpers/conversion.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/springdoc-nullable.json", import.meta.url), "utf8"));
const source = process.env.PLUGIN_REGRESSION_BUNDLE
  ? await readFile(process.env.PLUGIN_REGRESSION_BUNDLE, "utf8")
  : (await build({ entryPoints: [fileURLToPath(new URL("../src/main.ts", import.meta.url))], bundle: true, write: false, format: "cjs", platform: "node", packages: "external" })).outputFiles[0].text;

class FakeTFile {
  constructor(path) {
    this.path = path;
    const name = path.split("/").pop();
    this.extension = name.split(".").pop();
    this.basename = name.slice(0, -(this.extension.length + 1));
  }
}

async function createHost() {
  const files = new Map();
  const contents = new Map();
  const notices = [];
  const opened = [];
  const warnings = [];
  const registrations = [];
  const sourceFile = new FakeTFile("api-docs.json");
  files.set(sourceFile.path, sourceFile);
  class FakePlugin {
    constructor(app) { this.app = app; this.commands = []; }
    async loadData() { return { openAfterCreate: false }; }
    async saveData(data) { this.savedData = { ...data }; }
    registerEvent(event) { registrations.push(event); }
    addCommand(command) { this.commands.push(command); }
    addSettingTab(tab) { this.settingTab = tab; }
  }
  const obsidian = {
    Plugin: FakePlugin, Modal: class {}, PluginSettingTab: class {}, TFile: FakeTFile,
    Notice: class { constructor(message) { notices.push(message); } }
  };
  const module = { exports: {} };
  const nativeRequire = createRequire(import.meta.url);
  const require = (name) => name === "obsidian" ? obsidian : nativeRequire(name);
  new Function("require", "module", "exports", "console", source)(require, module, module.exports, { ...console, warn: (...args) => warnings.push(args) });
  const app = {
    vault: {
      getAbstractFileByPath: (path) => files.get(path) ?? null,
      async createFolder(path) { assert.equal(files.has(path), false); files.set(path, { path }); },
      async create(path, text) {
        assert.equal(files.has(path), false);
        const file = new FakeTFile(path);
        files.set(path, file);
        contents.set(path, text);
        return file;
      },
      async modify(file, text) { assert.equal(files.get(file.path), file); contents.set(file.path, text); }
    },
    workspace: {
      on: (name, callback) => ({ name, callback }),
      getLeaf: () => ({ async openFile(file) { opened.push(file.path); } })
    }
  };
  const plugin = new module.exports.default(app);
  await plugin.onload();
  const request = { ...OPTIONS, outputFileName: "api.md", outputFolder: "docs/generated", overwriteExisting: false, openAfterCreate: true, selectedOperation: "" };
  return { plugin, request, files, contents, sourceFile, notices, opened, registrations, warnings };
}

test("plugin workflow creates folders/files, registers its command, and persists settings", async () => {
  const host = await createHost();
  await host.plugin.convertFile(host.sourceFile, fixture, host.request);
  assert.ok(host.files.has("docs"));
  assert.ok(host.files.has("docs/generated"));
  const markdown = host.contents.get("docs/generated/api.md");
  assert.equal([...markdown.matchAll(/class="api-operation api-/g)].length, 3);
  assert.match(markdown, /string \| null/);
  assert.equal(host.plugin.commands[0].id, "convert-active-json");
  assert.equal(host.registrations[0].name, "file-menu");
  assert.equal(host.plugin.savedData.outputFolder, "docs/generated");
  assert.equal(host.plugin.savedData.openAfterCreate, true);
  assert.deepEqual(host.opened, ["docs/generated/api.md"]);
  assert.ok(host.notices.some((message) => message.includes("Markdown generated:")));
  assert.ok(host.warnings.length > 0);
});

test("plugin workflow preserves existing files unless overwrite is selected", async () => {
  const host = await createHost();
  await host.plugin.convertFile(host.sourceFile, fixture, host.request);
  const first = host.contents.get("docs/generated/api.md");
  await host.plugin.convertFile(host.sourceFile, fixture, { ...host.request, openAfterCreate: false });
  assert.equal(host.contents.get("docs/generated/api.md"), first);
  assert.equal(host.contents.get("docs/generated/api-2.md"), first);
  const modified = JSON.parse(JSON.stringify(fixture));
  modified.info.title = "Updated title";
  await host.plugin.convertFile(host.sourceFile, modified, { ...host.request, overwriteExisting: true, openAfterCreate: false });
  assert.match(host.contents.get("docs/generated/api.md"), /# Updated title/);
  assert.equal(host.contents.size, 2);
  assert.equal(host.opened.length, 1);
});

test("invalid schemas fail before the plugin writes files or settings", async () => {
  const host = await createHost();
  const invalid = JSON.parse(JSON.stringify(fixture));
  invalid.components.schemas.Item.properties.name.type = {};
  await assert.rejects(host.plugin.convertFile(host.sourceFile, invalid, host.request), /Invalid type/);
  assert.equal(host.contents.size, 0);
  assert.equal(host.plugin.savedData, undefined);
  assert.equal(host.opened.length, 0);
});

test("plugin workflow converts the original local SpringDoc document", { skip: !process.env.OPENAPI_REGRESSION_FILE }, async () => {
  const original = JSON.parse(await readFile(process.env.OPENAPI_REGRESSION_FILE, "utf8"));
  const host = await createHost();
  await host.plugin.convertFile(host.sourceFile, original, host.request);
  const markdown = host.contents.get("docs/generated/api.md");
  assert.equal([...markdown.matchAll(/class="api-operation api-/g)].length, 36);
  assert.equal([...markdown.matchAll(/class="api-schema-card"/g)].length, 47);
  assert.match(markdown, /string \| null/);
  assert.match(markdown, /map\[string, any\] \| null/);
});
