# JavaScript / TypeScript build and run errors

Read the **first** error. In TypeScript, one wrong type often cascades into dozens of messages; in bundlers, the first "Module not found" usually explains the rest.

## First checks

```bash
node --version                 # matches .nvmrc / engines?
cat package.json | grep -E '"(packageManager|type|engines)"'
ls *lock* bun.lock* 2>/dev/null # exactly one lockfile?
npm ls <pkg>                    # or: pnpm why <pkg> / yarn why <pkg>
npx tsc --noEmit --pretty false | head -40
```

If CI and local differ: compare Node version, package-manager version, and whether CI installs from the lockfile.

## Module resolution

| Symptom | Likely cause | Fix |
|---|---|---|
| `TS2307: Cannot find module 'x'` | Package not installed; it is in another workspace package's deps; `moduleResolution` is `node10`/`node` and cannot read `exports` | Install in the right workspace; switch to `bundler` (bundled apps) or `nodenext` (Node). |
| `TS2307` for `@/components/...` alias | `paths` in tsconfig not mirrored in the bundler/test runner config (or vice versa) | Keep one source of truth: Vite/Vitest via `vite-tsconfig-paths` or `resolve.alias`; Jest `moduleNameMapper`; Next.js reads tsconfig `paths` itself. |
| `TS7016: Could not find a declaration file` | No bundled types | `@types/x` if published; else `declare module "x";` in `types/x.d.ts` (included by tsconfig). |
| `TS2305: Module has no exported member` after an upgrade | API renamed/removed | Read the package changelog / migration guide. |
| `Module not found: Can't resolve './x'` in a bundler | Case mismatch (works on macOS/Windows, fails on Linux CI), wrong extension, missing file | Fix casing exactly; check the file exists in git (`git ls-files`). |
| `ERR_MODULE_NOT_FOUND ... imported from ...` (Node ESM) | Relative ESM imports require full file extensions; directory imports are not resolved | `import "./util.js"` (also from `.ts` sources under `nodenext`); `./dir/index.js` explicitly. |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | Importing a subpath the package's `exports` map does not expose | Import a documented entry point. |
| `ERR_UNKNOWN_FILE_EXTENSION ".ts"` | Running `.ts` with plain `node` on a version/config without type stripping | Use `tsx`, compile first, or a Node version with type stripping enabled (it only strips types — no `enum`/`namespace` transforms without extra options). |

## ESM / CommonJS interop

| Symptom | Likely cause | Fix |
|---|---|---|
| `Error [ERR_REQUIRE_ESM]: require() of ES Module` | CJS `require` of an ESM-only package on a Node version without `require(esm)`, or the ESM has top-level `await` | Convert the caller to ESM; `await import("x")`; upgrade Node if the project allows. |
| `SyntaxError: Cannot use import statement outside a module` | `.js` file with `import` while `package.json` has no `"type": "module"` (or Jest running untransformed ESM) | Set `"type": "module"` or rename to `.mjs`; for Jest, configure transforms or ESM mode — or use Vitest. |
| `ReferenceError: require is not defined in ES module scope` / `exports is not defined` | CJS code inside an ESM package | Rename to `.cjs`, or use `import`; `createRequire(import.meta.url)` if `require` is truly needed. |
| `__dirname is not defined` | ESM has no `__dirname` | `import.meta.dirname` / `import.meta.filename` on recent Node; else `fileURLToPath(new URL(".", import.meta.url))`. |
| `x is not a function` / `default is not a function` | Default vs named export mismatch across CJS/ESM | `import x from` vs `import * as x from` vs `import { x } from`; `esModuleInterop` in tsconfig for CJS deps; check what the package actually exports. |
| Dual package hazard (two copies of a singleton) | Package loaded once as ESM and once as CJS | Use one module system end to end; library authors: a single implementation behind both conditions. |

## Types

| Symptom | Likely cause | Fix |
|---|---|---|
| `TS2322: Type 'X' is not assignable to type 'Y'` | Real mismatch, often `undefined` in optional values | Narrow or fix the data shape; do not cast. |
| `TS2532 / TS18048: Object is possibly 'undefined'` | Strict null checks, `noUncheckedIndexedAccess` | Guard (`if (!x) return`), default with `??`, or restructure. |
| `TS2339: Property does not exist on type` | Union not narrowed, or wrong type | Narrow with `in`, discriminant, or type guard. |
| `TS2589: Type instantiation is excessively deep` | Deeply recursive generics (schema/ORM types) | Annotate intermediate types explicitly; simplify generics. |
| `TS1371`/`TS1484`: import used only as a type | `verbatimModuleSyntax`/`importsNotUsedAsValues` rules | `import type { X }`. |
| `TS5097`/`TS2691`-style errors about `.ts` extensions in imports | Importing with `.ts` extension | Use `.js` extension under `nodenext`, or enable `allowImportingTsExtensions` only with `noEmit`/bundler setups. |
| Types fine in editor, failing in CI | Editor uses a different TS version or tsconfig | "Use workspace version" of TypeScript; run the CI script locally. |
| Errors inside `node_modules/**/*.d.ts` | Conflicting `@types` versions or incompatible TS version | Dedupe `@types/*`; `skipLibCheck: true` is a common, accepted mitigation. |

## Dependencies and install

| Symptom | Likely cause | Fix |
|---|---|---|
| npm `ERESOLVE unable to resolve dependency tree` / `Conflicting peer dependency` | A package's `peerDependencies` range excludes the installed version (often React or ESLint majors) | Upgrade the lagging package or choose a compatible version; `overrides` (npm) / `pnpm.overrides` / `resolutions` (yarn) with a comment; `--legacy-peer-deps` only as a documented last resort. |
| pnpm: `Cannot find module` for a package that "is installed" | Phantom dependency — code imports a package it does not declare (pnpm's strict `node_modules`) | Add the dependency explicitly to that package's `package.json`. |
| `EBADENGINE Unsupported engine` | Node version outside `engines` | Use the declared Node version. |
| `npm ci` fails: lockfile out of sync with package.json | `package.json` edited without reinstalling | Run `npm install` locally and commit the lockfile. |
| `pnpm install --frozen-lockfile` fails with `ERR_PNPM_OUTDATED_LOCKFILE` | Same | `pnpm install` locally, commit. |
| `node-gyp` / `gyp ERR!` / prebuild download failed | Native addon with no prebuilt binary for this Node/OS/arch | Use a Node version the addon supports; install Python + a C++ toolchain; prefer pure-JS or WASM alternatives. |
| Postinstall scripts do not run (pnpm) | Recent pnpm versions block dependency build scripts unless allowed | Approve the specific package (pnpm's approve-builds command / `onlyBuiltDependencies`), not all scripts. |
| Two versions of React / "Invalid hook call" | Duplicate React from a linked package or mismatched peer | `npm ls react`; dedupe; in monorepos make React a peer of shared UI packages. |

## Framework runtime

| Symptom | Likely cause | Fix |
|---|---|---|
| `Hydration failed because the server rendered HTML didn't match the client` | Non-deterministic render (time, random IDs, locale formatting, `typeof window` branches), invalid nesting (`<div>` in `<p>`, `<a>` in `<a>`), browser extensions mutating DOM | Make server output deterministic; use `useId`; move browser-only values to `useEffect`; fix HTML nesting. |
| `ReferenceError: window is not defined` / `document is not defined` | Browser API used during SSR or at module top level | Access inside effects/event handlers; dynamic import with SSR disabled for browser-only widgets. |
| Next.js: `You're importing a component that needs useState. ... mark it with "use client"` | Hook used in a Server Component | Add `"use client"` to the smallest interactive component. |
| Next.js: `Functions cannot be passed directly to Client Components` | Passing non-serialisable props from server to client | Pass data; define handlers in the client component or use a Server Action. |
| `Module not found: Can't resolve 'fs'` / `'net'` / `'child_process'` | Node-only module pulled into a client bundle | Move it into server-only code; mark the module with `import "server-only"`. |
| Vite: `Failed to resolve import` | Missing dependency or alias | Install / fix `resolve.alias`. |
| Angular: `NG0100: ExpressionChangedAfterItHasBeenCheckedError` | State changed during change detection (dev-mode check) | Move the update to an earlier lifecycle hook or use signals/async pipe correctly. |
| Vue: `Hydration ... mismatch` | Same causes as React | Same fixes; `<ClientOnly>` in Nuxt for browser-only parts. |

## Memory and performance of the build

| Symptom | Likely cause | Fix |
|---|---|---|
| `FATAL ERROR: Reached heap limit` / `JavaScript heap out of memory` | Type check or bundle exceeds default V8 heap, often in CI with small runners | `NODE_OPTIONS=--max-old-space-size=4096` (size to the runner's RAM); then find the cause: run `tsc --extendedDiagnostics`, split with project references, remove giant barrel files, enable `skipLibCheck`. |
| Very slow `tsc` | Huge `include`, type-heavy libraries, no incremental builds | Narrow `include`; `incremental: true`; project references with `tsc -b`; `tsc --generateTrace <dir>` to find hot spots. |
| Jest out of memory / slow | Transforming all of `node_modules`, leaking tests | Restrict `transformIgnorePatterns`; `--runInBand` to debug; consider Vitest. |

## Shell snippet: reproduce CI locally

```bash
rm -rf node_modules          # destructive: deletes installed deps (recreated below)
npm ci                       # or: pnpm install --frozen-lockfile / yarn install --immutable
npm run build && npm test
```
