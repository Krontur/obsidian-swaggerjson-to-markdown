import { validateFilterCombination, validateOpenApiDocument } from "./converter/core/openapi-validator.mjs";
import { generateMarkdown } from "./converter/renderer/markdown-generator.mjs";
import { WarningCollector } from "./converter/shared/warnings.mjs";

export type OutputMode = "full" | "fragment";

export interface ConversionOptions {
	mode: OutputMode;
	tag: string | null;
	operationId: string | null;
	method: string | null;
	path: string | null;
	useHeadings: boolean;
	headingOffset: number;
}

export interface ConversionResult {
	markdown: string;
	warnings: string[];
}

export interface OperationSummary {
	label: string;
	method: string;
	path: string;
	operationId: string | null;
	tags: string[];
}

type WarningCollectorInstance = {
	items: string[];
	add(message: string): void;
	hasWarnings(): boolean;
	print(): void;
};

type WarningCollectorConstructor = new () => WarningCollectorInstance;
const createWarnings = WarningCollector as WarningCollectorConstructor;
const validateDocument = validateOpenApiDocument as (spec: unknown, warnings: WarningCollectorInstance) => void;
const validateFilters = validateFilterCombination as (options: ConversionOptions, warnings: WarningCollectorInstance) => void;
const renderMarkdown = generateMarkdown as (spec: unknown, options: ConversionOptions, warnings: WarningCollectorInstance) => string;

export function parseOpenApiJson(source: string): unknown {
	try {
		return JSON.parse(source);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON: ${message}`);
	}
}

export function convertOpenApiToMarkdown(spec: unknown, options: ConversionOptions): ConversionResult {
	const warnings = new createWarnings();
	validateDocument(spec, warnings);
	validateFilters(options, warnings);

	return {
		markdown: renderMarkdown(spec, options, warnings),
		warnings: [...warnings.items],
	};
}

export function listTags(spec: unknown): string[] {
	if (!isRecord(spec)) return [];

	const declaredTags = Array.isArray(spec.tags)
		? spec.tags
			.map((tag) => isRecord(tag) ? tag.name : null)
			.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
		: [];

	return [...new Set([...declaredTags, ...listOperations(spec).flatMap((operation) => operation.tags)])].sort((a, b) => a.localeCompare(b));
}

export function listOperations(spec: unknown): OperationSummary[] {
	if (!isRecord(spec) || !isRecord(spec.paths)) return [];

	const methods = ["get", "post", "put", "delete", "patch", "options", "head"];
	const operations: OperationSummary[] = [];

	for (const [path, pathItem] of Object.entries(spec.paths)) {
		if (!isRecord(pathItem)) continue;

		for (const method of methods) {
			const operation = pathItem[method];
			if (!isRecord(operation)) continue;

			const operationId = typeof operation.operationId === "string" ? operation.operationId : null;
			const tags = Array.isArray(operation.tags)
				? operation.tags.filter((tag): tag is string => typeof tag === "string")
				: [];
			const summary = typeof operation.summary === "string" ? operation.summary : null;
			const label = `${method.toUpperCase()} ${path}${operationId ? ` (${operationId})` : summary ? ` - ${summary}` : ""}`;

			operations.push({
				label,
				method: method.toUpperCase(),
				path,
				operationId,
				tags,
			});
		}
	}

	return operations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
