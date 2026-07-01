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

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head"] as const;

type WarningCollectorInstance = {
	items: string[];
	add(message: string): void;
	hasWarnings(): boolean;
	print(): void;
};

type WarningCollectorConstructor = new () => WarningCollectorInstance;
const createWarnings = WarningCollector as unknown as WarningCollectorConstructor;
const validateDocument = validateOpenApiDocument as unknown as (spec: unknown, warnings: WarningCollectorInstance) => void;
const validateFilters = validateFilterCombination as unknown as (options: ConversionOptions, warnings: WarningCollectorInstance) => void;
const renderMarkdown = generateMarkdown as unknown as (spec: unknown, options: ConversionOptions, warnings: WarningCollectorInstance) => string;

export function parseOpenApiJson(source: string): unknown {
	try {
		return JSON.parse(source) as unknown;
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

	const tags = new Set<string>();
	const declaredTags = spec.tags;

	if (isUnknownArray(declaredTags)) {
		for (const tag of declaredTags) {
			if (!isRecord(tag) || typeof tag.name !== "string" || tag.name.length === 0) {
				continue;
			}

			tags.add(tag.name);
		}
	}

	for (const operation of listOperations(spec)) {
		for (const tag of operation.tags) {
			tags.add(tag);
		}
	}

	return Array.from(tags).sort(compareStrings);
}

export function listOperations(spec: unknown): OperationSummary[] {
	if (!isRecord(spec)) return [];

	const paths = spec.paths;

	if (!isRecord(paths)) return [];

	const operations: OperationSummary[] = [];
	const pathEntries: Array<[string, unknown]> = Object.entries(paths);

	for (const [path, pathItem] of pathEntries) {
		if (!isRecord(pathItem)) continue;

		for (const method of HTTP_METHODS) {
			const operation = pathItem[method];
			if (!isRecord(operation)) continue;

			const operationId = typeof operation.operationId === "string" ? operation.operationId : null;
			const tags = isUnknownArray(operation.tags)
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

function compareStrings(left: string, right: string): number {
	return left.localeCompare(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !isUnknownArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}
