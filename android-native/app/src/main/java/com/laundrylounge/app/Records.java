package com.laundrylounge.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Currency;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Shared native business rules. No Android classes are needed to test them. */
public final class Records {
    public static final String[] STATUSES = {"Received", "Processing", "Ready", "Delivered"};
    public static final String[] SERVICES = {"Wash & Fold", "Wash & Iron", "Dry Cleaning", "Steam Iron"};
    private Records() {}

    public static JSONObject emptyStore() {
        JSONObject settings = new JSONObject();
        put(settings, "businessName", "Laundry Lounge");
        put(settings, "phone", ""); put(settings, "address", ""); put(settings, "currency", "INR");
        put(settings, "receiptFooter", "Thank you for choosing a little extra care.");
        JSONObject store = new JSONObject();
        put(store, "version", 1); put(store, "customers", new JSONArray());
        put(store, "orders", new JSONArray()); put(store, "expenses", new JSONArray()); put(store, "settings", settings);
        return store;
    }

    public static JSONObject put(JSONObject object, String key, Object value) {
        try { object.put(key, value); return object; }
        catch (Exception error) { throw new IllegalArgumentException("This record could not be updated.", error); }
    }
    public static JSONArray array(JSONObject object, String key) {
        JSONArray result = object == null ? null : object.optJSONArray(key);
        return result == null ? new JSONArray() : result;
    }
    public static JSONObject cloneObject(JSONObject object) {
        try { return new JSONObject(object.toString()); }
        catch (Exception error) { throw new IllegalArgumentException("This record is not readable.", error); }
    }
    private static JSONObject find(JSONArray records, String id) {
        for (int i = 0; i < records.length(); i++) {
            JSONObject item = records.optJSONObject(i);
            if (item != null && item.optString("id").equals(id)) return item;
        }
        return null;
    }
    public static JSONObject customer(JSONObject store, String id) { return find(array(store, "customers"), id); }
    public static JSONObject order(JSONObject store, String id) { return find(array(store, "orders"), id); }
    public static double round(double amount) {
        if (!Double.isFinite(amount)) return 0;
        return BigDecimal.valueOf(amount).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
    public static double subtotal(JSONObject order) {
        double sum = 0; JSONArray items = array(order, "items");
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null) sum += item.optInt("quantity") * item.optDouble("price", 0);
        }
        return round(sum);
    }
    public static double total(JSONObject order) { return round(Math.max(0, subtotal(order) - order.optDouble("discount", 0))); }
    public static double balance(JSONObject order) { return round(Math.max(0, total(order) - order.optDouble("paid", 0))); }
    public static int pieces(JSONObject order) {
        int result = 0; JSONArray items = array(order, "items");
        for (int i = 0; i < items.length(); i++) { JSONObject item = items.optJSONObject(i); if (item != null) result += item.optInt("quantity"); }
        return result;
    }
    public static String money(double amount) {
        NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("en", "IN"));
        format.setCurrency(Currency.getInstance("INR")); format.setMinimumFractionDigits(0); format.setMaximumFractionDigits(2);
        return format.format(round(amount));
    }
    public static String today() { return LocalDate.now().toString(); }
    public static String now() { return Instant.now().toString(); }
    public static String localDay(String value) {
        if (value == null) throw new IllegalArgumentException("Choose a valid date.");
        try {
            if (value.matches("\\d{4}-\\d{2}-\\d{2}")) return LocalDate.parse(value).toString();
            try { return Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDate().toString(); }
            catch (Exception ignored) {}
            try { return OffsetDateTime.parse(value).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate().toString(); }
            catch (Exception ignored) {}
            return LocalDateTime.parse(value).toLocalDate().toString();
        } catch (Exception error) { throw new IllegalArgumentException("Choose a valid date."); }
    }
    public static String date(String value) {
        try { return LocalDate.parse(localDay(value)).format(DateTimeFormatter.ofPattern("dd MMM", Locale.ENGLISH)); }
        catch (Exception ignored) { return "—"; }
    }
    public static String initials(String value) {
        StringBuilder result = new StringBuilder();
        for (String part : value.trim().split("\\s+")) { if (!part.isEmpty() && result.length() < 2) result.append(Character.toUpperCase(part.charAt(0))); }
        return result.toString();
    }
    public static String nextOrderId(JSONArray orders) {
        long highest = 1000;
        for (int i = 0; i < orders.length(); i++) {
            JSONObject order = orders.optJSONObject(i); if (order == null) continue;
            String id = order.optString("id");
            if (id.matches("LL-\\d{1,12}")) try { highest = Math.max(highest, Long.parseLong(id.substring(3))); } catch (NumberFormatException ignored) {}
        }
        return "LL-" + (highest + 1);
    }
    public static final class Tag {
        public final String id, orderId, garment, service, status, note;
        public final int unit, number;
        public final double rate;
        public final JSONObject item;
        private Tag(String id, JSONObject order, JSONObject item, int unit, String status) {
            this.id = id; this.orderId = order.optString("id"); this.garment = item.optString("garment");
            this.service = item.optString("service"); this.status = status; this.note = item.optString("note").isEmpty() ? order.optString("notes") : item.optString("note");
            this.unit = unit; this.number = unit; this.rate = item.optDouble("price", 0); this.item = item;
        }
    }
    public static List<Tag> tags(JSONObject order) {
        List<Tag> result = new ArrayList<>(); JSONArray items = array(order, "items");
        JSONObject states = order.optJSONObject("tagStatuses");
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i); if (item == null) continue;
            int quantity = Math.min(1000, Math.max(0, item.optInt("quantity")));
            for (int unit = 1; unit <= quantity && result.size() < 10000; unit++) {
                String id = order.optString("id") + "-" + (i + 1) + "-" + unit;
                result.add(new Tag(id, order, item, unit, states == null ? order.optString("status") : states.optString(id, order.optString("status"))));
            }
        }
        return result;
    }
    public static String parseTag(String raw) {
        if (raw == null) return "";
        String value = raw.trim().replaceFirst("(?i)^laundry-lounge:", "").toUpperCase(Locale.ROOT);
        return value.matches("LL-\\d{1,12}-\\d+-\\d+") ? value : "";
    }
    public static JSONObject updateTag(JSONObject store, String id, String status) {
        if (!Arrays.asList(STATUSES).contains(status)) throw new IllegalArgumentException("Choose a valid garment status.");
        String parsed = parseTag(id); int delimiter = parsed.indexOf('-', 3);
        if (parsed.isEmpty() || delimiter < 0) throw new IllegalArgumentException("This garment tag was not found.");
        JSONObject next = cloneObject(store); JSONObject order = order(next, parsed.substring(0, delimiter));
        if (order == null) throw new IllegalArgumentException("This garment tag was not found.");
        List<Tag> all = tags(order); boolean found = false; JSONObject statuses = new JSONObject(); int minimum = STATUSES.length - 1;
        for (Tag tag : all) {
            String state = tag.id.equals(parsed) ? status : tag.status;
            if (tag.id.equals(parsed)) found = true;
            put(statuses, tag.id, state); minimum = Math.min(minimum, Arrays.asList(STATUSES).indexOf(state));
        }
        if (!found) throw new IllegalArgumentException("This garment tag was not found.");
        put(order, "tagStatuses", statuses); put(order, "status", STATUSES[Math.max(0, minimum)]);
        return next;
    }
    public static JSONArray payments(JSONObject order) {
        if (order.optJSONArray("payments") != null) return order.optJSONArray("payments");
        JSONArray result = new JSONArray();
        if (order.optDouble("paid", 0) > 0) {
            JSONObject payment = new JSONObject(); put(payment, "id", order.optString("id") + "-legacy-payment");
            put(payment, "amount", order.optDouble("paid")); put(payment, "paidAt", order.optString("createdAt")); result.put(payment);
        }
        return result;
    }
    public static double collected(JSONObject store, String from, String to) {
        if (!validDate(from) || !validDate(to) || from.compareTo(to) > 0) return 0;
        double sum = 0; JSONArray orders = array(store, "orders");
        for (int i = 0; i < orders.length(); i++) {
            JSONObject order = orders.optJSONObject(i); if (order == null) continue;
            JSONArray payments = payments(order);
            for (int p = 0; p < payments.length(); p++) {
                JSONObject payment = payments.optJSONObject(p); if (payment == null) continue;
                try { String day = localDay(payment.optString("paidAt")); if (day.compareTo(from) >= 0 && day.compareTo(to) <= 0) sum += payment.optDouble("amount", 0); }
                catch (Exception ignored) {}
            }
        }
        return round(sum);
    }

    private static boolean text(Object value) { return value instanceof String && !((String) value).trim().isEmpty(); }
    private static boolean string(Object value) { return value instanceof String; }
    private static boolean optionalString(JSONObject object, String key) { return !object.has(key) || string(object.opt(key)); }
    private static boolean amount(Object value) { return value instanceof Number && Double.isFinite(((Number) value).doubleValue()) && ((Number) value).doubleValue() >= 0 && ((Number) value).doubleValue() <= 1_000_000_000; }
    private static boolean validDate(Object value) { if (!(value instanceof String)) return false; try { localDay((String) value); return true; } catch (Exception ignored) { return false; } }
    private static boolean unique(JSONArray values) {
        Set<String> ids = new HashSet<>();
        for (int i = 0; i < values.length(); i++) { JSONObject object = values.optJSONObject(i); if (object == null || !text(object.opt("id")) || !ids.add(object.optString("id"))) return false; }
        return true;
    }
    public static boolean validate(JSONObject store) {
        try {
            if (store == null || !(store.opt("version") instanceof Number) || store.optDouble("version") != 1 || !(store.opt("customers") instanceof JSONArray) || !(store.opt("orders") instanceof JSONArray) || !(store.opt("expenses") instanceof JSONArray) || !(store.opt("settings") instanceof JSONObject)) return false;
            JSONArray customers = array(store, "customers"), orders = array(store, "orders"), expenses = array(store, "expenses");
            if (customers.length() > 100000 || orders.length() > 100000 || expenses.length() > 100000 || !unique(customers) || !unique(orders) || !unique(expenses)) return false;
            Set<String> customerIds = new HashSet<>();
            for (int i = 0; i < customers.length(); i++) {
                JSONObject customer = customers.optJSONObject(i);
                if (customer.toString().length() > 100000) return false;
                if (!text(customer.opt("name")) || !string(customer.opt("phone")) || !optionalString(customer, "email") || !optionalString(customer, "address")) return false;
                customerIds.add(customer.optString("id"));
            }
            for (int i = 0; i < orders.length(); i++) {
                JSONObject order = orders.optJSONObject(i); JSONArray items = order.optJSONArray("items"); JSONObject statuses = order.optJSONObject("tagStatuses");
                if (!order.optString("id").matches("LL-\\d{1,12}") || !customerIds.contains(order.optString("customerId")) || items == null || items.length() == 0 || !unique(items) || statuses == null || !Arrays.asList(STATUSES).contains(order.opt("status")) || !validDate(order.opt("createdAt")) || !validDate(order.opt("dueDate")) || !amount(order.opt("paid")) || !amount(order.opt("discount")) || !(order.opt("express") instanceof Boolean) || !string(order.opt("notes"))) return false;
                int pieces = 0;
                for (int j = 0; j < items.length(); j++) {
                    JSONObject item = items.optJSONObject(j); Object quantity = item.opt("quantity");
                    if (!text(item.opt("garment")) || !Arrays.asList(SERVICES).contains(item.opt("service")) || !(quantity instanceof Number) || ((Number) quantity).doubleValue() != item.optInt("quantity") || item.optInt("quantity") < 1 || item.optInt("quantity") > 1000 || !amount(item.opt("price")) || !optionalString(item, "note")) return false;
                    pieces += item.optInt("quantity");
                }
                if (order.toString().length() > 500_000 || pieces > 10000 || order.optDouble("discount") > subtotal(order) + .0001 || order.optDouble("paid") > total(order) + .0001) return false;
                if (order.has("payments")) {
                    JSONArray payments = order.optJSONArray("payments"); if (payments == null || !unique(payments)) return false;
                    double sum = 0;
                    for (int p = 0; p < payments.length(); p++) { JSONObject payment = payments.optJSONObject(p); if (!amount(payment.opt("amount")) || !validDate(payment.opt("paidAt"))) return false; sum += payment.optDouble("amount"); }
                    if (round(sum) != round(order.optDouble("paid"))) return false;
                }
                Set<String> tagIds = new HashSet<>(); for (Tag tag : tags(order)) tagIds.add(tag.id);
                Iterator<String> keys = statuses.keys(); while (keys.hasNext()) { String key = keys.next(); if (!tagIds.contains(key) || !Arrays.asList(STATUSES).contains(statuses.opt(key))) return false; }
            }
            for (int i = 0; i < expenses.length(); i++) { JSONObject expense = expenses.optJSONObject(i); if (expense.toString().length() > 100000 || !text(expense.opt("title")) || !text(expense.opt("category")) || !amount(expense.opt("amount")) || !validDate(expense.opt("date"))) return false; }
            JSONObject settings = store.optJSONObject("settings");
            if (settings.optString("businessName").length() > 200 || settings.optString("phone").length() > 64 || settings.optString("address").length() > 10000 || settings.optString("receiptFooter").length() > 5000) return false;
            if (!text(settings.opt("businessName")) || !string(settings.opt("phone")) || !string(settings.opt("address")) || !"INR".equals(settings.opt("currency")) || !string(settings.opt("receiptFooter")) || !optionalString(settings, "logo")) return false;
            JSONObject plainSettings = cloneObject(settings); plainSettings.remove("logo");
            if (plainSettings.toString().length() > 100000) return false;
            if (settings.has("logo")) { String logo = settings.optString("logo"); if (logo.length() > 8_000_000 || !logo.matches("data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}")) return false; }
            return true;
        } catch (Exception ignored) { return false; }
    }
}
