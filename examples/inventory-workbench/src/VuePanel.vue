<script setup lang="ts">
import { useModule, useSelector } from "@coexist/vue";

import { InventoryBoard } from "./domain";

const board = useModule(InventoryBoard);
const rows = useSelector(InventoryBoard, (module) =>
  module.items.map((item) => ({
    ...item,
    available: module.available(item),
    order: module.suggestion(item.id)?.order ?? 0,
  })),
);
const status = useSelector(InventoryBoard, (module) => module.status);
const error = useSelector(InventoryBoard, (module) => module.error);

function addFive(id: string, available: number): void {
  void board.setAvailable(id, available + 5);
}
</script>

<template>
  <section class="panel" data-testid="vue-panel">
    <p class="eyebrow">Vue view</p>
    <h2>The same module</h2>
    <p role="status">Catalog: {{ status }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>On hand</th>
          <th>Reorder</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in rows" :key="item.id">
          <th>{{ item.name }}</th>
          <td :data-testid="`vue-available-${item.id}`">{{ item.available }}</td>
          <td :data-testid="`vue-order-${item.id}`">{{ item.order }}</td>
          <td>
            <button
              type="button"
              :aria-label="`Add five ${item.name}`"
              @click="addFive(item.id, item.available)"
            >
              +5
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
