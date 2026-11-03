import assert from "node:assert/strict";
import test from "node:test";
import {
  balance,
  getPayments,
  getTags,
  nextOrderId,
  orderTotal,
  seedStore,
  sumPaymentsInRange,
  updateTagStatus,
  validateStore,
} from "../src/domain-core";
import { qrMatrix, tagSvg } from "../src/qr";

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach } from "node:test";
import {
  createSnapshotStorage,
  type SnapshotDatabase,
} from "../src/storage-core";
import { createStoreRepository } from "../src/repository";

// Node's real SQLite engine exercises our schema, queries and transaction
// contract. The Expo native bridge/device is a separate APK validation step.
const directory = mkdtempSync(join(tmpdir(), "laundry-native-sql-"));
const db = new DatabaseSync(join(directory, "test.sqlite"));
let failReads = false;
let failWrites = false;
let failAfterWrite = false;
const adapter: SnapshotDatabase = {
  async execAsync(sql) {
    db.exec(sql);
  },
  async getFirstAsync<T>(sql: string) {
    if (failReads) throw new Error("Unavailable");
    return (db.prepare(sql).get() ?? null) as T | null;
  },
  async withExclusiveTransactionAsync(task) {
    db.exec("BEGIN EXCLUSIVE TRANSACTION");
    try {
      await task({
        async runAsync(sql, value) {
          if (failWrites) throw new Error("Full");
          const result = db.prepare(sql).run(value);
          if (failAfterWrite) throw new Error("Interrupted transaction");
          return result;
        },
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
};
const storage = createSnapshotStorage(async () => adapter);
const { loadStore, saveStore, rawSavedData } = createStoreRepository(storage);
beforeEach(() => {
  failReads = false;
  failWrites = false;
  failAfterWrite = false;
});
after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("native billing keeps quantities, discounts, partial payments and garment identities", () => {
  const store = seedStore();
  const original = store.orders[0];
  const order = { ...original, discount: 20, paid: 100, payments: undefined };
  assert.equal(orderTotal(order), 400);
  assert.equal(balance(order), 300);
  const tags = getTags(order);
  assert.equal(tags.length, 6);
  assert.equal(new Set(tags.map((tag) => tag.id)).size, 6);
  assert.equal(nextOrderId(store.orders), "LL-1049");
});

test("scanning individual garments derives order status only after all advance", () => {
  const store = seedStore();
  const original = store.orders[0];
  const tags = getTags(original);
  let updated = updateTagStatus(store, tags[0].id, "Ready");
  assert.equal(updated.orders[0].status, "Received");
  for (const tag of tags.slice(1))
    updated = updateTagStatus(updated, tag.id, "Ready");
  assert.equal(updated.orders[0].status, "Ready");
  updated = updateTagStatus(updated, tags[0].id, "Processing");
  assert.equal(updated.orders[0].status, "Processing");
  assert.equal(
    getTags(updated.orders[0]).filter((tag) => tag.status === "Ready").length,
    5,
  );
});

test("new payment dates, including earlier-order collections, drive reports", () => {
  const order = seedStore().orders[0];
  const dated = {
    ...order,
    createdAt: "2025-01-01T12:00:00",
    paid: 200,
    payments: [{ id: "payment-a", amount: 200, paidAt: "2025-03-01T12:00:00" }],
  };
  assert.equal(sumPaymentsInRange([dated], "2025-01-01", "2025-01-31"), 0);
  assert.equal(sumPaymentsInRange([dated], "2025-03-01", "2025-03-01"), 200);
  assert.equal(
    getPayments({ ...dated, payments: undefined })[0].paidAt,
    dated.createdAt,
  );
});

test("backup validation rejects broken references, negative values and payment mismatches", () => {
  const store = seedStore();
  assert.equal(validateStore(store), true);
  assert.equal(
    validateStore({
      ...store,
      orders: [{ ...store.orders[0], customerId: "missing" }],
    }),
    false,
  );
  assert.equal(
    validateStore({ ...store, orders: [{ ...store.orders[0], paid: -1 }] }),
    false,
  );
  assert.equal(
    validateStore({ ...store, orders: [{ ...store.orders[0], payments: [] }] }),
    false,
  );
  assert.equal(
    validateStore({
      ...store,
      settings: {
        ...store.settings,
        logo: "https://external.example/logo.png",
      },
    }),
    false,
  );
});

test("QR output has a four-module quiet zone and stable valid tag payloads", () => {
  const id = getTags(seedStore().orders[0])[0].id;
  const matrix = qrMatrix(id);
  assert(matrix.size >= 21);
  assert.equal(matrix.data.length, matrix.size * matrix.size);
  assert.equal(tagSvg(id), tagSvg(`laundry-lounge:${id}`));
  assert.match(
    tagSvg(id),
    new RegExp(`viewBox="0 0 ${matrix.size + 8} ${matrix.size + 8}"`),
  );
  assert.match(tagSvg(id), /M4 4h1v1h-1z/);
  assert.throws(() => tagSvg("not-a-garment-tag"), /valid Laundry Lounge/);
});

test("first native launch persists its seed exactly once, then loads saved records", async () => {
  failReads = false;
  failWrites = false;
  const first = await loadStore();
  assert.equal(validateStore(first), true);
  assert.notEqual(await rawSavedData(), null);
  const changed = {
    ...first,
    settings: { ...first.settings, phone: "1234567890" },
  };
  await saveStore(changed);
  assert.equal((await loadStore()).settings.phone, "1234567890");
});

test("corrupt stored records are preserved and never replaced by sample data", async () => {
  await storage.write("{broken");
  await assert.rejects(loadStore, /original records are preserved/);
  assert.equal(await storage.read(), "{broken");
  await storage.write('{"version":1}');
  await assert.rejects(loadStore, /original records are preserved/);
  assert.equal(await storage.read(), '{"version":1}');
});

test("write failures reject the change and retain existing saved content", async () => {
  const original = JSON.stringify(seedStore());
  await storage.write(original);
  failWrites = true;
  await assert.rejects(() => saveStore(seedStore()), /could not save/);
  assert.equal(await storage.read(), original);
  failWrites = false;
  await assert.rejects(
    () => saveStore({ ...seedStore(), version: 2 } as never),
    /invalid data/,
  );
  assert.equal(await storage.read(), original);
});

test("read failures are visible and do not silently initialise new records", async () => {
  failReads = true;
  await assert.rejects(loadStore, /could not be accessed/);
  failReads = false;
});

test("SQLite WAL stores records larger than Android key-value entry limits", async () => {
  const large = seedStore();
  large.settings.receiptFooter = "a".repeat(3 * 1024 * 1024);
  await saveStore(large);
  assert.equal(
    (await loadStore()).settings.receiptFooter.length,
    3 * 1024 * 1024,
  );
  assert.equal(
    (db.prepare("PRAGMA journal_mode").get() as { journal_mode: string })
      .journal_mode,
    "wal",
  );
});

test("an interrupted SQLite transaction rolls back and keeps the previous valid snapshot", async () => {
  const original = seedStore();
  await saveStore(original);
  failAfterWrite = true;
  await assert.rejects(
    () =>
      saveStore({
        ...original,
        settings: { ...original.settings, phone: "changed" },
      }),
    /could not save/,
  );
  failAfterWrite = false;
  assert.deepEqual(await loadStore(), original);
});
