---
name: debug
description: Systematic debugging — reproduce, collect evidence, test hypotheses one by one, fix the root cause, prove the fix, and confirm the fixed version is what actually runs. Use when something errors, crashes, returns wrong results or "stopped working", or the user says "не работает", "ошибка", "сломалось", "debug this".
argument-hint: "[error message or symptom]"
---

# Debug / Найти причину

Symptom: $ARGUMENTS

Reply in the user's language.

1. **Exact symptom.** Full error text, steps, when it started, what changed (code, updates, settings, data).
2. **Reproduce** it yourself. If you cannot, collect logs and inputs around the failure first — do not guess.
3. **Hypotheses.** List 2–4 likely causes, most likely first.
4. **Test them cheaply,** one at a time: a log line, a smaller input, `git bisect`, reverting one change. Write down what each test showed.
5. **Fix the root cause.** Label any temporary workaround as temporary.
6. **Prove it.** The reproduction now passes; add a regression test if there is a test suite.
7. **Check the runtime.** Make sure the running program uses the fixed code: restart services, kill stale processes, clear caches, confirm the deployed file actually changed (size/date/hash).
8. **Report:** cause → evidence → fix → proof → what to watch.

Delegate to the `debugger` agent for long investigations.
