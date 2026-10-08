---
name: verify-done
description: Verifies that finished work actually meets the request before reporting it as done — runs tests and programs, opens files, recomputes numbers, checks facts against sources — ideally via the independent verifier agent. Use before saying a task is complete, or when the user asks "проверь", "точно работает?", "verify", "double-check".
argument-hint: "[what to verify]"
---

# Verify before done / Проверь перед сдачей

Target: $ARGUMENTS

Reply in the user's language.

## Steps

1. Write down the original request and its definition of done. Turn it into a checklist.
2. For important work, **delegate to the `verifier` agent** so the work is not graded by the one who made it. Give it the request and the checklist, not your opinion of the result.
3. Evidence per item — pick what fits:
   - **Code:** run the test suite, the build, and the program on a real input. Capture the command and output.
   - **Website:** open it at desktop and phone width; check links, forms, title, console errors.
   - **Document:** open the actual file; check headings, tables, numbers, names, dates, spelling.
   - **Numbers:** recompute with code.
   - **Facts:** open each cited source; confirm it says what we claim.
   - **Deployed/installed things:** confirm the new version is the one actually running (not a stale process, cache or old file).
4. Look for collateral damage: unrelated changes, leftover debug output, secrets, broken formatting.
5. Report honestly: what passed (with evidence), what failed, what could not be checked. Do not call it done while something on the checklist fails.
