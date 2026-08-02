# fortyone-agency.github.io

Static bilingual site for Fortyone Agency LLC.

## Editing content

**Edit `template.html`, never `index.html` or `en/index.html`** — those two are
generated and any manual change to them is overwritten on the next build.

`template.html` holds the Japanese copy inline (so it is readable on its own)
plus a `translations` object near the bottom with both locales. To change copy:

1. Update the string in the `translations` object (`ja` and `en`).
2. Update the matching inline Japanese text in the markup, so the template
   stays readable and the two never drift.
3. Run the build.

```sh
node build.js
```

That regenerates:

| Output                  | Locale   | Canonical URL                                |
| ----------------------- | -------- | -------------------------------------------- |
| `index.html`            | Japanese | `https://www.fortyoneagency.com/`            |
| `en/index.html`         | English  | `https://www.fortyoneagency.com/en/`         |
| `privacy/index.html`    | Japanese | `https://www.fortyoneagency.com/privacy/`    |
| `en/privacy/index.html` | English  | `https://www.fortyoneagency.com/en/privacy/` |

## Pages

`PAGES` in `build.js` lists the templates; each is rendered once per locale.
`template.html` is the home page and owns the shared translations dictionary
and the stylesheet. `privacy.template.html` is the privacy policy and carries
its own dictionary.

**The stylesheet lives in `template.html`.** If you change it, copy the
`<style>` block into `privacy.template.html` too — they are kept in sync by
hand.

Adding `sitemap.xml` entries for new pages is also manual.

## Placeholders

`{{year}}` is replaced with the current year at build time — used for the
footer copyright, so it never needs a manual yearly edit. Note the year is
stamped when you run the build, not when a visitor loads the page: rebuild and
redeploy at least once a year (any content change does it) to keep it current.

The privacy policy's "last updated" date is deliberately hardcoded — it records
when the policy actually changed and must not track the clock.

## Why two files

A single page that swapped languages with JavaScript could only ever be indexed
once, so the English copy was invisible to search engines. Splitting gives each
language its own URL, `<html lang>`, title, meta description, canonical, and
`hreflang` tags — and the generated pages need no JavaScript to render their
text.

## What the build does

For each locale it substitutes every `[data-i18n]` value, rewrites the
`data-i18n-attr` / `data-i18n-key` attributes, swaps the language switcher for
plain links between the two pages, strips the runtime i18n script, and fixes
relative asset paths for `/en/`.

## Other files

- `logo.svg`, `logos/` — brand mark and client logos (vectorised; no live fonts)
- `sitemap.xml`, `robots.txt` — reference the two canonical URLs
