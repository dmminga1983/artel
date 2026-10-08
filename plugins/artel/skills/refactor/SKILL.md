---
name: refactor
description: Safely restructures code without changing behaviour — tests first, small steps, one kind of change at a time. Use when code is messy, duplicated or hard to change, or the user says "refactor", "clean up", "отрефактори", "приведи код в порядок".
argument-hint: "[file, module or goal]"
---

# Refactor / Рефакторинг

Target: $ARGUMENTS

Reply in the user's language. For anything larger than one file, delegate to the `refactorer` agent.

1. **State the goal** in one line (e.g. "make adding a payment provider a one-file change").
2. **Pin behaviour.** Run the existing tests. If coverage is thin, add characterisation tests for the code you will touch.
3. **Plan small steps** — rename, extract, inline, move, delete dead code. Each step must leave the build green.
4. **Execute step by step,** running tests after each. Commit-sized steps make review easy.
5. **Do not mix in fixes or features.** Note bugs you find and report them separately.
6. **Finish** with the test results and a short before/after summary (files, functions, lines, complexity if a tool is available).
