import { mount } from "svelte";

import { setCoexistApp } from "@coexist/svelte";

import App from "./App.svelte";
import { coexist } from "./counter";

setCoexistApp(coexist);

mount(App, {
  target: document.getElementById("app")!,
});
