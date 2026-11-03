import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balance, dateLabel, getTags, getPayments, sumPaymentsInRange, initials, loadStore, money, nextOrderId, orderTotal, parseTagInput, saveStore, seedStore, STORAGE_KEY, updateTagStatus, validateStore } from '../src/domain';

test('bill totals use per-garment quantities, discounts and partial payments', () => {
  const order = seedStore().orders[0];
  assert.equal(orderTotal(order), 420);
  assert.equal(balance(order), 220);
  assert.equal(orderTotal({ ...order, discount: 20.5 }), 399.5);
  assert.equal(orderTotal({ ...order, discount: 999 }), 0);
  assert.equal(balance({ ...order, paid: 999 }), 0);
  assert.equal(orderTotal({ ...order, items: [{ ...order.items[0], quantity: 3, price: 0.1 }], discount: 0.1 }), 0.2);
});

test('order IDs advance from the maximum and never depend on order list sorting', () => {
  const orders = seedStore().orders;
  assert.equal(nextOrderId([]), 'LL-1001');
  assert.equal(nextOrderId(orders), 'LL-1049');
  assert.equal(nextOrderId([...orders].reverse()), 'LL-1049');
  assert.equal(nextOrderId([...orders, { ...orders[0], id: 'LL-9999' }]), 'LL-10000');
});

test('every garment receives a stable distinct tag, including identical garments', () => {
  const order = seedStore().orders[0];
  const tags = getTags(order);
  assert.equal(tags.length, 6);
  assert.equal(new Set(tags.map(tag => tag.id)).size, 6);
  assert.equal(tags[0].id, 'LL-1048-1-1');
  assert.equal(tags[5].id, 'LL-1048-2-2');
  assert.equal(tags[0].status, 'Received');
  assert.equal(getTags({ ...order, tagStatuses: { [tags[0].id]: 'Ready' } })[0].status, 'Ready');
});

test('tag updates advance the order only when all its garments have progressed', () => {
  const store = seedStore();
  const ids = getTags(store.orders[0]).map(tag => tag.id);
  let result = updateTagStatus(store, ids[0], 'Ready');
  assert.equal(result.orders[0].status, 'Received');
  assert.equal(getTags(result.orders[0])[0].status, 'Ready');
  assert.equal(store.orders[0].tagStatuses[ids[0]], undefined, 'updates are immutable');
  for (const id of ids.slice(1)) result = updateTagStatus(result, id, 'Processing');
  assert.equal(result.orders[0].status, 'Processing');
  for (const id of ids) result = updateTagStatus(result, id, 'Ready');
  assert.equal(result.orders[0].status, 'Ready');
  result = updateTagStatus(result, ids[0], 'Delivered');
  assert.equal(result.orders[0].status, 'Ready');
  assert.throws(() => updateTagStatus(store, 'LL-9999-1-1', 'Ready'), /not found/);
});

test('moving one garment back keeps other tag states intact', () => {
  const store = seedStore();
  const order = store.orders.find(order => order.status === 'Delivered')!;
  const tags = getTags(order);
  const result = updateTagStatus(store, tags[0].id, 'Received');
  const updated = result.orders.find(candidate => candidate.id === order.id)!;
  assert.equal(updated.status, 'Received');
  assert.equal(getTags(updated)[1].status, 'Delivered');
});

test('QR and manual tag inputs normalize to exactly one valid tag format', () => {
  assert.equal(parseTagInput(' laundry-lounge:LL-1048-1-2 '), 'LL-1048-1-2');
  assert.equal(parseTagInput('ll-1048-1-2'), 'LL-1048-1-2');
  assert.equal(parseTagInput('https://malicious.example/LL-1048-1-2'), '');
  assert.equal(parseTagInput('LL-1048'), '');
});

test('backup validator accepts seed and rejects invalid money, references, duplicates and tag states', () => {
  const store = seedStore();
  assert.equal(validateStore(store), true);
  for (const mutate of [
    (copy: typeof store) => { copy.orders[0].items[0].quantity = -1; },
    (copy: typeof store) => { copy.orders[0].items[0].quantity = 1.5; },
    (copy: typeof store) => { copy.orders[0].paid = Infinity; },
    (copy: typeof store) => { copy.orders[0].customerId = 'missing'; },
    (copy: typeof store) => { copy.orders.push(copy.orders[0]); },
    (copy: typeof store) => { copy.customers.push(copy.customers[0]); },
    (copy: typeof store) => { copy.orders[0].tagStatuses['unknown'] = 'Ready'; },
    (copy: typeof store) => { copy.orders[0].dueDate = 'invalid'; },
  ]) {
    const copy = structuredClone(store); mutate(copy); assert.equal(validateStore(copy), false);
  }
  assert.equal(validateStore(null), false);
  assert.equal(validateStore({ version: 1 }), false);
});

test('storage round trip validates persisted data and exposes storage failures', () => {
  let raw: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => raw, setItem: (key: string, value: string) => { assert.equal(key, STORAGE_KEY); raw = value; } } });
  assert.equal(validateStore(loadStore()), true);
  const store = seedStore();
  saveStore(store); assert.deepEqual(loadStore(), store);
  raw = 'not JSON'; assert.throws(() => loadStore(), /could not be read/);
  raw = '{}'; assert.throws(() => loadStore(), /invalid/);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: () => { throw new Error('quota'); } } });
  assert.throws(() => saveStore(store), /could not save/);
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

test('display helpers handle common names and Indian currency', () => {
  assert.equal(initials('  Priya Patel  '), 'PP');
  assert.equal(initials(''), '');
  assert.equal(money(123456), '₹1,23,456');
  assert.equal(dateLabel('invalid'), '—');
});


test('collections use actual payment dates even for orders created in an earlier period', () => {
  const store = seedStore();
  const order = { ...store.orders[0], createdAt: new Date(2026, 0, 1, 12).toISOString(), paid: 420, payments: [
    { id: 'p-1', amount: 200, paidAt: new Date(2026, 0, 1, 12).toISOString() },
    { id: 'p-2', amount: 150, paidAt: new Date(2026, 1, 3, 0, 5).toISOString() },
    { id: 'p-3', amount: 70, paidAt: new Date(2026, 1, 3, 23, 55).toISOString() },
  ] };
  assert.equal(sumPaymentsInRange([order], '2026-02-03', '2026-02-03'), 220);
  assert.equal(sumPaymentsInRange([order], '2026-01-01', '2026-02-03'), 420);
  assert.equal(sumPaymentsInRange([order], '2026-01-02', '2026-02-02'), 0);
  assert.equal(getPayments(order).length, 3);
});

test('legacy payment totals remain compatible and are dated to order creation', () => {
  const order = { ...seedStore().orders[0], createdAt: new Date(2026, 0, 10, 12).toISOString(), paid: 200 };
  delete order.payments;
  assert.deepEqual(getPayments(order), [{ id: `${order.id}-legacy-payment`, amount: 200, paidAt: order.createdAt }]);
  assert.equal(sumPaymentsInRange([order], '2026-01-10', '2026-01-10'), 200);
  assert.equal(getPayments({ ...order, paid: 0 }).length, 0);
  const store = seedStore(); store.orders[0] = order;
  assert.equal(validateStore(store), true);
});

test('backup validation requires payment totals to reconcile and blocks remote or SVG logos', () => {
  const store = seedStore();
  for (const mutate of [
    (copy: typeof store) => { copy.orders[0].payments![0].amount = -1; },
    (copy: typeof store) => { copy.orders[0].payments![0].amount = NaN; },
    (copy: typeof store) => { copy.orders[0].payments![0].paidAt = 'invalid'; },
    (copy: typeof store) => { copy.orders[0].payments!.push(copy.orders[0].payments![0]); },
    (copy: typeof store) => { copy.orders[0].paid += 1; },
    (copy: typeof store) => { copy.settings.logo = 'https://unknown.example/logo.png'; },
    (copy: typeof store) => { copy.settings.logo = 'data:image/svg+xml;base64,PHN2Zz4='; },
  ]) {
    const copy = structuredClone(store); mutate(copy); assert.equal(validateStore(copy), false);
  }
  store.settings.logo = 'data:image/png;base64,aGVsbG8=';
  assert.equal(validateStore(store), true);
});
