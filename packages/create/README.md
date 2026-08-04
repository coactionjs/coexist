# @coexist/create

> Project scaffolding for [Coexist](../../README.md). Ships the `create-coexist` CLI and a programmatic `createCoexistProject()` API that generate a minimal `@coexist/core` starter.

## Usage

Scaffold a new project with your package manager's `create`/`dlx` command — no global install required:

```sh
pnpm dlx @coexist/create my-app
# npm exec @coexist/create -- my-app
# yarn dlx @coexist/create my-app

cd my-app
pnpm install
pnpm start
```

The target directory defaults to `coexist-app` when no name is given. The generated project contains:

```text
my-app/
├── package.json     # scripts: build (tsc), start (tsx src/main.ts)
├── tsconfig.json    # strict, NodeNext, ES2022
└── src/
    └── main.ts      # a defineModule() counter wired into createApp()
```

`src/main.ts` is a runnable starting point:

```ts
import { createApp, defineModule } from "@coexist/core";

class Counter {
  count = 0;
  increase(): void {
    this.count += 1;
  }
}

defineModule(Counter, { actions: ["increase"], name: "counter", state: ["count"] });

const app = createApp({ providers: [Counter] });
app.getModule(Counter).increase();
console.log(app.store.getPureState());
```

## Programmatic API

```ts
import { createCoexistProject } from "@coexist/create";

const result = await createCoexistProject({
  root: "/abs/path/to/my-app",
  name: "my-app",
  packageManager: "pnpm@11.8.0", // optional
});

console.log(result.files); // ["package.json", "tsconfig.json", "src/main.ts"]
```

| Option           | Type     | Description                                     |
| ---------------- | -------- | ----------------------------------------------- |
| `root`           | `string` | Absolute directory to generate into.            |
| `name`           | `string` | Project name written to `package.json`.         |
| `packageManager` | `string` | `packageManager` field (default `pnpm@11.8.0`). |

Returns `{ root, files }`.

## Exports

CLI bin `create-coexist`; module exports `createCoexistProject` and the `CreateCoexistProjectOptions`, `CreatedCoexistProject` types.

## License

[MIT](../../LICENSE) © Coaction
