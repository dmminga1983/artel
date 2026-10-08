---
name: plan-first
description: Makes a short written plan with a definition of done before starting any multi-step task, and gets it confirmed when the task is costly to redo. Use when a task has several steps or files, is ambiguous, or the user says "спланируй", "составь план", "plan this", "how should we approach".
argument-hint: "[task description]"
---

# Plan first / Сначала план

Task: $ARGUMENTS

Reply in the user's language.

1. **Look before planning.** Read the relevant files, documents or pages. Note what already exists.
2. **Write the plan** (delegate to the `planner` agent for larger tasks):
   - goal in one sentence;
   - assumptions — mark the risky ones;
   - up to 3 questions whose answers change the plan;
   - numbered steps, each with *how we will check it worked*;
   - risky steps (delete, publish, pay, send, overwrite) last, marked **needs confirmation**;
   - definition of done — a checklist.
3. **Decide whether to ask.** If redoing the work would be cheap, start right away and mention the assumptions. If it would be expensive or irreversible, show the plan and wait for a yes.
4. **Track it.** Turn the steps into a task list and keep it updated while working.
5. **Finish with verification** — run `/artel:verify-done` against the definition of done.
