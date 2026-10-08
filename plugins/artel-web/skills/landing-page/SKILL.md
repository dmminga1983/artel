---
name: landing-page
description: Builds a one-page website or landing page from a short brief — structure, copy, responsive HTML/CSS, SEO tags, contact form or messenger button — plus a free hosting guide. Use when the user wants a site for a service, product, portfolio or event, or says "сделай сайт", "лендинг", "страницу для услуги", "landing page".
argument-hint: "[what the site is for]"
---

# Landing page / Лендинг

Brief: $ARGUMENTS

Reply in the user's language; write site copy in the audience's language.

## 1. Brief (ask only what is missing)

Who visits · the **one** action they should take · offer and price · proof (photos, examples, reviews the user really has) · contacts · city/region · deadline.

## 2. Structure

1. Hero: what you get + for whom + one button.
2. Problem → solution (3 points).
3. How it works (3–4 steps).
4. Examples / portfolio.
5. Prices or "from …".
6. FAQ (5 real objections).
7. Contact block + the same button.

Never write fake testimonials or invented numbers. Leave clear placeholders like `[ВАШ ТЕЛЕФОН]` where real data is missing.

## 3. Build

Delegate to the `web-builder` agent. Defaults: one `index.html` + `styles.css`, mobile first, semantic HTML, accessible contrast and labels, `<title>`, meta description, Open Graph, `lang`, favicon, compressed images with sizes. Contact via a `tel:` / `mailto:` link or a Telegram/WhatsApp link — no back-end needed. A form needs a back-end or a form service; never put API keys in the page.

## 4. Check and ship

Run `/artel-web:seo-audit` on the result, preview at 360 px and desktop, then give hosting steps (GitHub Pages / Netlify / the user's hosting) and a list of placeholders to replace.
