import { createApp } from "vue";

import { coexistPlugin } from "@coexist/vue";

import App from "./App.vue";
import { coexist } from "./counter";

createApp(App).use(coexistPlugin(coexist)).mount("#app");
