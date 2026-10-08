---
name: warranty-case
description: Analyses a construction warranty case, buyer's claim or lawsuit against a developer end to end — demands one by one, chronology, technical analysis per defect, expert report, money (claimed/confirmed/disputed/not proven), developer's risks, recourse against the general contractor and subcontractor, positions and next steps. Use when the user shares a claim, lawsuit or case file and asks "разбери дело", "проанализируй иск", "что предъявить подрядчику", "риски по делу".
argument-hint: "[case files: claim, lawsuit, expert report, acts, contracts]"
---

# Warranty case analysis / Анализ гарантийного дела

Materials: $ARGUMENTS

Reply in Russian unless the user writes otherwise. For full cases delegate to the `claims-analyst` agent; for the expert report use `/artel:expertise-audit`.

## The goal

Establish: what the claimant wants · what is technically proven · what is legally supported · which amounts are confirmed · the developer's risks · what to claim against the general contractor · what to claim against the direct subcontractor · which documents and actions are needed. **Nothing is invented.**

## Steps

1. **Demands** — each separately: content, amount, basis, documents, technical and legal ground.
2. **Chronology** of facts with dates and the document behind each.
3. **Technical part per defect:** exists? parameters · norm · proven? · cause · causal link · responsible party.
4. **Expert report** — not accepted automatically (method, instruments, calibration, norms, contradictions).
5. **Legal part per demand:** basis, obliged party, breach, evidence, amount, objections.
6. **Cross-check documents:** claim ↔ expert report ↔ acts/photos/contract/as-built docs; specialists' reports against each other; estimate ↔ actual defect. Name contradictions explicitly.
7. **Money:** ЗАЯВЛЕНО → ПОДТВЕРЖДЕНО → СПОРНО → НЕ ДОКАЗАНО → что нужно для проверки.
8. **Party chain** buyer → developer → general contractor → subcontractor: for each conclusion — who owes whom, who signed which contract, who did the work, who breached, who fixes, who pays, on what basis it is recovered further. The general contractor is not liable automatically just for being the general contractor.
9. **Recourse:** defect → cause → contractor's work → breach → remediation → cost → documents → demand → payment / set-off / court.

## Report (17 sections — shorten if the user asks for a brief)

1 Summary · 2 Demands · 3 Chronology · 4 Analysis of demands · 5 Technical analysis · 6 Expert report review · 7 Normative analysis · 8 Financial analysis · 9 Developer's risks · 10 Claims against the general contractor · 11 Claims against the subcontractor · 12 Main position · 13 Alternative position (with documentary support) · 14 Documents needed · 15 Actions needed · 16 Questions for the expert / court · 17 Overall assessment

## After a significant case

Suggest recording: new defect type, newly applicable norm, typical expert error, useful defence argument, decisive document, what the engineer should check next time, what to use for recourse.

Analysis support, not legal advice. Anonymise buyers' personal data before sharing outside the organisation.
