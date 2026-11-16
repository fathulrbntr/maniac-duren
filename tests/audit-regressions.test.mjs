import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { WirelessDisplayHost } from "../pos/customer-display-wireless-host.mjs";
import { commitMutation } from "../pos/data/mutations.mjs";

const accountHandler = createRequire(import.meta.url)("../api/pos-employee.js");
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("Mutation dispatcher preserves retry IDs, full responses and warehouse scan deltas", async () => {
  const payload = { id: "same-retry-id" },
    response = { stores: [], lots: [] };
  const calls = [];
  const request = async (path, body) => {
    calls.push({ path, body });
    return response;
  };
  assert.equal(await commitMutation({}, "order_create", payload, request), response);
  assert.deepEqual(calls.pop(), {
    path: "/rest/v1/rpc/pos_mutate_027",
    body: { action: "order_create", payload },
  });
  assert.equal(await commitMutation({}, "receipt_batch", payload, request), response);
  assert.deepEqual(calls.pop(), {
    path: "/rest/v1/rpc/pos_receive_shipment",
    body: { payload },
  });
  const state = {
    stores: [{ id: "store" }],
    transfers: [{ id: "transfer", items: [{ barcode: "label" }] }],
    supplyEvents: [],
  };
  const delta = await commitMutation(
    state,
    "transfer_scan",
    payload,
    async (path, body) => {
      assert.equal(path, "/rest/v1/rpc/pos_warehouse_mutate");
      assert.equal(body.payload.id, payload.id);
      return {
        warehouseDelta: true,
        transferId: "transfer",
        scans: [{ barcode: "label", scannedAt: "now" }],
        event: { id: payload.id },
      };
    },
  );
  assert.deepEqual(delta.stores, state.stores);
  assert.equal(delta.transfers[0].items[0].scannedAt, "now");
  assert.equal(delta.supplyEvents[0].id, payload.id);
  assert.equal(state.transfers[0].items[0].scannedAt, undefined);
  await assert.rejects(
    commitMutation(state, "order_create", payload, async () => {
      throw Error("network lost");
    }),
    /network lost/,
  );
});

test("Malformed account bodies return 400 without calling Supabase", async () => {
  const keys = [
    "POS_SUPABASE_URL",
    "POS_SUPABASE_PUBLISHABLE_KEY",
    "POS_SUPABASE_SERVICE_ROLE_KEY",
  ];
  const before = keys.map((key) => process.env[key]);
  const fetcher = globalThis.fetch;
  keys.forEach((key) => {
    process.env[key] = "test-only";
  });
  globalThis.fetch = () => {
    assert.fail("Invalid input must not reach the account service");
  };
  try {
    for (const body of ["null", "[]", "true", "123", '"text"', "{", null, [], {}]) {
      const response = {
        headers: {},
        setHeader(key, value) {
          this.headers[key] = value;
        },
        status(code) {
          this.code = code;
          return this;
        },
        json(value) {
          this.body = value;
          return this;
        },
      };
      await accountHandler(
        { method: "POST", headers: { authorization: "Bearer test" }, body },
        response,
      );
      assert.equal(response.code, 400, JSON.stringify(body));
      assert.match(response.headers["Cache-Control"], /no-store/);
    }
  } finally {
    globalThis.fetch = fetcher;
    keys.forEach((key, i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    });
  }
});

test("Latest display connection wins while an earlier session is stopping", async () => {
  const stopping = deferred(),
    calls = [];
  const host = new WirelessDisplayHost(
    async (request) => {
      calls.push(request);
      if (request.p_action === "stop" && request.p_store === "old")
        return stopping.promise;
      return { status: "waiting" };
    },
    { schedule: () => 1, cancel: () => {} },
  );
  host.session = { id: "old-session", store: "old" };
  const first = host.start("first");
  await host.start("latest");
  stopping.resolve({ status: "closed" });
  await first;
  assert.equal(host.session.store, "latest");
  assert.deepEqual(
    calls.filter((call) => call.p_action === "create").map((call) => call.p_store),
    ["latest"],
  );
  await host.stop();
});

test("Disconnect during remote cleanup must not create another display session", async () => {
  const stopping = deferred(),
    calls = [];
  const host = new WirelessDisplayHost(
    async (request) => {
      calls.push(request);
      return stopping.promise;
    },
    { schedule: () => 1, cancel: () => {} },
  );
  host.session = { id: "old-session", store: "old" };
  const starting = host.start("next");
  await host.stop();
  stopping.resolve({ status: "closed" });
  await starting;
  assert.equal(host.session, null);
  assert(!calls.some((request) => request.p_action === "create"));
});
