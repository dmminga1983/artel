# JavaScript / TypeScript frameworks

Detect the framework and its **major version** from `package.json` before applying any note — several defaults changed between majors (Next.js caching, Angular modules → standalone, Svelte stores → runes, Express error handling). When in doubt, read the project's existing code and the framework's upgrade guide for that version.

## React

- Function components and hooks only in new code. Components are pure functions of props and state.
- **State:** keep it minimal and local; lift only when siblings need it. Derived values are computed during render, not mirrored into state with an effect.
- **Effects** are for synchronising with external systems (subscriptions, DOM APIs, non-React widgets). Not for data transformation, not for responding to user events (do that in the handler). Always clean up.
- **Server state:** a data library (TanStack Query, SWR, RTK Query) or framework loaders — they handle caching, deduping, races and revalidation. Avoid hand-rolled `useEffect(fetch)` with no cancellation.
- **Client state:** `useState`/`useReducer`, context for low-frequency values (theme, auth), a store (Zustand, Redux Toolkit, Jotai) for shared high-frequency state.
- **Forms:** controlled inputs for small forms; a form library for complex validation; validate again on the server.
- **Performance:** React DevTools Profiler first. `memo`, `useMemo`, `useCallback` where a profile shows wasted renders — or rely on the React Compiler if enabled. Split context providers. `useTransition`/`useDeferredValue` for expensive updates. Virtualise long lists.
- **Keys:** stable IDs from data.
- **Refs:** for DOM access and mutable values that do not affect rendering. Check the project's React version for how `ref` is passed to function components.
- **Error boundaries** around route-level and widget-level UI.
- **Accessibility:** semantic HTML first; ARIA only to fill gaps.

## Next.js (App Router)

- **Server Components by default.** Files under `app/` render on the server unless marked `"use client"`. Put `"use client"` on the smallest interactive leaf; a client component's imports all become client code.
- **Data fetching** in server components with `async`/`await` directly (DB or `fetch`); start independent requests in parallel. Caching semantics for `fetch` and route segments changed across majors — check the project's version and its `next.config` before assuming something is cached or dynamic.
- **Request APIs** (`cookies()`, `headers()`, `params`, `searchParams`) are async in recent versions — follow the version's types.
- **Mutations:** Server Actions (`"use server"`) or route handlers (`app/**/route.ts`). Both are public endpoints: authenticate, authorise and validate inside. Revalidate with `revalidatePath`/`revalidateTag` after writes.
- **Boundaries:** `import "server-only"` in modules holding secrets or DB access; `NEXT_PUBLIC_*` env vars are inlined into client bundles.
- **Routing files:** `layout.tsx`, `page.tsx`, `loading.tsx` (Suspense), `error.tsx` (must be a client component), `not-found.tsx`; route groups `(group)`; dynamic segments `[id]`.
- **Request interception** (middleware; renamed in newer versions — check the docs for the project's version) runs on every matched request: keep it light, use `matcher`, do not rely on it as the only authorisation layer.
- **Metadata:** `export const metadata` or `generateMetadata`.
- **Images/fonts:** `next/image` with explicit sizes; `next/font` to self-host fonts.
- **Pages Router** projects (`pages/`): `getServerSideProps`/`getStaticProps`, API routes in `pages/api`; do not mix patterns casually in one feature.

## Vue 3 / Nuxt

- `<script setup lang="ts">` with the Composition API; `defineProps`/`defineEmits` with type-based declarations.
- `ref` for primitives and replaced values, `reactive` for objects you mutate in place (do not destructure reactive objects — use `toRefs`); `computed` for derived state; `watch`/`watchEffect` for side effects only.
- Props are read-only; emit events or use `v-model` (`defineModel` in recent versions) to change parent state.
- Pinia for shared state; composables (`useX()`) for reusable logic.
- `v-for` always with `:key`; never `v-if` and `v-for` on the same element.
- `v-html` only on sanitised content.
- **Nuxt:** `useFetch`/`useAsyncData` for SSR-safe data (deduplicated between server and client); `$fetch` in event handlers; server routes in `server/api/` (h3 handlers — validate input there); `runtimeConfig` for secrets (only `runtimeConfig.public` reaches the browser); `<ClientOnly>` for browser-only components.
- Tests: Vitest + `@vue/test-utils` or Testing Library for Vue; Nuxt test utils for Nuxt-specific behaviour.

## Angular

- **Standalone components** (default in recent versions) instead of NgModules for new code; follow the project if it still uses modules.
- **Signals** (`signal`, `computed`, `effect`, `input()`, `output()`, `model()`) for component state; RxJS for event streams and complex async — convert at the boundary (`toSignal`, `toObservable`).
- `inject()` for DI in new code; `providedIn: "root"` for app-wide services.
- `ChangeDetectionStrategy.OnPush` for components; check whether the app is zoneless before relying on Zone.js-triggered change detection.
- Built-in control flow `@if`, `@for (item of items; track item.id)`, `@switch`; `@defer` for lazy blocks.
- Unsubscribe: `takeUntilDestroyed()`, the `async` pipe, or signals — no manual subscriptions leaking.
- Typed reactive forms; validators on both client and server.
- Security: Angular sanitises bindings; `DomSanitizer.bypassSecurityTrust*` disables that — treat as a review blocker unless the value is a trusted constant. Use `HttpClient` with interceptors for auth; its XSRF support works with a cookie/header pair from the server.
- Tests: the project's runner (Karma/Jasmine, Jest, or Vitest in newer setups); `TestBed`; Angular Testing Library is a good fit for behaviour tests.

## Svelte / SvelteKit

- **Svelte 5 runes** in new code: `$state`, `$derived`, `$effect`, `$props`, `$bindable`. Svelte 4 syntax (`export let`, `$:`) still appears in older projects — follow the file you are editing; do not mix in one component.
- `$effect` is an escape hatch for side effects, not for deriving values (use `$derived`).
- `{@html}` only with sanitised content.
- **SvelteKit:** `+page.ts` (universal) vs `+page.server.ts` (server-only) `load` functions; form actions in `+page.server.ts` for mutations (progressive enhancement with `use:enhance`); API endpoints in `+server.ts`; hooks in `hooks.server.ts` for auth/session.
- Env: `$env/static/private` and `$env/dynamic/private` only in server modules (the build enforces it); `PUBLIC_`-prefixed vars are client-visible. `$lib/server/` modules cannot be imported by client code.
- Validate `params` and form data in the server; return `fail(400, ...)` from actions; `error()`/`redirect()` helpers for control flow.
- Tests: Vitest + Testing Library for Svelte; Playwright for routes.

## Express

- **Version matters:** Express 5 forwards rejected promises from async handlers to the error handler; Express 4 does not — wrap async handlers or the request hangs/crashes.
- Validate `req.body`, `req.query`, `req.params` with a schema; never trust types.
- One error-handling middleware `(err, req, res, next)` at the end; generic messages in production.
- `helmet()`, `express.json({ limit })`, `app.disable("x-powered-by")`, rate limiting on auth routes, `trust proxy` configured for the deployment.
- Graceful shutdown: on `SIGTERM`, stop accepting connections (`server.close()`), finish in-flight requests, close DB pools.
- Tests: `supertest` against the `app` without listening on a port.

## Fastify

- JSON Schema (or a type provider such as TypeBox/zod) for `body`, `querystring`, `params`, and `response` — validation and fast serialisation, and response schemas strip unexpected fields.
- Plugins and encapsulation: register routes and decorators inside plugins; use `fastify-plugin` only when a decorator must be visible to the parent scope.
- Async handlers: `return` the value (or `reply.send`), not both.
- Built-in pino logger (`request.log`) with redaction for auth headers.
- Tests: `app.inject({ method, url, payload })` — no network needed.

## NestJS

- Modules → providers (DI) → controllers; keep business logic in services, not controllers.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` with class-validator DTOs (or a zod pipe) — `whitelist` strips properties not in the DTO, preventing mass assignment.
- Guards for authentication/authorisation (`@UseGuards`), interceptors for cross-cutting concerns, exception filters for error mapping.
- Avoid circular module dependencies (`forwardRef` is a smell); configuration via `@nestjs/config` with schema validation.
- ORM: TypeORM/Prisma/MikroORM — watch N+1 with relations (`relations`/`include`/joins), parameterise raw queries.
- Tests: `Test.createTestingModule` with overridden providers; e2e with supertest against `app.getHttpServer()`.

## Node runtime notes

- Use `node:`-prefixed imports for built-ins (`import { readFile } from "node:fs/promises"`).
- Built-ins worth knowing before adding dependencies: `fetch`, `AbortSignal.timeout`, `structuredClone`, `node:test` runner, `--watch`, `--env-file`, `util.parseArgs`, `crypto.randomUUID`. Check availability against the project's Node version.
- Recent Node versions can run TypeScript by stripping types; this does not type-check and does not support every TS feature — still run `tsc --noEmit` in CI.
- Streams with `pipeline` from `node:stream/promises` for files and large responses.
- Workers (`node:worker_threads`) for CPU-heavy work off the event loop.
