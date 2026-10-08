---
name: typescript
description: JavaScript/TypeScript stack pack — npm/pnpm/yarn/bun, tsconfig strictness, ESLint/Prettier/Biome, Node ESM/CJS, Vitest/Jest/Playwright, XSS and supply-chain pitfalls, bundle and render performance, build-error playbook, review checklist; React, Next.js, Vue/Nuxt, Angular, Svelte, Express/Fastify/NestJS. Use for any JS/TS code. Триггеры - «фронтенд», «ошибка сборки», «тайпскрипт».
paths: "**/*.ts, **/*.tsx, **/*.js, **/*.jsx, **/*.mjs, **/*.cjs, **/*.mts, **/*.cts, **/*.vue, **/*.svelte, package.json, tsconfig*.json, pnpm-lock.yaml, package-lock.json, yarn.lock, bun.lock"
---

# JavaScript / TypeScript

Reply in the user's language.

Follow the project's existing conventions over these defaults. Long material lives in reference files:
[build-errors.md](build-errors.md) · [security.md](security.md) · [review-checklist.md](review-checklist.md) · [frameworks.md](frameworks.md).

## 1. Detect the project

| Look at | It tells you |
|---|---|
| Lockfile: `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` / `bun.lock` or `bun.lockb` | Package manager. **The lockfile decides.** Never run a different manager — it creates a second lockfile and a different tree. |
| `package.json` `packageManager`, `engines`, `.nvmrc`, `.node-version`, `.tool-versions` | Manager version and Node version. Yarn: `.yarnrc.yml` means Berry (v2+), otherwise Classic. |
| `package.json` `type`, `exports`, `main`, `module` | ESM (`"type": "module"`) or CommonJS; what the package exposes. |
| `pnpm-workspace.yaml`, `workspaces`, `turbo.json`, `nx.json` | Monorepo: run commands in the right package (`pnpm --filter`, `npm -w`, `yarn workspace`). |
| `tsconfig*.json` (`extends`, `strict`, `module`, `moduleResolution`, `paths`, `references`) | Strictness and resolution rules. |
| `eslint.config.*` (flat) or `.eslintrc*` (legacy), `.prettierrc*`, `biome.json(c)` | Linter/formatter. Biome replaces ESLint+Prettier where present. |
| `vitest.config.*`, `jest.config.*`, `playwright.config.*`, `cypress.config.*` | Test runners. |
| `next.config.*`, `nuxt.config.*`, `angular.json`, `svelte.config.*`, `vite.config.*`, `nest-cli.json` | Framework — then read [frameworks.md](frameworks.md). |

Run scripts through the project's manager (`pnpm test`, `npm run build`, `yarn lint`, `bun run dev`). Read `scripts` in `package.json` before inventing commands.

## 2. Defaults for new code

- **TypeScript** with `"strict": true`. Also worth it on new projects: `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax` (or `isolatedModules`) when a bundler/transpiler compiles files one by one.
- **Module settings:** apps built by a bundler → `"module": "esnext"` / `"preserve"` with `"moduleResolution": "bundler"`; code run directly by Node or published libraries → `"module": "nodenext"` (resolution follows automatically).
- **ESM** (`"type": "module"`) for new Node packages. Libraries: an explicit `exports` map with `types` conditions.
- **Node:** an Active or Maintenance LTS release — check the official release schedule, pin it in `.nvmrc`/`engines`.
- **Package manager:** pnpm or npm; pin the version via `packageManager`. Install in CI from the lockfile (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable` on Berry, `bun install --frozen-lockfile`).
- **Lint/format:** ESLint flat config + typescript-eslint + Prettier, or Biome alone. Do not add a second formatter.
- **Tests:** Vitest for Vite-based and new projects, Jest if already present; Testing Library for components; Playwright for e2e.
- **Validation at boundaries:** a schema library (zod, valibot, etc.) for request bodies, env vars, external API responses; infer types from the schema.

## 3. Idioms and design

1. **Types model the domain.** Discriminated unions with a `kind`/`type` tag for states; exhaustive `switch` with a `never` check. Make illegal states unrepresentable.
2. **`unknown` over `any`** for untrusted data; narrow with type guards or schema parsing. `any` disables checking for everything it touches.
3. **No non-null assertions (`!`) or `as` casts to silence errors.** Narrow instead; `satisfies` checks a value against a type without widening it.
4. **`const` by default; immutability** for shared data (`readonly`, `as const`, `Readonly<T>`). Do not mutate function arguments or React state.
5. **Async:** every promise is awaited, returned, or explicitly handled (`void` + `.catch`). Use `Promise.all` for independent work and `Promise.allSettled` when partial failure is acceptable; cap concurrency for large fan-outs. Use `AbortController`/`AbortSignal.timeout()` for cancellable `fetch`.
6. **`===` always**; `??` for defaults (not `||`, which swallows `0` and `""`); optional chaining `?.` instead of `&&` chains.
7. **Small modules with explicit exports.** Avoid barrel files (`index.ts` re-exporting everything) in apps — they slow builds and defeat tree-shaking.
8. **Type-only imports** (`import type { X }`) for types; required under `verbatimModuleSyntax`.
9. **Dates and money:** store and send ISO-8601/UTC; format at the edge with `Intl`. Money as integer minor units or a decimal library, never float arithmetic.
10. **Env vars:** parse once at startup into a typed config object; fail fast on missing values.
11. **Do not augment globals or prototypes.** Use modules.
12. **Dependencies:** prefer the platform (`fetch`, `structuredClone`, `URL`, `crypto.randomUUID`, `Array.prototype.at`) before adding packages.

## 4. Errors and logging

- Throw `Error` subclasses (`class NotFoundError extends Error`) with a `cause` when wrapping: `new Error("load failed", { cause: err })`. Never throw strings or plain objects.
- In `catch (err)`, `err` is `unknown` (with `useUnknownInCatchVariables`, part of `strict`) — narrow with `instanceof` before use.
- Handle errors at boundaries: HTTP handler, job runner, React error boundary, `process.on("unhandledRejection")` as a last-resort log-and-exit, not a recovery mechanism.
- For expected failures in domain code, a `Result`-style return is fine; be consistent within the codebase.
- Server logging: a structured logger (pino or the framework's logger) with levels; no `console.log` in committed server code unless that is the project convention.
- Never log tokens, cookies, `Authorization` headers, passwords or personal data; configure redaction.
- Client: report errors to the monitoring tool the project uses; show users a generic message.

## 5. Testing

- **Unit/integration:** Vitest (`describe`, `it`, `expect`, `vi.fn`, `vi.mock`, `vi.spyOn`, `vi.useFakeTimers`) or Jest (`jest.fn`, `jest.mock`). Tests next to code (`x.test.ts`) or in `tests/` — follow the project.
- **Components:** Testing Library — query by role and label (`getByRole("button", { name: /save/i })`), interact with `userEvent` (`const user = userEvent.setup()`), await async UI with `findBy*`. Test behaviour, not implementation details or snapshots of whole trees.
- **Network:** mock at the HTTP layer (MSW) rather than mocking `fetch` per test; never hit real external services in unit tests.
- **E2E:** Playwright — locators (`page.getByRole`), web-first assertions (`await expect(locator).toBeVisible()`) that auto-wait; no fixed `waitForTimeout`. Isolate state per test; reuse auth via stored storage state.
- **Types as tests:** `tsc --noEmit` in CI; `expectTypeOf` (Vitest) for library type contracts.
- **Run one test:** `vitest run path/to/file.test.ts -t "name"`, `jest path/to/file -t "name"`, `playwright test path/to/spec.ts --project=chromium`. Through the manager: `pnpm vitest run …`, `npx playwright test …`.
- **Coverage:** `vitest run --coverage` (v8 provider) or `jest --coverage`.

## 6. Security pitfalls

Full list with snippets: [security.md](security.md).

- **XSS:** frameworks escape by default — the holes are `dangerouslySetInnerHTML` (React), `v-html` (Vue), `{@html}` (Svelte), `[innerHTML]` + `bypassSecurityTrust*` (Angular), `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`. Sanitise with DOMPurify or avoid. Validate URLs: `href={userUrl}` can be `javascript:`.
- **Prototype pollution:** deep-merging or path-setting untrusted JSON (`__proto__`, `constructor`, `prototype` keys). Use `Map`, `Object.create(null)`, schema validation, or libraries that block those keys.
- **Code execution:** no `eval`, `new Function`, `setTimeout("string")`, `vm` as a sandbox. `child_process.exec` with input → use `execFile`/`spawn` with an argument array.
- **SSRF:** server code fetching user URLs must allow-list hosts/schemes, block private and link-local addresses, limit redirects, set timeouts.
- **Secrets in client bundles:** anything prefixed `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_` (SvelteKit), Nuxt `runtimeConfig.public`, or imported into client code ships to every browser. Keep keys server-side; mark server modules with the `server-only` package in Next.js.
- **Server endpoints:** Next.js Server Actions and route handlers are public HTTP endpoints — authenticate and authorise inside each one; validate input.
- **Auth:** cookies `HttpOnly`, `Secure`, `SameSite`; do not put tokens in `localStorage` if avoidable; JWT verification with a pinned algorithm list.
- **Supply chain:** commit the lockfile, install with the frozen/CI command, run `npm audit` / `pnpm audit` / `yarn npm audit` (Berry); review install scripts of new dependencies; map private scopes to the private registry in `.npmrc` to prevent dependency confusion.

## 7. Performance pitfalls

- **Bundle size:** analyse before optimising (the bundler's analyzer or a visualizer plugin). Lazy-load routes and heavy widgets with dynamic `import()`; import specific modules (`date-fns/format`-style) instead of whole libraries; avoid shipping server-only libraries to the client.
- **React re-renders:** keep state close to where it is used; split contexts by update frequency; stable `key`s (never array index for reorderable lists). `memo`/`useMemo`/`useCallback` only where a profile shows cost — or let the React Compiler handle it if the project uses it.
- **Effects:** do not use `useEffect` to derive state from props — compute during render. Fetch in a data library or server component, not ad-hoc effects with races.
- **Server Components (Next.js App Router):** keep data fetching and heavy dependencies on the server; push `"use client"` down to small interactive leaves.
- **N+1 in API calls:** a request per list item (client or server). Batch endpoints, `Promise.all` instead of sequential `await` in loops, DataLoader-style batching for GraphQL resolvers, ORM `include`/joins instead of per-row queries.
- **Waterfalls:** start independent fetches in parallel; preload on the server.
- **Node servers:** never block the event loop (sync `fs`, `JSON.parse` of huge payloads, CPU loops) on hot paths — use streams, worker threads, or a queue. Reuse HTTP agents/DB pools.
- **Lists:** virtualise long lists; debounce input-driven requests.

## 8. Build and run errors

Full table: [build-errors.md](build-errors.md).

| Symptom | Likely cause | Fix |
|---|---|---|
| `TS2307: Cannot find module 'x' or its corresponding type declarations` | Not installed, wrong `paths`/`baseUrl`, or `moduleResolution` cannot read the package's `exports` | Install with the project manager; align `paths` with the bundler alias; use `bundler`/`nodenext` resolution. |
| `TS7016: Could not find a declaration file for module 'x'` | Package ships no types | Install `@types/x` if it exists, else a minimal `declare module "x"` in a `.d.ts`. |
| `ERR_REQUIRE_ESM` / `require() of ES Module not supported` | CJS code requiring an ESM-only package | Move the file to ESM, use dynamic `import()`, or a Node version that supports `require` of ESM. |
| `SyntaxError: Cannot use import statement outside a module` | ESM syntax in a file Node treats as CJS | `"type": "module"`, `.mjs`/`.mts`, or compile to CJS consistently. |
| `ERR_MODULE_NOT_FOUND` for a relative import | Node ESM needs file extensions | Write `./x.js` in TS source under `nodenext`, or let a bundler resolve. |
| npm `ERESOLVE unable to resolve dependency tree` | Peer dependency range conflict | Upgrade the package that lags behind its peer; `--legacy-peer-deps` only as a documented last resort. |
| `Hydration failed` / text content mismatch | Server and client render differently (`Date.now()`, `Math.random()`, locale, `window` checks, invalid HTML nesting) | Render deterministic markup; move browser-only values into effects; fix nesting. |
| `JavaScript heap out of memory` during build/type check | Large project, leaks in plugins, or too-small heap in CI | Raise heap via `NODE_OPTIONS=--max-old-space-size=<MB>`; then reduce the cause (project references, fewer barrel files, `skipLibCheck`). |
| `Module not found: Can't resolve 'fs'` in a client build | Server-only code imported into the browser bundle | Move the import behind a server boundary. |
| `Invalid hook call` | Duplicate React copies or hooks called conditionally | Dedupe React (`npm ls react`); follow the rules of hooks. |

## 9. Review checklist

Full checklist: [review-checklist.md](review-checklist.md).

- [ ] Same package manager; lockfile updated; no stray second lockfile.
- [ ] `tsc --noEmit` and lint pass; no new `any`, `@ts-ignore`, `!` or `as` without a reason (prefer `@ts-expect-error` with a comment).
- [ ] Every promise handled; no `await` in loops over independent work.
- [ ] No `dangerouslySetInnerHTML`/`v-html`/`innerHTML` with unsanitised data; no `eval`/`new Function`.
- [ ] No secrets in client-exposed env vars or client imports; server actions/handlers authorise.
- [ ] Input validated at boundaries; errors not leaked to clients.
- [ ] No new heavy dependency in the client bundle without need; lazy-load where it helps.
- [ ] Tests updated: behaviour-level component tests, e2e for critical flows; command shown green.

## 10. Frameworks

Details: [frameworks.md](frameworks.md).

- **React:** function components and hooks; derive, do not sync, state; server state in a data library.
- **Next.js App Router:** server components by default, `"use client"` at leaves; check the project's Next version for caching and async request API semantics.
- **Vue / Nuxt:** Composition API with `<script setup lang="ts">`; Pinia for stores; Nuxt `useFetch`/`useAsyncData` for SSR-safe data.
- **Angular:** standalone components, signals, `inject()`, OnPush; built-in control flow (`@if`, `@for` with `track`).
- **Svelte / SvelteKit:** Svelte 5 runes in new code; data in `load`, mutations in form actions; private env only in server modules.
- **Express / Fastify / NestJS:** validate input, central error handler, security headers, body size limits; Fastify schemas; Nest `ValidationPipe` with whitelisting.
