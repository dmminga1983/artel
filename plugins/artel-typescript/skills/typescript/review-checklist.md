# JavaScript / TypeScript review checklist

Severity: **blocker** (security, data loss, broken behaviour), **major** (bug risk, missing tests, perf regression), **minor** (style). Quote the line and propose the fix.

## Project and dependencies
- [ ] Same package manager as the lockfile; lockfile changed only by that manager; no new second lockfile.
- [ ] New dependency is needed, maintained, correctly placed (`dependencies` vs `devDependencies` vs `peerDependencies`), not a typosquat, with acceptable install scripts and bundle cost.
- [ ] Node / TS / framework versions unchanged unless that is the point of the change.
- [ ] Monorepo: dependency declared in the package that imports it.

## Types
- [ ] `tsc --noEmit` (or the project's type-check script) passes.
- [ ] No new `any`; `unknown` + narrowing for external data.
- [ ] No `!` non-null assertions or `as` casts that hide real `undefined`/shape problems; `@ts-expect-error` with a reason instead of `@ts-ignore`.
- [ ] Discriminated unions with exhaustive handling for state; `satisfies` for config objects.
- [ ] Public/library types are stable and exported intentionally.

## Correctness
- [ ] Every promise awaited, returned, or explicitly handled; no floating promises (lint rule `no-floating-promises` if typed linting is on).
- [ ] No sequential `await` inside loops for independent work; concurrency bounded for large fan-outs.
- [ ] `===`, `??` vs `||` used deliberately; no reliance on truthiness of `0`/`""`.
- [ ] No mutation of props, state, function arguments or shared module state.
- [ ] Dates in UTC/ISO; time zones and locales handled; no float money.
- [ ] Event listeners, intervals, subscriptions and `AbortController`s cleaned up.
- [ ] Fetches have timeouts/cancellation and handle non-2xx responses (`fetch` does not throw on 4xx/5xx).

## React / UI
- [ ] Hooks follow the rules; effect dependencies complete and honest (no disabled exhaustive-deps without reason).
- [ ] No derived state stored in `useState` + `useEffect`; computed during render.
- [ ] Stable `key`s (not index for dynamic lists).
- [ ] Memoisation justified by a measured problem (or handled by the React Compiler).
- [ ] Accessible: semantic elements, labels, keyboard focus, alt text; tests query by role.
- [ ] Loading, empty and error states exist.
- [ ] Next.js: `"use client"` only where needed; no server secrets imported into client components; non-serialisable props not passed to client components.

## Security
- [ ] No `dangerouslySetInnerHTML` / `v-html` / `{@html}` / `innerHTML` / `bypassSecurityTrust*` on unsanitised data; user URLs scheme-checked.
- [ ] No `eval` / `new Function` / string timers; `child_process` with argument arrays.
- [ ] Deep merges or key-setting on user JSON protected against `__proto__`/`constructor` keys.
- [ ] SQL/NoSQL queries parameterised; no `$queryRawUnsafe`-style interpolation.
- [ ] Server fetches of user URLs protected against SSRF.
- [ ] Nothing secret in `NEXT_PUBLIC_` / `VITE_` / `PUBLIC_` / `runtimeConfig.public` or client imports.
- [ ] Server actions, route handlers and API endpoints authenticate, authorise and validate input.
- [ ] Cookies `HttpOnly`/`Secure`/`SameSite`; CORS origins explicit; security headers present.
- [ ] Errors to clients are generic; logs redact tokens and personal data.
- [ ] `npm audit` (or equivalent) findings triaged.

## Performance
- [ ] No large dependency added to the client bundle without need; heavy UI lazy-loaded.
- [ ] No barrel imports pulling whole libraries into the client.
- [ ] No N+1 requests (per-item fetches or queries); batched or joined.
- [ ] No request waterfalls that could be parallel.
- [ ] Node: no sync I/O or heavy CPU on request paths.
- [ ] Long lists virtualised; input-driven requests debounced.

## Tests
- [ ] Unit/component tests for new behaviour; bug fix has a failing-first test.
- [ ] Component tests use Testing Library roles/labels and `userEvent`, not implementation details.
- [ ] Network mocked at the HTTP layer (MSW) or test server; no real external calls.
- [ ] E2E for critical flows with web-first assertions; no fixed sleeps.
- [ ] Fake timers restored; mocks reset between tests.
- [ ] The test command was run and is green; type check and lint green.
