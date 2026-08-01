#!/usr/bin/env node
/**
 * Generates the bilingual site from a single source template.
 *
 *   template.html  ->  index.html      (Japanese, canonical /)
 *                  ->  en/index.html   (English,  canonical /en/)
 *
 * The template carries the Japanese copy inline plus a `translations`
 * object. For each locale we swap every [data-i18n] node's text, set the
 * document language, title, meta description, canonical and hreflang tags,
 * and rewrite the language switcher into plain links.
 *
 * Run: node build.js
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.fortyoneagency.com";
const ROOT = __dirname;
const TEMPLATE = path.join(ROOT, "template.html");

const LOCALES = {
  ja: { out: "index.html", href: `${ORIGIN}/`, prefix: "" },
  en: { out: path.join("en", "index.html"), href: `${ORIGIN}/en/`, prefix: "../" },
};

/** Pull the `translations` object out of the template's inline script. */
function readTranslations(html) {
  const start = html.indexOf("const translations = {");
  if (start === -1) throw new Error("translations object not found in template");
  let i = html.indexOf("{", start);
  let depth = 0;
  let end = i;
  for (; end < html.length; end++) {
    if (html[end] === "{") depth++;
    else if (html[end] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const literal = html.slice(i, end + 1);
  // The literal is plain JSON-ish JS; eval it in a bare context.
  return new Function(`return (${literal});`)();
}

/** Escape a replacement string for use in String.replace. */
function lit(s) {
  return s.replace(/\$/g, "$$$$");
}

/**
 * Replace the inner text of every element carrying data-i18n="<key>".
 * Values may contain HTML (e.g. <br />), which is intentional.
 */
function applyText(html, dict) {
  return html.replace(
    /(<([a-z0-9]+)\b[^>]*\bdata-i18n="([A-Za-z0-9]+)"[^>]*>)([\s\S]*?)(<\/\2\s*>)/g,
    (match, open, tag, key, _inner, close) => {
      if (!(key in dict)) return match;
      return open + lit(dict[key]) + close;
    }
  );
}

/** Replace attributes driven by data-i18n-attr / data-i18n-key. */
function applyAttrs(html, dict) {
  return html.replace(/<[a-z0-9]+\b[^>]*data-i18n-key="[A-Za-z0-9]+"[^>]*>/g, (tag) => {
    const attrName = (tag.match(/data-i18n-attr="([^"]+)"/) || [])[1];
    const key = (tag.match(/data-i18n-key="([^"]+)"/) || [])[1];
    if (!attrName || !key || !(key in dict)) return tag;
    const re = new RegExp(`(\\s${attrName}=")[^"]*(")`);
    return re.test(tag) ? tag.replace(re, `$1${lit(dict[key])}$2`) : tag;
  });
}

/** Strip the now-pointless i18n bookkeeping attributes. */
function stripI18nAttrs(html) {
  return html.replace(/\s+data-i18n(?:-attr|-key)?="[^"]*"/g, "");
}

/** Swap the JS language switcher for static links between the two pages. */
function buildSwitcher(locale) {
  const jaHref = locale === "ja" ? "#top" : "../";
  const enHref = locale === "en" ? "#top" : "en/";
  const cls = (active) => `language-button${active ? " is-active" : ""}`;
  const aria = locale === "ja" ? "言語切替" : "Language switcher";
  return `<div class="language-switch" role="group" aria-label="${aria}">
              <a class="${cls(locale === "ja")}" href="${jaHref}" hreflang="ja"${
    locale === "ja" ? ' aria-current="page"' : ""
  }>JA</a>
              <a class="${cls(locale === "en")}" href="${enHref}" hreflang="en"${
    locale === "en" ? ' aria-current="page"' : ""
  }>EN</a>
            </div>`;
}

function headTags(locale) {
  const alts = Object.entries(LOCALES)
    .map(([l, c]) => `    <link rel="alternate" hreflang="${l}" href="${c.href}" />`)
    .join("\n");
  return [
    `    <link rel="canonical" href="${LOCALES[locale].href}" />`,
    alts,
    `    <link rel="alternate" hreflang="x-default" href="${LOCALES.ja.href}" />`,
  ].join("\n");
}

function build(locale, template, translations) {
  const dict = translations[locale];
  const cfg = LOCALES[locale];
  let html = template;

  html = applyText(html, dict);
  html = applyAttrs(html, dict);

  // Language switcher -> static links (before stripping i18n attrs).
  html = html.replace(
    /<div\s+class="language-switch"[\s\S]*?<\/div>/,
    lit(buildSwitcher(locale))
  );

  html = stripI18nAttrs(html);

  // Document language.
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${locale}">`);

  // Title + description straight from the dictionary.
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${lit(dict.pageTitle)}</title>`);
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[\s\S]*?(")/,
    `$1${lit(dict.metaDescription)}$2`
  );

  // Canonical + hreflang, inserted right after the description meta.
  html = html.replace(
    /(<meta\s+name="description"[\s\S]*?\/>)/,
    `$1\n${headTags(locale)}`
  );

  // Asset paths are relative; /en/ needs to climb one level.
  // `data` covers the <object> that renders the logo.
  if (cfg.prefix) {
    html = html.replace(
      /(src|href|data)="(logos\/|logo\.svg)/g,
      `$1="${cfg.prefix}$2`
    );
  }

  // Drop the runtime i18n script entirely — copy is now static.
  html = html.replace(/\n\s*<script>[\s\S]*?<\/script>\s*(?=<\/body>)/, "\n  ");

  return html;
}

function main() {
  const template = fs.readFileSync(TEMPLATE, "utf8");
  const translations = readTranslations(template);

  for (const locale of Object.keys(LOCALES)) {
    const out = path.join(ROOT, LOCALES[locale].out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, build(locale, template, translations), "utf8");
    console.log(`  ${locale} -> ${path.relative(ROOT, out)}`);
  }
  console.log("done");
}

main();
