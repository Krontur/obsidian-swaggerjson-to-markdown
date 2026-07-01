import sanitizeHtml from "sanitize-html";
import { escapeHtml, escapeHtmlAttribute } from "./html-renderer.mjs";

const ALLOWED_TAGS = [
  "p",
  "div",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "code",
  "tt",
  "pre",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span"
];

const ALLOWED_ATTRIBUTES = {
  a: ["href", "title"],
  div: ["class"],
  table: ["class"],
  th: ["colspan", "rowspan"],
  td: ["colspan", "rowspan"],
  span: ["class"],
  code: ["class"],
  pre: ["class"]
};

export function renderDescriptionBlock(className, value) {
  const content = renderRichText(value);

  if (!content) {
    return "";
  }

  return `<div class="${escapeHtmlAttribute(className)} api-rich-text">\n${content}\n</div>`;
}

export function renderRichText(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const text = String(value);

  if (!looksLikeHtml(text)) {
    return escapeHtml(text);
  }

  return sanitizeHtmlDescription(text);
}

export function hasComplexHtml(value) {
  const text = String(value ?? "");

  return (
    /<table[\s\S]*?>/i.test(text) ||
    /<(ul|ol|li|br|p|tt|code|pre|b|strong|i|em|span)[\s\S]*?>/i.test(text)
  );
}

export function getPlainDescriptionForTable(value) {
  if (value === null || value === undefined || value === "") {
    return "none";
  }

  const raw = String(value);

  const beforeFirstTable = raw.split(/<table[\s\S]*?>/i)[0];
  const plain = stripHtml(beforeFirstTable || raw);

  if (!plain) {
    return "See details below.";
  }

  return plain;
}

export function extractDescriptionTables(value) {
  if (value === null || value === undefined || value === "") {
    return {
      inlineDescription: "none",
      tables: []
    };
  }

  const raw = String(value);
  const htmlTables = [];
  const withoutHtmlTables = raw.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
    const markdownTable = convertHtmlTableToMarkdown(tableHtml);
    const extractedTable = markdownTable || sanitizeHtmlDescription(tableHtml);

    if (extractedTable) {
      htmlTables.push(extractedTable);
    }

    return "\n";
  });
  const markdownExtraction = extractMarkdownTables(withoutHtmlTables);
  const tables = [...htmlTables, ...markdownExtraction.tables];

  if (!tables.length) {
    return {
      inlineDescription: value,
      tables
    };
  }

  const plain = stripHtml(markdownExtraction.text);
  const inlineDescription = plain
    ? `${ensureSentence(plain)} See table below.`
    : "See table below.";

  return {
    inlineDescription,
    tables
  };
}

export function stripHtml(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<table[\s\S]*?<\/table>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<\/li>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value ?? ""));
}

function sanitizeHtmlDescription(value) {
  const preCleaned = preCleanHtml(value);

  const sanitized = sanitizeHtml(preCleaned, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,

    allowedSchemes: ["http", "https", "mailto"],

    disallowedTagsMode: "discard",

    transformTags: {
      a: transformLinkTag,
      tt: "code",
      b: "strong",
      i: "em",
      h1: transformHeadingTag(1),
      h2: transformHeadingTag(2),
      h3: transformHeadingTag(3),
      h4: transformHeadingTag(4),
      h5: transformHeadingTag(5),
      h6: transformHeadingTag(6),

      table: sanitizeHtml.simpleTransform("table", {
        class: "api-table api-description-table"
      }),

      th: transformTableCellTag("th"),
      td: transformTableCellTag("td")
    },

    parser: {
      lowerCaseTags: true
    }
  });

  return postCleanHtml(sanitized).trim();
}

function preCleanHtml(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")

    // Remove full HTML document wrappers if someone pasted generated HTML.
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?head[^>]*>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")

    // Remove dangerous blocks before sanitizing.
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")

    // OpenAPI descriptions often use comments for visual spacing between cells.
    // Remove complete comments first, then discard orphan comment delimiters.
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!--/g, "")
    .replace(/-->/g, "")

    // Normalize old HTML tags.
    .replace(/<tt(\s[^>]*)?>/gi, "<code>")
    .replace(/<\/tt>/gi, "</code>")
    .replace(/<b(\s[^>]*)?>/gi, "<strong>")
    .replace(/<\/b>/gi, "</strong>")
    .replace(/<i(\s[^>]*)?>/gi, "<em>")
    .replace(/<\/i>/gi, "</em>")

    // Normalize self-closing tags that Obsidian sometimes renders inconsistently.
    .replace(/<p\s*\/>/gi, "<p></p>")
    .replace(/<br\s*\/?>/gi, "<br>");
}

function postCleanHtml(value) {
  return String(value ?? "")
    // Avoid empty paragraphs creating strange PDF spacing.
    .replace(/<p>\s*<\/p>/gi, "<br>")

    // Avoid too many line breaks.
    .replace(/(<br>\s*){3,}/gi, "<br><br>")

    // sanitize-html may preserve classes; force our table class again just in case.
    .replace(/<table(?:\s+class="[^"]*")?>/gi, '<table class="api-table api-description-table">');
}

function transformTableCellTag(tagName) {
  return (tagNameFromParser, attribs) => {
    const cleanAttributes = {};

    const colspan = extractSafeNumberAttribute(attribs, "colspan");
    const rowspan = extractSafeNumberAttribute(attribs, "rowspan");

    if (colspan) {
      cleanAttributes.colspan = colspan;
    }

    if (rowspan) {
      cleanAttributes.rowspan = rowspan;
    }

    return {
      tagName,
      attribs: cleanAttributes
    };
  };
}

function transformHeadingTag(level) {
  return sanitizeHtml.simpleTransform("div", {
    class: `api-rich-heading api-rich-heading-${level}`
  });
}

function extractSafeNumberAttribute(attribs, name) {
  const rawValue = attribs?.[name];

  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > 20) {
    return null;
  }

  return String(value);
}

function transformLinkTag(tagNameFromParser, attribs) {
  const href = attribs?.href;
  const cleanAttributes = {};

  if (href && /^(https?:|mailto:)/i.test(href)) {
    cleanAttributes.href = href;
  }

  if (attribs?.title) {
    cleanAttributes.title = attribs.title;
  }

  return {
    tagName: "a",
    attribs: cleanAttributes
  };
}

function convertHtmlTableToMarkdown(value) {
  const rows = Array.from(String(value ?? "").matchAll(/<tr\b[\s\S]*?<\/tr>/gi), ([rowHtml]) => {
    const cells = Array.from(rowHtml.matchAll(/<(th|td)\b[\s\S]*?>([\s\S]*?)<\/\1>/gi), (match) => ({
      tagName: match[1].toLowerCase(),
      text: normalizeMarkdownTableCell(match[2])
    }));

    return cells;
  }).filter((row) => row.length);

  if (!rows.length) {
    return "";
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const header = padMarkdownTableRow(rows[0].map((cell) => cell.text), columnCount);
  const bodyRows = rows.slice(1).map((row) => padMarkdownTableRow(row.map((cell) => cell.text), columnCount));

  if (!header.some(Boolean)) {
    return "";
  }

  const separator = header.map((unused, index) => isNumericMarkdownColumn(bodyRows, index) ? "---:" : "---");
  return renderMarkdownTableRows([header, separator, ...bodyRows]);
}

function extractMarkdownTables(value) {
  const lines = String(value ?? "").replace(/\r\n/g, "\n").split("\n");
  const textLines = [];
  const tables = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!isMarkdownTableStart(lines, index)) {
      textLines.push(lines[index]);
      continue;
    }

    const tableLines = [lines[index], lines[index + 1]];
    index += 2;

    while (index < lines.length && isMarkdownTableRow(lines[index])) {
      tableLines.push(lines[index]);
      index += 1;
    }

    index -= 1;

    const normalizedTable = normalizeMarkdownTable(tableLines);

    if (normalizedTable) {
      tables.push(normalizedTable);
    }

    textLines.push("");
  }

  return {
    text: textLines.join("\n"),
    tables
  };
}

function normalizeMarkdownTable(lines) {
  const rows = lines.map(parseMarkdownTableRow).filter((row) => row.length);

  if (rows.length < 2) {
    return "";
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const header = padMarkdownTableRow(rows[0], columnCount);
  const separator = padMarkdownTableRow(rows[1], columnCount).map((cell) => normalizeMarkdownSeparatorCell(cell));
  const bodyRows = rows.slice(2).map((row) => padMarkdownTableRow(row, columnCount));

  return renderMarkdownTableRows([header, separator, ...bodyRows]);
}

function renderMarkdownTableRows(rows) {
  return rows
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

function parseMarkdownTableRow(line) {
  return String(line ?? "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(normalizeMarkdownTableCell);
}

function padMarkdownTableRow(row, columnCount) {
  const padded = [...row];

  while (padded.length < columnCount) {
    padded.push("");
  }

  return padded.slice(0, columnCount);
}

function normalizeMarkdownTableCell(value) {
  return stripHtml(value)
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMarkdownSeparatorCell(value) {
  const cell = String(value ?? "").trim();

  if (/^:-+:$/.test(cell)) {
    return ":---:";
  }

  if (/^-+:$/.test(cell)) {
    return "---:";
  }

  if (/^:-+$/.test(cell)) {
    return ":---";
  }

  return "---";
}

function isMarkdownTableStart(lines, index) {
  return (
    isMarkdownTableRow(lines[index]) &&
    index + 1 < lines.length &&
    isMarkdownTableSeparator(lines[index + 1])
  );
}

function isMarkdownTableRow(line) {
  return /\|/.test(String(line ?? "")) && String(line ?? "").trim() !== "";
}

function isMarkdownTableSeparator(line) {
  const cells = parseMarkdownTableRow(line);

  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isNumericMarkdownColumn(rows, index) {
  const values = rows
    .map((row) => row[index])
    .filter((cell) => cell !== undefined && cell !== "");

  return values.length > 0 && values.every((cell) => /^-?\d+(?:\.\d+)?$/.test(cell));
}

function ensureSentence(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  return /[.!?]$/.test(text) ? text : `${text}.`;
}
