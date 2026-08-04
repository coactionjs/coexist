# Getting Started

This guide takes you from an empty directory to a running Coexist app with a UI framework of your choice.

## Requirements

- **Node.js** `>=22.12.0`
- A package manager (pnpm, npm, or yarn). The examples below use pnpm.

Coexist ships as **ESM only**. Your project should use `"type": "module"` (or `.mjs`/`.mts` files) and a modern bundler or Node version.

## Option A — scaffold a project

The fastest way to start is the `create-coexist` CLI. It generates a minimal `@coexist/core` project with a `defineModule()` counter:

```sh
pnpm dlx @coexist/create my-app
cd my-app
pnpm install
pnpm start
```

This produces:

```text
my-app/
├── package.json     # scripts: build (tsc), start (tsx src/main.ts)
├── tsconfig.json    # strict, NodeNext, ES2022
└── src/
    └── main.ts      # a counter module wired into createApp()
```

See [`@coexist/create`](../packages/create/README.md) for the programmatic API.

## Option B — add to an existing project

Install the core package and (optionally) a UI adapter:

```sh
pnpm add @coexist/core
pnpm add @coexist/react   # or @coexist/vue, @coexist/svelte, @coexist/solid, @coexist/angular
```

## Your first module

A module is a plain class. Declare which members are state/actions/computed either with decorators or with `defineModule()`. The no-decorator form works everywhere, so we start there:

```ts
// src/counter.ts
import { defineModule } from "@coexist/core";

export class Counter {
  count = 0;

  get double(): number {
    return this.count * 2;
  }

  increase(step = 1): void {
    this.count += step;
  }

  reset(): void {
    this.count = 0;
  }
}

defineModule(Counter, {
  actions: ["increase", "reset"],
  computed: ["double"],
  name: "counter",
  state: ["count"],
});
```

> Prefer decorators? See [Modules](./modules.md) for the `@Module`, `@State`, `@Action`, `@Computed`, and `@Effect` equivalents. They require a build setup with TC39 decorators and the `accessor` keyword.

## Create the app

```ts
// src/app.ts
import { createApp } from "@coexist/core";
import { Counter } from "./counter.js";

export const app = createApp({
  providers: [Counter],
});
```

You can already use it without any UI:

```ts
const counter = app.getModule(Counter);
counter.increase();
console.log(app.store.getPureState()); // { counter: { count: 1 } }
```

## Render with a framework

Pick the tab for your framework. Each adapter only provides context and subscription helpers — you keep your framework's normal mount API.

### React

```tsx
import { createRoot } from "react-dom/client";
import { CoexistProvider, useModule, useSelector } from "@coexist/react";
import { app } from "./app.js";
import { Counter } from "./counter.js";

function CounterView() {
  const counter = useModule(Counter);
  const count = useSelector(Counter, (m) => m.count);

  return <button onClick={() => counter.increase()}>{count}</button>;
}

createRoot(document.getElementById("root")!).render(
  <CoexistProvider app={app}>
    <CounterView />
  </CoexistProvider>,
);
```

### Vue

```ts
import { createApp as createVueApp, defineComponent, h } from "vue";
import { coexistPlugin, useComputed, useModule } from "@coexist/vue";
import { app } from "./app.js";
import { Counter } from "./counter.js";

const CounterView = defineComponent({
  setup() {
    const counter = useModule(Counter);
    const count = useComputed((a) => a.getModule(Counter).count);
    return () => h("button", { onClick: () => counter.increase() }, count.value);
  },
});

createVueApp(CounterView).use(coexistPlugin(app)).mount("#app");
```

### Svelte

```ts
import { moduleStore, selectedModuleStore, setCoexistApp } from "@coexist/svelte";
import { app } from "./app.js";
import { Counter } from "./counter.js";

setCoexistApp(app);
export const counter = moduleStore(Counter);
export const count = selectedModuleStore(Counter, (m) => m.count);
```

```svelte
<button on:click={() => $counter.increase()}>{$count}</button>
```

### Solid

```tsx
import { CoexistProvider, useComputed, useModule } from "@coexist/solid";
import { app } from "./app.js";
import { Counter } from "./counter.js";

function CounterView() {
  const counter = useModule(Counter);
  const count = useComputed(Counter, (m) => m.count);
  return <button onClick={() => counter.increase()}>{count()}</button>;
}

<CoexistProvider app={app}>
  <CounterView />
</CoexistProvider>;
```

### Angular

```ts
import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { injectModule, injectSignal, provideCoexist } from "@coexist/angular";
import { app } from "./app.js";
import { Counter } from "./counter.js";

@Component({
  selector: "counter-view",
  template: `<button (click)="counter.increase()">{{ count() }}</button>`,
})
export class CounterView {
  readonly counter = injectModule(Counter);
  readonly count = injectSignal(Counter, (m) => m.count);
}

bootstrapApplication(CounterView, { providers: [provideCoexist(app)] });
```

## Run a working example

Every framework above has a runnable demo in [`examples/`](../examples):

```sh
pnpm install
pnpm --filter @coexist/example-react-counter dev
```

## Where to go next

- [Core Concepts](./core-concepts.md) — state, actions, computed, effects, the store.
- [Dependency Injection](./dependency-injection.md) — wire services into modules.
- [UI Adapters](./ui-adapters.md) — the full hook/composable/store/signal API per framework.
- [Testing](./testing.md) — verify modules with `testApp()`.
