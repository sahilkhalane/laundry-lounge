package com.laundrylounge.app;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.util.HashSet;
import static org.junit.Assert.*;

public class RecordsTest {
    private JSONObject sample() {
        JSONObject store = Records.emptyStore();
        JSONObject customer = new JSONObject();
        Records.put(customer, "id", "c1"); Records.put(customer, "name", "Aarav Sharma"); Records.put(customer, "phone", "9876543210");
        Records.array(store, "customers").put(customer);
        JSONObject item = new JSONObject();
        Records.put(item, "id", "i1"); Records.put(item, "garment", "Shirt"); Records.put(item, "service", "Wash & Iron"); Records.put(item, "quantity", 3); Records.put(item, "price", 60.50);
        JSONObject order = new JSONObject();
        Records.put(order, "id", "LL-1001"); Records.put(order, "customerId", "c1"); Records.put(order, "items", new JSONArray().put(item));
        Records.put(order, "createdAt", "2026-01-01T12:00:00Z"); Records.put(order, "dueDate", "2026-01-03"); Records.put(order, "status", "Received");
        Records.put(order, "paid", 20.50); Records.put(order, "discount", 10.00); Records.put(order, "express", false); Records.put(order, "notes", "Delicate collar"); Records.put(order, "tagStatuses", new JSONObject());
        JSONObject payment = new JSONObject(); Records.put(payment, "id", "p1"); Records.put(payment, "amount", 20.50); Records.put(payment, "paidAt", "2026-01-02T12:00:00Z");
        Records.put(order, "payments", new JSONArray().put(payment));
        Records.array(store, "orders").put(order); return store;
    }
    @Test public void emptyBusinessStoreIsValidAndHasNoFictionalRecords() {
        JSONObject store = Records.emptyStore(); assertTrue(Records.validate(store));
        assertEquals(0, Records.array(store, "customers").length()); assertEquals(0, Records.array(store, "orders").length());
    }
    @Test public void quantitiesRatesDiscountsAndPartialPaymentsReconcile() {
        JSONObject store = sample(); JSONObject order = Records.order(store, "LL-1001");
        assertTrue(Records.validate(store)); assertEquals(181.50, Records.subtotal(order), .0001);
        assertEquals(171.50, Records.total(order), .0001); assertEquals(151.00, Records.balance(order), .0001);
        assertEquals(3, Records.pieces(order));
    }
    @Test public void garmentTagsAreStableUniqueAndIncludeCareInstructions() {
        JSONObject order = Records.order(sample(), "LL-1001");
        assertEquals(3, Records.tags(order).size()); HashSet<String> ids = new HashSet<>();
        for (Records.Tag tag : Records.tags(order)) { assertTrue(ids.add(tag.id)); assertEquals("Delicate collar", tag.note); }
        assertEquals("LL-1001-1-1", Records.tags(order).get(0).id); assertEquals(3, Records.tags(order).get(2).unit);
    }
    @Test public void qrAndPrintedCodesNormalizeButOtherQrDataIsRejected() {
        assertEquals("LL-1001-1-3", Records.parseTag(" laundry-lounge:ll-1001-1-3 "));
        assertEquals("LL-1001-1-1", Records.parseTag("LAUNDRY-LOUNGE:LL-1001-1-1"));
        assertEquals("", Records.parseTag("https://example.com/LL-1001-1-1"));
        assertEquals("", Records.parseTag("LL-1001"));
    }
    @Test public void anOrderProgressesOnlyWhenEveryGarmentHasReachedAStage() {
        JSONObject original = sample(); JSONObject next = Records.updateTag(original, "LL-1001-1-1", "Ready");
        assertEquals("Received", Records.order(next, "LL-1001").optString("status"));
        assertEquals("Received", Records.order(original, "LL-1001").optString("status"));
        next = Records.updateTag(next, "LL-1001-1-2", "Ready"); next = Records.updateTag(next, "LL-1001-1-3", "Ready");
        assertEquals("Ready", Records.order(next, "LL-1001").optString("status"));
        next = Records.updateTag(next, "LL-1001-1-2", "Processing");
        assertEquals("Processing", Records.order(next, "LL-1001").optString("status"));
        assertEquals("Ready", Records.tags(Records.order(next, "LL-1001")).get(0).status);
        assertTrue(Records.validate(next));
    }
    @Test(expected=IllegalArgumentException.class) public void nonexistentTagsCannotChangeAnOrder() { Records.updateTag(sample(), "LL-9999-1-1", "Ready"); }
    @Test public void collectionsUseActualPaymentDateRatherThanOrderCreation() {
        JSONObject store = sample(); assertEquals(0, Records.collected(store, "2026-01-01", "2026-01-01"), .0001);
        assertEquals(20.50, Records.collected(store, "2026-01-02", "2026-01-02"), .0001);
        assertEquals(20.50, Records.collected(store, "2026-01-01", "2026-01-31"), .0001);
        Records.order(store, "LL-1001").remove("payments");
        assertEquals(20.50, Records.collected(store, "2026-01-01", "2026-01-01"), .0001);
    }
    @Test public void numberingUsesHighestOrderIdInsteadOfArrayPosition() {
        JSONObject store = sample(); JSONArray orders = Records.array(store, "orders");
        JSONObject high = Records.cloneObject(orders.optJSONObject(0)); Records.put(high, "id", "LL-1050"); orders.put(high);
        assertEquals("LL-1051", Records.nextOrderId(orders)); assertEquals("LL-1001", Records.nextOrderId(new JSONArray()));
    }
    @Test public void invalidBackupReferencesAndDuplicateIdsAreRejected() {
        JSONObject store = sample(); Records.put(Records.order(store, "LL-1001"), "customerId", "missing"); assertFalse(Records.validate(store));
        store = sample(); Records.array(store, "customers").put(Records.cloneObject(Records.array(store, "customers").optJSONObject(0))); assertFalse(Records.validate(store));
        store = sample(); Records.put(Records.order(store, "LL-1001"), "paid", -1); assertFalse(Records.validate(store));
    }
    @Test public void invalidPaymentsTagsDatesAndLogosAreRejected() {
        JSONObject store = sample(); Records.put(Records.order(store, "LL-1001"), "paid", 25); assertFalse(Records.validate(store));
        store = sample(); Records.put(Records.order(store, "LL-1001").optJSONObject("tagStatuses"), "LL-1001-8-9", "Ready"); assertFalse(Records.validate(store));
        store = sample(); Records.put(Records.order(store, "LL-1001"), "dueDate", "2026-02-31"); assertFalse(Records.validate(store));
        store = sample(); Records.put(store.optJSONObject("settings"), "logo", "https://example.com/logo.png"); assertFalse(Records.validate(store));
        store = sample(); Records.put(store.optJSONObject("settings"), "logo", "data:image/svg+xml;base64,AAAA"); assertFalse(Records.validate(store));
    }
    @Test public void invalidLargeOrFractionalQuantitiesCannotCreateUnboundedTags() {
        JSONObject store = sample(); JSONObject item = Records.array(Records.order(store, "LL-1001"), "items").optJSONObject(0);
        Records.put(item, "quantity", 2.5); assertFalse(Records.validate(store));
        Records.put(item, "quantity", Integer.MAX_VALUE); assertFalse(Records.validate(store));
    }
    @Test public void overpaymentsAndDiscountsBeyondSubtotalAreRejected() {
        JSONObject store = sample(); Records.put(Records.order(store, "LL-1001"), "discount", 1000); assertFalse(Records.validate(store));
        store = sample(); JSONObject order = Records.order(store, "LL-1001"); order.remove("payments"); Records.put(order, "paid", 200); assertFalse(Records.validate(store));
    }
}
