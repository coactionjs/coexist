import { useMemo } from "react";

import { useModule, useSelector } from "@coexist/react";

import { SeedCatalogGateway } from "./catalog";
import { InventoryBoard } from "./domain";

export function ReactPanel({ catalog }: { readonly catalog: SeedCatalogGateway }) {
  const board = useModule(InventoryBoard);
  const items = useSelector(InventoryBoard, (module) => module.items);
  const overrides = useSelector(InventoryBoard, (module) => module.overrides);
  const suggestions = useSelector(InventoryBoard, (module) => module.suggestions);
  const rows = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        available: board.available(item),
        order: board.suggestion(item.id)?.order ?? 0,
      })),
    [board, items, overrides, suggestions],
  );
  const status = useSelector(InventoryBoard, (module) => module.status);
  const error = useSelector(InventoryBoard, (module) => module.error);

  return (
    <section className="panel" data-testid="react-panel">
      <p className="eyebrow">React view</p>
      <h2>Stock and demand</h2>
      <p role="status">Catalog: {status}</p>
      {error && <p role="alert">{error}</p>}
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
          {rows.map((item) => (
            <tr key={item.id}>
              <th>{item.name}</th>
              <td data-testid={`react-available-${item.id}`}>{item.available}</td>
              <td data-testid={`react-order-${item.id}`}>{item.order}</td>
              <td>
                <button
                  type="button"
                  aria-label={`Add five ${item.name}`}
                  onClick={() => void board.setAvailable(item.id, item.available + 5)}
                >
                  +5
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="toolbar">
        <button type="button" onClick={() => void board.refresh()}>
          Retry catalog
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            catalog.failNext();
            void board.refresh();
          }}
        >
          Simulate outage
        </button>
      </div>
    </section>
  );
}
