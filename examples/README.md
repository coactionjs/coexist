# Coexist Examples

Each example is a runnable workspace package that demonstrates one slice of Coexist. They share the same `Counter` module across frameworks so you can compare adapters directly.

## Overview

| Example                                | Package                            | Demonstrates                                                             |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| [`react-counter`](./react-counter)     | `@coexist/example-react-counter`   | React adapter: `CoexistProvider`, `useModule`, `useSelector`.            |
| [`vue-counter`](./vue-counter)         | `@coexist/example-vue-counter`     | Vue adapter: `coexistPlugin`, `useModule`, `useComputed`.                |
| [`svelte-counter`](./svelte-counter)   | `@coexist/example-svelte-counter`  | Svelte adapter: readable stores and `$store` syntax.                     |
| [`solid-counter`](./solid-counter)     | `@coexist/example-solid-counter`   | Solid adapter: `CoexistProvider`, `useComputed` accessors.               |
| [`angular-counter`](./angular-counter) | `@coexist/example-angular-counter` | Angular adapter: `provideCoexist`, `injectModule`, `injectSignal`.       |
| [`ts-decorator`](./ts-decorator)       | `@coexist/example-ts-decorator`    | TypeScript standard decorators: `@Module`, `@State accessor`, metadata.  |
| [`js-decorator`](./js-decorator)       | `@coexist/example-js-decorator`    | JavaScript standard decorators with explicit dependency metadata.        |
| [`no-decorator`](./no-decorator)       | `@coexist/example-no-decorator`    | Defining modules with `defineModule()` metadata instead of decorators.   |
| [`lazy-module`](./lazy-module)         | `@coexist/example-lazy-module`     | Explicit lazy modules with `lazyModule()` and `app.load()`.              |
| [`router`](./router)                   | `@coexist/example-router`          | Router primitives, `RouterToken`, and `createRouterPlugin`.              |
| [`worker-counter`](./worker-counter)   | `@coexist/example-worker-counter`  | Hosting a module in a Web Worker and consuming it with a `WorkerClient`. |
| [`testing`](./testing)                 | `@coexist/example-testing`         | `testApp()` with provider overrides and action/state assertions.         |

## Running an example

Install dependencies once from the repository root:

```sh
pnpm install
```

The Vite-based examples run with their workspace filter:

```sh
pnpm --filter @coexist/example-react-counter dev
pnpm --filter @coexist/example-vue-counter dev
pnpm --filter @coexist/example-svelte-counter dev
pnpm --filter @coexist/example-solid-counter dev
pnpm --filter @coexist/example-angular-counter dev
```

Core-focused examples use the same Vite workflow:

```sh
pnpm --filter @coexist/example-no-decorator dev
pnpm --filter @coexist/example-ts-decorator dev
pnpm --filter @coexist/example-js-decorator dev
pnpm --filter @coexist/example-lazy-module dev
pnpm --filter @coexist/example-router dev
pnpm --filter @coexist/example-worker-counter dev
```

The testing example is runnable through Vitest:

```sh
pnpm --filter @coexist/example-testing test
```
