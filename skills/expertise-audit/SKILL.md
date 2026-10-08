---
name: expertise-audit
description: Reviews a construction-technical expert report (строительно-техническая экспертиза, СТЭ, заключение эксперта или специалиста) along the full evidence chain — questions, object, method, instruments, norms, calculations, causation, contractor link, cost — and rates every conclusion. Use when the user uploads an expert report or a review of one and asks "проверь экспертизу", "рецензия на заключение", "можно ли оспорить", "вопросы эксперту".
argument-hint: "[expert report file, questions to the expert]"
---

# Expert report audit / Аудит строительно-технической экспертизы

Materials: $ARGUMENTS

Reply in Russian unless the user writes otherwise. Delegate long reports to the `claims-analyst` agent. Read the whole report, including annexes, photos and measurement protocols.

**Do not retell the report — test whether each conclusion is connected to evidence.**

## Evidence chain — check every link

вопрос → объект → данные → метод → измерение → расчёт → норма → вывод → причина → нарушение → исполнитель → стоимость

The full checklist is in [checklist.md](checklist.md); known normative traps are in [norm-traps.md](norm-traps.md).

## Key rules

- Compare the expert's answer with the court's question **word for word**: did the expert widen the subject (extra parameters, extra time of day, extra rooms)? If so, is there a stated basis (e.g. ч. 2 ст. 86 ГПК РФ)?
- A defect ≠ a violation ≠ a cause. Each transition needs its own proof.
- An expert's phrase is not proof. What is it based on?
- A norm number is not enough: check applicability, edition, period of validity, and the exact clause text.
- Every reference to a norm in **third-party reviews and objections** (lawyers, engineers, other AI tools) is checked against the primary text — invented and swapped clause references are common.
- Several possible causes → state which are proven, which excluded, which remain possible. Do not pick the convenient one.
- Missing data → what is known → what is unknown → which evidence is needed → can we conclude now → risk of concluding early.

## Output

1. Formal check.
2. Table of conclusions: conclusion · what it rests on · weak points · status.
   Statuses: **ПОДТВЕРЖДЕН · СПОРЕН · НЕ ДОКАЗАН · ПРОТИВОРЕЧИТ ДАННЫМ · ТРЕБУЕТ ДОПОЛНИТЕЛЬНОГО ИССЛЕДОВАНИЯ**.
3. Cause of defects and alternative causes.
4. Link to a specific contractor / stage of work.
5. Volume and cost of remediation.
6. Internal contradictions and contradictions with other case materials.
7. Overall rating: **обосновано / спорно / не обосновано-уязвимо**.
8. Recommendation: accept / dispute / additional questions / motion for a new or additional examination.
9. Concrete questions to the expert in court.

This is professional analysis support, not a legal opinion; the user decides. Anonymise personal data of buyers before sharing outside the organisation.
