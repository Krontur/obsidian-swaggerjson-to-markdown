import { App, Modal, Notice, Plugin, Setting, TFile } from "obsidian";
import {
	ConversionOptions,
	OperationSummary,
	convertOpenApiToMarkdown,
	listOperations,
	listTags,
	parseOpenApiJson,
} from "./converter-api";
import {
	DEFAULT_SETTINGS,
	SwaggerJsonToMarkdownSettingTab,
	SwaggerJsonToMarkdownSettings,
} from "./settings";

type ConversionRequest = SwaggerJsonToMarkdownSettings & {
	outputFileName: string;
	selectedOperation: string;
};

export default class SwaggerJsonToMarkdownPlugin extends Plugin {
	settings: SwaggerJsonToMarkdownSettings;

	async onload() {
		await this.loadSettings();

		this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
			if (!(file instanceof TFile) || file.extension.toLowerCase() !== "json") return;

			menu.addItem((item) => item
				.setTitle("Convert Swagger/OpenAPI to Markdown")
				.setIcon("file-output")
				.onClick(() => this.openConversionModal(file)));
		}));

		this.addCommand({
			id: "convert-active-json",
			name: "Convert active JSON to Swagger-style Markdown",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				const canRun = file instanceof TFile && file.extension.toLowerCase() === "json";

				if (!checking && canRun) {
					void this.openConversionModal(file);
				}

				return canRun;
			},
		});

		this.addSettingTab(new SwaggerJsonToMarkdownSettingTab(this.app, this));
	}

	async openConversionModal(file: TFile) {
		try {
			const source = await this.app.vault.read(file);
			const spec = parseOpenApiJson(source);
			new ConversionOptionsModal(this.app, this, file, spec).open();
		} catch (error) {
			showGenerationError(this.app, error);
		}
	}

	async convertFile(file: TFile, spec: unknown, request: ConversionRequest) {
		const options = toConversionOptions(request);
		const result = convertOpenApiToMarkdown(spec, options);
		const outputPath = await this.resolveOutputPath(file, request);

		await this.ensureFolderExists(getParentPath(outputPath));

		const existing = this.app.vault.getAbstractFileByPath(outputPath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, result.markdown);
		} else {
			await this.app.vault.create(outputPath, result.markdown);
		}

		this.settings = {
			...this.settings,
			mode: request.mode,
			tag: request.tag,
			operationId: request.operationId,
			method: request.method,
			path: request.path,
			useHeadings: request.useHeadings,
			headingOffset: request.headingOffset,
			outputFolder: request.outputFolder,
			overwriteExisting: request.overwriteExisting,
			openAfterCreate: request.openAfterCreate,
		};
		await this.saveSettings();

		const createdFile = this.app.vault.getAbstractFileByPath(outputPath);
		if (request.openAfterCreate && createdFile instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(createdFile);
		}

		const warningText = result.warnings.length ? ` (${result.warnings.length} warnings)` : "";
		new Notice(`Markdown generated: ${outputPath}${warningText}`, 9000);
		if (result.warnings.length) console.warn("Swagger JSON to Markdown warnings:", result.warnings);
	}

	private async resolveOutputPath(file: TFile, request: ConversionRequest): Promise<string> {
		const folder = normalizeFolder(request.outputFolder) || getParentPath(file.path);
		const baseName = sanitizeFileName(request.outputFileName.trim() || `${file.basename}.swagger.md`);
		const preferredPath = normalizePath([folder, ensureMarkdownExtension(baseName)].filter(Boolean).join("/"));

		if (request.overwriteExisting || !this.app.vault.getAbstractFileByPath(preferredPath)) {
			return preferredPath;
		}

		const extensionless = preferredPath.replace(/\.md$/i, "");
		for (let index = 2; index < 1000; index++) {
			const candidate = `${extensionless}-${index}.md`;
			if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
		}

		throw new Error("Could not find an available file name for the generated Markdown.");
	}

	private async ensureFolderExists(folderPath: string) {
		if (!folderPath || this.app.vault.getAbstractFileByPath(folderPath)) return;

		const parts = folderPath.split("/").filter(Boolean);
		let current = "";

		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<SwaggerJsonToMarkdownSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ConversionOptionsModal extends Modal {
	private readonly operations: OperationSummary[];
	private readonly tags: string[];
	private request: ConversionRequest;

	constructor(
		app: App,
		private readonly plugin: SwaggerJsonToMarkdownPlugin,
		private readonly file: TFile,
		private readonly spec: unknown,
	) {
		super(app);
		this.operations = listOperations(spec);
		this.tags = listTags(spec);
		this.request = {
			...plugin.settings,
			outputFileName: `${file.basename}.swagger.md`,
			selectedOperation: "",
		};
		this.applyLogicalRestrictions();
	}

	onOpen() {
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("swagger-json-modal");
		contentEl.createEl("h2", { text: "Convert Swagger/OpenAPI JSON" });
		contentEl.createEl("p", {
			text: this.file.path,
			cls: "swagger-json-source-path",
		});

		new Setting(contentEl)
			.setName("Mode")
			.setDesc("Full creates complete documentation; fragment creates a reusable block.")
			.addDropdown((dropdown) => dropdown
				.addOption("full", "Full")
				.addOption("fragment", "Fragment")
				.setValue(this.request.mode)
				.onChange((value) => {
					this.request.mode = value === "fragment" ? "fragment" : "full";
					this.applyLogicalRestrictions();
					this.render();
				}));

		new Setting(contentEl)
			.setName("Tag")
			.setDesc("Optional. Limit the output to one tag.")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "All");
				for (const tag of this.tags) dropdown.addOption(tag, tag);
				dropdown
					.setValue(this.request.tag ?? "")
					.onChange((value) => {
						this.request.tag = value || null;
						this.request.selectedOperation = "";
						this.request.operationId = null;
						this.request.method = null;
						this.request.path = null;
						this.applyLogicalRestrictions();
						this.render();
					});
				dropdown.selectEl.disabled = this.isFullMode();
			});

		new Setting(contentEl)
			.setName("Operation")
			.setDesc("Optional. Select one specific operation.")
			.addDropdown((dropdown) => {
				const availableOperations = this.getOperationsForCurrentTag();
				dropdown.addOption("", "All");
				for (const operation of availableOperations) dropdown.addOption(operationKey(operation), operation.label);
				dropdown
					.setValue(this.request.selectedOperation)
					.onChange((value) => {
						this.request.selectedOperation = value;
						const operation = availableOperations.find((item) => operationKey(item) === value);
						this.request.operationId = operation?.operationId ?? null;
						this.request.method = operation && !operation.operationId ? operation.method : null;
						this.request.path = operation && !operation.operationId ? operation.path : null;
						this.applyLogicalRestrictions();
						this.render();
					});
				dropdown.selectEl.disabled = this.isFullMode();
			});

		new Setting(contentEl)
			.setName("Manual operation ID")
			.setDesc("Optional. Takes priority when filled in.")
			.addText((text) => {
				text
					.setPlaceholder("addPet")
					.setValue(this.request.operationId ?? "")
					.onChange((value) => {
						this.request.operationId = value.trim() || null;
						if (this.request.operationId) {
							this.request.selectedOperation = "";
							this.request.method = null;
							this.request.path = null;
						}
					});
				text.inputEl.disabled = this.isFullMode();
			});

		new Setting(contentEl)
			.setName("Manual method and path")
			.setDesc("Optional. Use it for endpoints without operationId.")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Method");
				for (const method of this.getAvailableMethods()) dropdown.addOption(method, method);
				dropdown
					.setValue(this.request.method ?? "")
					.onChange((value) => {
						this.request.method = value || null;
						this.request.path = null;
						this.request.selectedOperation = "";
						if (this.request.method) this.request.operationId = null;
						this.applyLogicalRestrictions();
						this.render();
					});
				dropdown.selectEl.disabled = this.isFullMode() || Boolean(this.request.operationId);
			})
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Path");
				for (const path of this.getAvailablePaths()) dropdown.addOption(path, path);
				dropdown
					.setValue(this.request.path ?? "")
					.onChange((value) => {
						this.request.path = value || null;
						this.request.selectedOperation = "";
						if (this.request.path) this.request.operationId = null;
					});
				dropdown.selectEl.disabled = this.isFullMode() || !this.request.method || Boolean(this.request.operationId);
			});

		if (this.isFullMode()) {
			contentEl.createDiv({
				text: "Full mode generates the whole document; filters are automatically fixed to All.",
				cls: "swagger-json-restriction-note",
			});
		}

		if (!this.isFullMode() && this.request.method && !this.getAvailablePaths().length) {
			contentEl.createDiv({
				text: "No paths are available for the selected method with the current filters.",
				cls: "swagger-json-restriction-note",
			});
		}

		new Setting(contentEl)
			.setName("Markdown headings")
			.setDesc("Recommended for indexes and PDF bookmarks.")
			.addToggle((toggle) => toggle
				.setValue(this.request.useHeadings)
				.onChange((value) => {
					this.request.useHeadings = value;
				}));

		new Setting(contentEl)
			.setName("Fragment heading offset")
			.setDesc("Base heading level from 1 to 5.")
			.addSlider((slider) => slider
				.setLimits(1, 5, 1)
				.setValue(this.request.headingOffset)
				.onChange((value) => {
					this.request.headingOffset = value;
				}));

		new Setting(contentEl)
			.setName("Output folder")
			.setDesc("Empty = next to the JSON file.")
			.addText((text) => text
				.setPlaceholder(getParentPath(this.file.path) || "/")
				.setValue(this.request.outputFolder)
				.onChange((value) => {
					this.request.outputFolder = value.trim();
				}));

		new Setting(contentEl)
			.setName("Markdown file name")
			.addText((text) => text
				.setPlaceholder(`${this.file.basename}.swagger.md`)
				.setValue(this.request.outputFileName)
				.onChange((value) => {
					this.request.outputFileName = value;
				}));

		new Setting(contentEl)
			.setName("Overwrite if it exists")
			.addToggle((toggle) => toggle
				.setValue(this.request.overwriteExisting)
				.onChange((value) => {
					this.request.overwriteExisting = value;
				}));

		new Setting(contentEl)
			.setName("Open when finished")
			.addToggle((toggle) => toggle
				.setValue(this.request.openAfterCreate)
				.onChange((value) => {
					this.request.openAfterCreate = value;
				}));

		new Setting(contentEl)
			.addButton((button) => button
				.setButtonText("Convert")
				.setCta()
				.onClick(async () => {
					try {
						this.applyLogicalRestrictions();
						await this.plugin.convertFile(this.file, this.spec, this.request);
						this.close();
					} catch (error) {
						showGenerationError(this.app, error);
					}
				}))
			.addButton((button) => button
				.setButtonText("Cancel")
				.onClick(() => this.close()));
	}

	private applyLogicalRestrictions() {
		if (this.isFullMode()) {
			this.request.tag = null;
			this.request.selectedOperation = "";
			this.request.operationId = null;
			this.request.method = null;
			this.request.path = null;
			return;
		}

		if (this.request.headingOffset < 1) this.request.headingOffset = 2;

		const operationsForTag = this.getOperationsForCurrentTag();
		if (this.request.selectedOperation && !operationsForTag.some((operation) => operationKey(operation) === this.request.selectedOperation)) {
			this.request.selectedOperation = "";
			this.request.operationId = null;
		}

		const availableMethods = this.getAvailableMethods();
		if (this.request.method && !availableMethods.includes(this.request.method)) {
			this.request.method = null;
			this.request.path = null;
		}

		const availablePaths = this.getAvailablePaths();
		if (this.request.path && !availablePaths.includes(this.request.path)) {
			this.request.path = null;
		}
	}

	private isFullMode(): boolean {
		return this.request.mode === "full";
	}

	private getOperationsForCurrentTag(): OperationSummary[] {
		return this.operations.filter((operation) => this.operationMatchesCurrentTag(operation));
	}

	private getAvailableMethods(): string[] {
		const methods = this.getOperationsForCurrentTag()
			.map((operation) => operation.method);
		return [...new Set(methods)].sort(compareHttpMethods);
	}

	private getAvailablePaths(): string[] {
		if (!this.request.method) return [];

		const paths = this.getOperationsForCurrentTag()
			.filter((operation) => operation.method === this.request.method)
			.map((operation) => operation.path);

		return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
	}

	private operationMatchesCurrentTag(operation: OperationSummary): boolean {
		return !this.request.tag || operation.tags.includes(this.request.tag);
	}
}

class GenerationErrorModal extends Modal {
	constructor(app: App, private readonly error: unknown) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		const message = getErrorMessage(this.error);

		contentEl.empty();
		contentEl.addClass("swagger-json-error-modal");
		contentEl.createEl("h2", { text: "Markdown generation failed" });
		contentEl.createEl("p", {
			text: "The plugin could not generate the Markdown file. Review the details below and adjust the JSON document or selected filters.",
		});
		contentEl.createEl("pre", { text: message });

		new Setting(contentEl)
			.addButton((button) => button
				.setButtonText("Copy details")
				.onClick(() => {
					void navigator.clipboard.writeText(message);
					new Notice("Error details copied");
				}))
			.addButton((button) => button
				.setButtonText("Close")
				.setCta()
				.onClick(() => this.close()));
	}

	onClose() {
		this.contentEl.empty();
	}
}

function toConversionOptions(request: ConversionRequest): ConversionOptions {
	return {
		mode: request.mode,
		tag: request.tag,
		operationId: request.operationId,
		method: request.method,
		path: request.path,
		useHeadings: request.useHeadings,
		headingOffset: request.mode === "fragment" ? request.headingOffset : 0,
	};
}

function operationKey(operation: OperationSummary): string {
	return `${operation.method} ${operation.path} ${operation.operationId ?? ""}`;
}

function compareHttpMethods(left: string, right: string): number {
	const order = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
	return order.indexOf(left) - order.indexOf(right);
}

function normalizeFolder(path: string): string {
	return normalizePath(path.replace(/^\/+|\/+$/g, ""));
}

function getParentPath(path: string): string {
	const index = path.lastIndexOf("/");
	return index === -1 ? "" : path.slice(0, index);
}

function ensureMarkdownExtension(path: string): string {
	return path.toLowerCase().endsWith(".md") ? path : `${path}.md`;
}

function sanitizeFileName(fileName: string): string {
	return fileName.replace(/[\\:*?"<>|]/g, "-");
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function showGenerationError(app: App, error: unknown) {
	console.error("Swagger JSON to Markdown error:", error);
	new Notice("Markdown generation failed. Opened error details.", 8000);
	new GenerationErrorModal(app, error).open();
}

function getErrorMessage(error: unknown): string {
	if (error && typeof error === "object" && "details" in error) {
		const maybeDetails = (error as { details?: unknown }).details;
		if (typeof maybeDetails === "string" && maybeDetails.length) {
			return `${error instanceof Error ? error.message : "Error"}\n${maybeDetails}`;
		}
	}

	return error instanceof Error ? error.message : String(error);
}
