import sanitizeHtml from "sanitize-html";
import { escapeHtml, escapeHtmlAttribute } from "./html-renderer.mjs";

const ALLOWED_TAGS = [
  "p",
  "br",
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

    disallowedTagsMode: "escape",

    transformTags: {
      a: transformLinkTag,
      tt: "code",
      b: "strong",
      i: "em",

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
