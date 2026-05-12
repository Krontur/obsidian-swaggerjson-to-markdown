export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeHtmlAttribute(value) {
  return escapeHtml(value)
    .replaceAll("'", "&#39;");
}

export function renderContentType(label, contentType) {
  return `<div class="api-content-type">${escapeHtml(label)}: <code>${escapeHtml(contentType)}</code></div>`;
}

export function renderExampleBlock(title, exampleText, language = "json") {
  const out = [];
  const safeLanguage = sanitizeFenceLanguage(language);
  const text = String(exampleText ?? "");
  const fence = getMarkdownFence(text);

  if (title) {
    out.push(`<div class="api-example-title">${escapeHtml(title)}</div>`);
    out.push("");
  }

  out.push(`${fence}${safeLanguage}`);
  out.push(text);
  out.push(fence);

  return out.join("\n");
}

function sanitizeFenceLanguage(value) {
  return String(value ?? "")
    .replace(/[^a-z0-9_-]/gi, "")
    .toLowerCase();
}

function getMarkdownFence(value) {
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(String(value ?? "").matchAll(/`+/g), (match) => match[0].length)
  );

  return "`".repeat(Math.max(3, longestBacktickRun + 1));
}

/**
 * Renders an HTML table.
 *
 * Important:
 * - Headers are escaped.
 * - Rows are assumed to contain already-safe HTML cells.
 *   This allows cells like <code>name</code>, <strong>required</strong>, etc.
 */
export function renderTable(headers, rows, className) {
  const out = [];

  out.push(`<table class="${escapeHtmlAttribute(className)}">`);
  out.push(`  <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`);
  out.push(`  <tbody>`);

  for (const row of rows) {
    out.push(`    <tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`);
  }

  out.push(`  </tbody>`);
  out.push(`</table>`);

  return out.join("\n");
}

export function renderSemanticHeading(context, semantic, text, fallbackClassName) {
  if (!context.options.useHeadings) {
    return `\n<div class="${escapeHtmlAttribute(fallbackClassName)}">${escapeHtml(sanitizeHeadingText(text))}</div>\n`;
  }

  const level = getSemanticHeadingLevel(context, semantic);
  return renderMarkdownHeading(level, text);
}

export function renderMarkdownHeading(level, text) {
  const safeLevel = Math.max(1, Math.min(6, Number(level) || 1));
  return `\n${"#".repeat(safeLevel)} ${sanitizeHeadingText(text)}\n`;
}

export function sanitizeHeadingText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSemanticHeadingLevel(context, semantic) {
  const mode = context.options.mode ?? "full";

  if (mode === "full") {
    const fullLevels = {
      document: 1,
      mainSection: 2,
      tag: 2,
      operation: 3,
      section: 4,
      subsection: 5,
      schema: 3
    };

    return fullLevels[semantic] ?? 3;
  }

  const base = context.options.headingOffset ?? 2;

  const fragmentOffsets = {
    tag: 0,
    operation: 1,
    section: 2,
    subsection: 3,
    schema: 1,
    mainSection: 0
  };

  return Math.max(1, Math.min(6, base + (fragmentOffsets[semantic] ?? 0)));
}
