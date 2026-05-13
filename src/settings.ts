import { App, PluginSettingTab, Setting } from "obsidian";
import SwaggerJsonToMarkdownPlugin from "./main";
import { ConversionOptions } from "./converter-api";

export interface SwaggerJsonToMarkdownSettings extends ConversionOptions {
	outputFolder: string;
	overwriteExisting: boolean;
	openAfterCreate: boolean;
}

export const DEFAULT_SETTINGS: SwaggerJsonToMarkdownSettings = {
	mode: "full",
	tag: null,
	operationId: null,
	method: null,
	path: null,
	useHeadings: true,
	headingOffset: 2,
	outputFolder: "",
	overwriteExisting: false,
	openAfterCreate: true,
};

export class SwaggerJsonToMarkdownSettingTab extends PluginSettingTab {
	plugin: SwaggerJsonToMarkdownPlugin;

	constructor(app: App, plugin: SwaggerJsonToMarkdownPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Conversion defaults")
			.setHeading();

		new Setting(containerEl)
			.setName("Default output folder")
			.setDesc("Leave empty to create the Markdown file next to the JSON file.")
			.addText((text) => text
				.setPlaceholder("docs/generated")
				.setValue(this.plugin.settings.outputFolder)
				.onChange(async (value) => {
					this.plugin.settings.outputFolder = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Overwrite existing files")
			.setDesc("When disabled, the plugin creates numbered file names.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.overwriteExisting)
				.onChange(async (value) => {
					this.plugin.settings.overwriteExisting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Open generated Markdown")
			.setDesc("Automatically opens the resulting note after conversion.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.openAfterCreate)
				.onChange(async (value) => {
					this.plugin.settings.openAfterCreate = value;
					await this.plugin.saveSettings();
				}));
	}
}
