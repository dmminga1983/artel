---
name: research
description: Researches a question across the web and given documents and returns a sourced answer — bottom line first, each claim linked to a primary source, disagreements shown, unknowns marked. Use for comparisons, market or price checks, legal/norm look-ups, vendor or tool choice, or when the user says "найди", "сравни", "исследуй", "что лучше", "research".
argument-hint: "[question]"
---

# Research with sources / Исследование с источниками

Question: $ARGUMENTS

Reply in the user's language.

1. Restate the question and the decision it serves. Note today's date — prices, versions, rankings and laws change.
2. Break it into 2–5 sub-questions. Run independent searches in parallel.
3. Prefer **primary sources**: official docs, the text of the law or standard, vendor pricing pages, original data. Use articles to find leads, then confirm in the primary source.
4. Every reference to a norm or law article (ГОСТ, СП, СНиП, ФЗ, ГК, ГПК) must be opened and the exact clause checked — do not rely on a quote from a third party.
5. Write: **answer** (2–5 sentences) → **details** per sub-question with inline links → **caveats** (uncertain, outdated, region-specific) → **Sources** list `[Title](URL)`.
6. Label claims you could not verify. Never invent sources, numbers or quotes.

For deep, multi-source research delegate to the `researcher` agent; for several independent sub-questions run several `researcher` agents in parallel and merge.
