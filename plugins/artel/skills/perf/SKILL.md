---
name: perf
description: Measures and fixes performance problems — profile first, change one thing, measure again — for APIs, queries, pages, builds and memory. Use when something is slow or expensive, or the user says "slow", "optimize", "тормозит", "ускорь", "оптимизируй".
argument-hint: "[what is slow]"
---

# Performance / Производительность

Problem: $ARGUMENTS

Reply in the user's language. Delegate investigations to the `performance-engineer` agent.

1. **Target:** the exact operation and a number that would be good enough.
2. **Baseline:** a reproducible measurement (profiler, `EXPLAIN ANALYZE`, Lighthouse, benchmark). Save the command so it can be re-run.
3. **Bottleneck:** read the profile; name the hot spot with evidence.
4. **One change at a time,** then re-measure with the same command.
5. **Keep** only changes that help meaningfully and keep tests green; revert the rest.
6. **Report:** baseline → change → result, plus the next best options with expected gain.

Never claim a speed-up you did not measure.
