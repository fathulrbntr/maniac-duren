import test from "node:test";
import assert from "node:assert/strict";
import { prepareRetry, pendingRetry, setRetryScope } from "../pos/retry.mjs";

test("equivalent payload key order reuses the pending operation, including older saved retries", () => {
  const disk = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => disk.get(key) ?? null,
    setItem: (key, value) => disk.set(key, value),
    removeItem: (key) => disk.delete(key),
  };
  const first = { id: "original", storeId: "A", lines: [{ productId: "P", qty: 2 }] };
  const reordered = { lines: [{ qty: 2, productId: "P" }], storeId: "A", id: "retry" };
  setRetryScope("key-order");
  prepareRetry("order_create", first);
  assert.equal(prepareRetry("order_create", reordered).id, "original");
  assert.throws(
    () => prepareRetry("order_create", { ...reordered, storeId: "B" }),
    /belum pasti/,
  );
  assert.throws(() => prepareRetry("sale", reordered), /belum pasti/);
  assert.throws(
    () => prepareRetry("order_create", { ...first, lines: [{ productId: "P", qty: 3 }] }),
    /belum pasti/,
  );
  disk.set(
    "maniac-pos-pending-operation-v1:legacy",
    JSON.stringify({
      action: "order_create",
      id: "original",
      payload: first,
      key: JSON.stringify({ action: "order_create", ...first, id: undefined }),
    }),
  );
  setRetryScope("legacy");
  assert.equal(prepareRetry("order_create", reordered).id, "original");
  assert.deepEqual(pendingRetry().payload, first);
  setRetryScope("array-order");
  prepareRetry("order_create", { id: "array", lines: [{ id: "A" }, { id: "B" }] });
  assert.throws(
    () =>
      prepareRetry("order_create", { id: "array", lines: [{ id: "B" }, { id: "A" }] }),
    /belum pasti/,
  );
});
