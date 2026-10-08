---
name: tdd
description: Test-driven workflow — write a failing test that describes the behaviour, make it pass with the simplest code, then clean up — and reproduce every bug with a test before fixing it. Use when adding a feature or fixing a bug in code, or when the user says "с тестами", "напиши тесты", "TDD", "test first".
argument-hint: "[feature or bug]"
---

# Test first / Сначала тест

Goal: $ARGUMENTS

Reply in the user's language.

1. **Find the test setup.** Look for the existing framework and the command that runs it. If there is none, add the standard one for the stack (pytest, vitest, go test, cargo test) and one command to run everything.
2. **Red.** Write the smallest test that describes the wanted behaviour (or reproduces the bug). Run it. It must fail, and for the right reason — show the failure.
3. **Green.** Write the simplest code that makes it pass. Run the whole suite.
4. **Refactor.** Clean names and duplication with the tests still green.
5. **Edges.** Add tests for empty input, limits, wrong types, Cyrillic/unicode text, time zones, and failure of external services (mocked).
6. **Report** the exact command and its output. Never claim green without running it.

For larger work, delegate steps 1–2 and 5 to the `test-engineer` agent.
