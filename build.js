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

/**
 * Each page is one template rendered once per locale. `dir` is the path
 * segment appended after the locale root, `prefix` climbs back to the site
 * root for relative assets.
 */
const PAGES = [
  { template: "template.html", dir: "" },
  { template: "privacy.template.html", dir: "privacy/" },
];

const LOCALES = {
  ja: { root: "", href: `${ORIGIN}/` },
  en: { root: "en/", href: `${ORIGIN}/en/` },
};

/** Output path + canonical URL + asset prefix for one page in one locale. */
function target(page, locale) {
  const rel = LOCALES[locale].root + page.dir;
  const depth = rel.split("/").filter(Boolean).length;
  const pageDepth = page.dir.split("/").filter(Boolean).length;
  return {
    out: path.join(ROOT, rel, "index.html"),
    href: `${ORIGIN}/${rel}`,
    prefix: "../".repeat(depth),
    // Home in this locale, relative to the current page.
    home: pageDepth ? "../".repeat(pageDepth) : "./",
  };
}

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

/** Swap the JS language switcher for static links to this page's counterpart. */
function buildSwitcher(page, locale) {
  const href = (l) =>
    l === locale ? "#top" : `${ORIGIN}/${LOCALES[l].root}${page.dir}`;
  const cls = (active) => `language-button${active ? " is-active" : ""}`;
  const aria = locale === "ja" ? "言語切替" : "Language switcher";
  const link = (l, label) =>
    `<a class="${cls(l === locale)}" href="${href(l)}" hreflang="${l}"${
      l === locale ? ' aria-current="page"' : ""
    }>${label}</a>`;
  return `<div class="language-switch" role="group" aria-label="${aria}">
              ${link("ja", "JA")}
              ${link("en", "EN")}
            </div>`;
}

function headTags(page, locale) {
  const url = (l) => `${ORIGIN}/${LOCALES[l].root}${page.dir}`;
  const alts = Object.keys(LOCALES)
    .map((l) => `    <link rel="alternate" hreflang="${l}" href="${url(l)}" />`)
    .join("\n");
  return [
    `    <link rel="canonical" href="${url(locale)}" />`,
    alts,
    `    <link rel="alternate" hreflang="x-default" href="${url("ja")}" />`,
  ].join("\n");
}

function build(page, locale, template, translations, tgt) {
  const dict = translations[locale];
  let html = template;

  html = applyText(html, dict);
  // {{year}} is stamped at build time so the copyright never goes stale.
  html = html.replace(/\{\{year\}\}/g, String(new Date().getFullYear()));
  html = applyAttrs(html, dict);

  // Language switcher -> static links (before stripping i18n attrs).
  html = html.replace(
    /<div\s+class="language-switch"[\s\S]*?<\/div>/,
    lit(buildSwitcher(page, locale))
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
    `$1\n${headTags(page, locale)}`
  );

  // Relative assets climb back to the site root.
  // `data` covers the <object> that renders the logo.
  if (tgt.prefix) {
    html = html.replace(
      /(src|href|data)="(logos\/|logo\.svg)/g,
      `$1="${tgt.prefix}$2`
    );
  }

  // Same-page anchors only resolve on the home page; elsewhere point home.
  if (page.dir) {
    html = html.replace(/href="#(services|cases|company|top)"/g, `href="${tgt.home}#$1"`);
    // The active language control should remain an on-page link.
    html = html.replace(
      /(<a class="language-button is-active") href="[^"]+#top"/,
      '$1 href="#top"'
    );
  }

  // Drop the runtime i18n script entirely — copy is now static.
  html = html.replace(/\n\s*<script>[\s\S]*?<\/script>\s*(?=<\/body>)/, "\n  ");

  return html;
}

function main() {
  // The home template owns the shared translations dictionary.
  const home = fs.readFileSync(path.join(ROOT, PAGES[0].template), "utf8");
  const translations = readTranslations(home);

  for (const page of PAGES) {
    const template = fs.readFileSync(path.join(ROOT, page.template), "utf8");
    const dicts = page.dir ? readTranslations(template) : translations;
    for (const locale of Object.keys(LOCALES)) {
      const tgt = target(page, locale);
      fs.mkdirSync(path.dirname(tgt.out), { recursive: true });
      fs.writeFileSync(
        tgt.out,
        build(page, locale, template, dicts, tgt),
        "utf8"
      );
      console.log(`  ${locale} ${page.dir || "/"} -> ${path.relative(ROOT, tgt.out)}`);
    }
  }
  console.log("done");
}

main();
