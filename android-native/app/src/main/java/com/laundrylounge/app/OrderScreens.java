package com.laundrylounge.app;

import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Native Android order browsing, billing wizard and order actions. */
public final class OrderScreens {
    private static final int INK = Color.rgb(36, 63, 56);
    private static final int MUTED = Color.rgb(99, 125, 111);
    private static final int TEAL = Color.rgb(0, 139, 128);
    private static final int BORDER = Color.rgb(224, 234, 228);
    private static final int BG = Color.rgb(245, 248, 246);
    private static final int RED = Color.rgb(178, 69, 58);
    private static final String[] STATUS = {"Received", "Processing", "Ready", "Delivered"};
    private static final String[] SERVICES = {"Wash & Fold", "Wash & Iron", "Dry Cleaning", "Steam Iron"};
    private static final double[] DEFAULT_RATES = {40, 60, 150, 20};

    private OrderScreens() { }

    public static View orders(MainActivity host) {
        LinearLayout page = column(host, 20);
        page.addView(text(host, "Orders.", 28, INK, true));
        page.addView(text(host, "From the first drop-off to the final pickup.", 13, MUTED, false));
        gap(page, 16);
        page.addView(button(host, "+  New order", host::newOrder, false));
        gap(page, 18);
        EditText search = edit(host, "Name, phone or order number", "", InputType.TYPE_CLASS_TEXT);
        page.addView(search);
        String[] filters = {"All orders", "Received", "Processing", "Ready", "Delivered"};
        Spinner filter = spinner(host, filters, 0);
        page.addView(filter);
        LinearLayout list = column(host, 0);
        page.addView(list);
        Runnable render = () -> {
            list.removeAllViews();
            JSONObject store = host.snapshot();
            JSONArray orders = Records.array(store, "orders");
            String query = search.getText().toString().trim().toLowerCase(Locale.ROOT);
            String state = String.valueOf(filter.getSelectedItem());
            int matches = 0;
            for (int i = 0; i < orders.length(); i++) {
                JSONObject order = orders.optJSONObject(i);
                if (order == null) continue;
                JSONObject customer = Records.customer(store, order.optString("customerId"));
                String name = customer == null ? "Customer" : customer.optString("name");
                String phone = customer == null ? "" : customer.optString("phone");
                String haystack = (order.optString("id") + " " + name + " " + phone).toLowerCase(Locale.ROOT);
                if (!haystack.contains(query) || (!state.equals("All orders") && !state.equals(order.optString("status")))) continue;
                matches++;
                LinearLayout card = card(host);
                LinearLayout line = row(host);
                TextView person = text(host, name, 16, INK, true);
                line.addView(person, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
                line.addView(badge(host, order.optString("status")));
                card.addView(line);
                card.addView(text(host, "#" + order.optString("id") + " · " + count(order) + " garments", 12, MUTED, false));
                gap(card, 12);
                LinearLayout summary = row(host);
                JSONObject first = Records.array(order, "items").optJSONObject(0);
                String service = first == null ? "Laundry service" : first.optString("service");
                TextView due = text(host, service + "\nDue " + Records.date(order.optString("dueDate")), 12, MUTED, false);
                summary.addView(due, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
                TextView amount = text(host, Records.money(Records.total(order)) + "\n" + (Records.balance(order) > 0 ? "Payment due" : "Paid"), 14, INK, true);
                amount.setGravity(Gravity.END);
                summary.addView(amount);
                card.addView(summary);
                card.setContentDescription("Open " + order.optString("id") + " for " + name);
                card.setOnClickListener(v -> host.openOrder(order.optString("id")));
                list.addView(card);
                gap(list, 12);
            }
            if (matches == 0) {
                list.addView(text(host, "No orders here yet", 18, INK, true));
                list.addView(text(host, query.isEmpty() ? "Create an order to generate its bill and garment tags." : "Try another name, phone number or order ID.", 13, MUTED, false));
            }
        };
        watch(search, render);
        filter.setOnItemSelectedListener(selection(render));
        render.run();
        return scroll(host, page);
    }

    public static void showNew(MainActivity host) { new Wizard(host).show(); }
    public static void showDetail(MainActivity host, String id) { new Detail(host, id).show(); }

    private static final class ItemDraft {
        final String id = UUID.randomUUID().toString();
        String garment = "Shirt";
        String service = "Wash & Iron";
        String quantity = "1";
        String rate = "60";
    }

    private static final class Wizard {
        final MainActivity host;
        final Dialog dialog;
        final LinearLayout content;
        final LinearLayout footer;
        final TextView error;
        final TextView liveTotal;
        final List<ItemDraft> items = new ArrayList<>();
        int step;
        String customerId;
        boolean newCustomer;
        String name = "";
        String phone = "";
        String due = LocalDate.now().plusDays(2).toString();
        String notes = "";
        String discount = "0";
        String paid = "0";
        boolean express;
        boolean saving;

        Wizard(MainActivity host) {
            this.host = host;
            JSONArray customers = Records.array(host.snapshot(), "customers");
            JSONObject first = customers.optJSONObject(0);
            newCustomer = first == null;
            customerId = first == null ? "" : first.optString("id");
            items.add(new ItemDraft());
            dialog = fullDialog(host, "New order");
            LinearLayout shell = (LinearLayout) dialog.findViewById(android.R.id.content).getTag();
            error = text(host, "", 13, RED, false);
            content = column(host, 20);
            ScrollView scroll = scroll(host, content);
            shell.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
            footer = row(host); footer.setPadding(dp(host, 16), dp(host, 12), dp(host, 16), dp(host, 12));
            footer.setBackgroundColor(Color.WHITE);
            shell.addView(footer);
            liveTotal = text(host, "", 16, TEAL, true);
            dialog.setOnCancelListener(d -> { if (saving) dialog.show(); });
        }
        void show() { render(); dialog.show(); sizeDialog(dialog); }
        void render() {
            content.removeAllViews(); footer.removeAllViews();
            TextView steps = text(host, "1. Customer    →    2. Garments    →    3. Bill", 11, TEAL, true);
            content.addView(steps); gap(content, 18);
            content.addView(error); error.setText("");
            if (step == 0) customerStep(); else if (step == 1) garmentsStep(); else reviewStep();
            Button back = button(host, step == 0 ? "Cancel" : "Back", () -> {
                if (saving) return;
                if (step == 0) dialog.dismiss(); else { step--; render(); }
            }, true);
            footer.addView(back, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            liveTotal.setGravity(Gravity.CENTER);
            footer.addView(liveTotal, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            footer.addView(button(host, step == 2 ? "Create order" : "Continue", this::next, false), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            total();
        }
        void customerStep() {
            content.addView(text(host, "Who are we caring for?", 24, INK, true));
            content.addView(text(host, "Choose a customer or add someone new.", 13, MUTED, false)); gap(content, 16);
            JSONArray customers = Records.array(host.snapshot(), "customers");
            String[] options = new String[customers.length() + 1];
            int chosen = customers.length();
            for (int i = 0; i < customers.length(); i++) {
                JSONObject c = customers.optJSONObject(i);
                options[i] = c.optString("name") + " · " + c.optString("phone");
                if (!newCustomer && c.optString("id").equals(customerId)) chosen = i;
            }
            options[customers.length()] = "+ Add a new customer";
            Spinner pick = spinner(host, options, chosen);
            content.addView(pick);
            pick.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                    boolean wantNew = position == customers.length();
                    String nextId = wantNew ? "" : customers.optJSONObject(position).optString("id");
                    if (wantNew != newCustomer || !nextId.equals(customerId)) {
                        newCustomer = wantNew; customerId = nextId; render();
                    }
                }
                @Override public void onNothingSelected(AdapterView<?> parent) { }
            });
            if (newCustomer) {
                field(content, "Customer name", name, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS, value -> name = value);
                field(content, "Phone number", phone, InputType.TYPE_CLASS_PHONE, value -> phone = value);
            } else {
                JSONObject customer = Records.customer(host.snapshot(), customerId);
                if (customer != null) {
                    LinearLayout info = card(host);
                    info.addView(text(host, customer.optString("name"), 18, INK, true));
                    info.addView(text(host, customer.optString("phone"), 14, MUTED, false));
                    if (!customer.optString("address").isEmpty()) info.addView(text(host, customer.optString("address"), 13, MUTED, false));
                    content.addView(info);
                }
            }
            gap(content, 14);
            content.addView(text(host, "The customer’s number is used for WhatsApp bill sharing and collection updates.", 12, MUTED, false));
        }
        void garmentsStep() {
            content.addView(text(host, "Garments & care", 24, INK, true));
            content.addView(text(host, "Every piece gets its own QR tag.", 13, MUTED, false)); gap(content, 14);
            for (int index = 0; index < items.size(); index++) {
                ItemDraft item = items.get(index);
                LinearLayout itemCard = card(host);
                LinearLayout header = row(host);
                header.addView(text(host, "Item " + (index + 1), 15, INK, true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
                if (items.size() > 1) header.addView(button(host, "Remove", () -> { items.remove(item); render(); }, true), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
                itemCard.addView(header);
                field(itemCard, "Garment", item.garment, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS, value -> item.garment = value);
                label(itemCard, "Service");
                Spinner service = spinner(host, SERVICES, indexOf(SERVICES, item.service));
                itemCard.addView(service);
                service.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                    @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                        if (!SERVICES[position].equals(item.service)) { item.service = SERVICES[position]; item.rate = plain(DEFAULT_RATES[position]); render(); }
                    }
                    @Override public void onNothingSelected(AdapterView<?> parent) { }
                });
                field(itemCard, "Quantity", item.quantity, InputType.TYPE_CLASS_NUMBER, value -> { item.quantity = value; total(); });
                field(itemCard, "Rate per piece (₹)", item.rate, InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL, value -> { item.rate = value; total(); });
                content.addView(itemCard); gap(content, 12);
            }
            content.addView(button(host, "+ Add garment", () -> { items.add(new ItemDraft()); render(); }, true)); gap(content, 18);
            label(content, "Collection date");
            content.addView(button(host, Records.date(due), () -> {
                LocalDate selected = LocalDate.parse(due);
                DatePickerDialog datePicker = new DatePickerDialog(host, (view, year, month, day) -> { due = LocalDate.of(year, month + 1, day).toString(); render(); }, selected.getYear(), selected.getMonthValue() - 1, selected.getDayOfMonth());
                datePicker.getDatePicker().setMinDate(LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli());
                datePicker.show();
            }, true));
            CheckBox check = new CheckBox(host); check.setText("Express order · no extra fee"); check.setTextColor(INK); check.setChecked(express); check.setPadding(0, dp(host, 12), 0, dp(host, 12));
            check.setOnCheckedChangeListener((button, checked) -> express = checked); content.addView(check);
            EditText care = field(content, "Care instructions (optional)", notes, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES, value -> notes = value); care.setMinLines(2);
        }
        void reviewStep() {
            content.addView(text(host, "Review & bill", 24, INK, true));
            JSONObject current = host.snapshot();
            JSONObject customer = Records.customer(current, customerId);
            content.addView(text(host, newCustomer ? name.trim() : customer == null ? "Customer" : customer.optString("name"), 16, INK, true));
            content.addView(text(host, "Collection " + Records.date(due) + (express ? " · Express" : ""), 13, MUTED, false)); gap(content, 16);
            LinearLayout summary = card(host);
            for (ItemDraft item : items) {
                summary.addView(text(host, item.quantity + " × " + item.garment + " · " + Records.money(number(item.quantity) * number(item.rate)), 14, INK, true));
                summary.addView(text(host, item.service + " · " + Records.money(number(item.rate)) + " each", 12, MUTED, false)); gap(summary, 12);
            }
            content.addView(summary); gap(content, 14);
            field(content, "Discount (₹)", discount, InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL, value -> { discount = value; total(); });
            field(content, "Payment received (₹)", paid, InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL, value -> { paid = value; total(); });
            TextView bill = text(host, "", 16, INK, true); bill.setTag("bill-summary"); content.addView(bill);
            gap(content, 18); content.addView(text(host, "Creating this order saves its bill and one unique garment tag per piece. You can print or share them from the order.", 12, MUTED, false));
        }
        void total() {
            double subtotal = subtotal();
            double bill = round(Math.max(0, subtotal - number(discount)));
            liveTotal.setText(Records.money(bill));
            TextView summary = content.findViewWithTag("bill-summary");
            if (summary != null) summary.setText("Subtotal: " + Records.money(subtotal) + "\nBill total: " + Records.money(bill) + "\nBalance due: " + Records.money(Math.max(0, bill - number(paid))));
        }
        double subtotal() { double total = 0; for (ItemDraft item : items) total += number(item.quantity) * number(item.rate); return round(total); }
        String validate(int stage) {
            if (stage == 0) {
                if (newCustomer) {
                    if (name.trim().length() < 2 || name.trim().length() > 100) return "Enter a customer name with 2–100 characters.";
                    String digits = phone.replaceAll("\\D", "");
                    if (!phone.trim().matches("\\+?[\\d\\s()\\-]{10,20}") || digits.length() < 10 || digits.length() > 15) return "Enter a phone number with 10–15 digits.";
                    JSONArray customers = Records.array(host.snapshot(), "customers");
                    for (int i = 0; i < customers.length(); i++) if (canonical(customers.optJSONObject(i).optString("phone")).equals(canonical(phone))) return "That phone number belongs to an existing customer. Select that customer instead.";
                } else if (Records.customer(host.snapshot(), customerId) == null) return "Select a customer.";
            }
            if (stage == 1) {
                int pieces = 0;
                if (items.isEmpty()) return "Add at least one garment.";
                for (ItemDraft item : items) {
                    if (item.garment.trim().isEmpty()) return "Enter the garment name for each item.";
                    if (!item.quantity.matches("\\d{1,3}")) return "Quantities must be whole numbers from 1–999.";
                    int quantity = Integer.parseInt(item.quantity);
                    if (quantity < 1 || quantity > 999) return "Quantities must be whole numbers from 1–999.";
                    if (!validMoney(item.rate) || number(item.rate) > 100000) return "Enter a valid rate, up to ₹100,000, with at most two decimal places.";
                    pieces += quantity;
                }
                if (pieces > 10000) return "An order can contain up to 10,000 garment tags. Split larger batches into separate orders.";
                try { if (LocalDate.parse(due).isBefore(LocalDate.now())) return "Collection date must be today or later."; }
                catch (Exception e) { return "Choose a valid collection date."; }
            }
            if (stage == 2) {
                if (!validMoney(discount) || number(discount) > subtotal()) return "Discount must be between zero and the subtotal.";
                if (!validMoney(paid) || number(paid) > round(Math.max(0, subtotal() - number(discount)))) return "Payment must be between zero and the bill total.";
            }
            return "";
        }
        void next() {
            if (saving) return;
            String issue = validate(step);
            if (!issue.isEmpty()) { error.setText(issue); content.getParent().requestChildFocus(error, error); return; }
            if (step < 2) { step++; render(); return; }
            for (int i = 0; i < 3; i++) { issue = validate(i); if (!issue.isEmpty()) { step = i; render(); error.setText(issue); return; } }
            saving = true;
            try {
                JSONObject next = host.snapshot();
                String chosen = customerId;
                if (newCustomer) {
                    chosen = UUID.randomUUID().toString();
                    JSONObject customer = object("id", chosen, "name", name.trim(), "phone", phone.trim());
                    Records.array(next, "customers").put(customer);
                }
                JSONArray rows = new JSONArray();
                for (ItemDraft item : items) rows.put(object("id", item.id, "garment", item.garment.trim(), "service", item.service, "quantity", Integer.parseInt(item.quantity), "price", round(number(item.rate))));
                String created = Instant.now().toString();
                String id = Records.nextOrderId(Records.array(next, "orders"));
                double initialPayment = round(number(paid));
                JSONArray payments = new JSONArray();
                if (initialPayment > 0) payments.put(object("id", UUID.randomUUID().toString(), "amount", initialPayment, "paidAt", created));
                JSONObject order = object("id", id, "customerId", chosen, "items", rows, "createdAt", created, "dueDate", due, "status", "Received", "paid", initialPayment, "payments", payments, "discount", round(number(discount)), "express", express, "notes", notes.trim(), "tagStatuses", new JSONObject());
                JSONArray orders = new JSONArray(); orders.put(order);
                JSONArray old = Records.array(next, "orders"); for (int i = 0; i < old.length(); i++) orders.put(old.optJSONObject(i));
                put(next, "orders", orders);
                if (host.save(next)) { dialog.dismiss(); host.openOrder(id); }
                else error.setText("The order could not be saved. Your form has been kept.");
            } catch (Exception e) { error.setText(message(e)); }
            finally { saving = false; }
        }
    }

    private static final class Detail {
        final MainActivity host;
        final String id;
        final Dialog dialog;
        final LinearLayout content;
        boolean saving;
        Detail(MainActivity host, String id) {
            this.host = host; this.id = id; dialog = fullDialog(host, "Order details");
            LinearLayout shell = (LinearLayout) dialog.findViewById(android.R.id.content).getTag();
            content = column(host, 20); shell.addView(scroll(host, content), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        }
        void show() { render(); dialog.show(); sizeDialog(dialog); }
        void render() {
            content.removeAllViews(); JSONObject store = host.snapshot(); JSONObject order = Records.order(store, id);
            if (order == null) { dialog.dismiss(); return; }
            JSONObject customer = Records.customer(store, order.optString("customerId"));
            content.addView(text(host, "#" + id, 25, INK, true));
            content.addView(badge(host, order.optString("status"))); gap(content, 15);
            content.addView(text(host, customer == null ? "Customer" : customer.optString("name"), 19, INK, true));
            if (customer != null) content.addView(text(host, customer.optString("phone"), 14, MUTED, false));
            content.addView(text(host, "Collection " + Records.date(order.optString("dueDate")) + (order.optBoolean("express") ? " · Express" : ""), 13, MUTED, false)); gap(content, 18);
            LinearLayout bill = card(host);
            JSONArray items = Records.array(order, "items");
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                bill.addView(text(host, item.optInt("quantity") + " × " + item.optString("garment") + "   " + Records.money(item.optInt("quantity") * item.optDouble("price")), 14, INK, true));
                bill.addView(text(host, item.optString("service") + " · " + Records.money(item.optDouble("price")) + " each", 12, MUTED, false)); gap(bill, 12);
            }
            bill.addView(text(host, "Bill total   " + Records.money(Records.total(order)), 19, INK, true));
            if (order.optDouble("discount") > 0) bill.addView(text(host, "Discount   " + Records.money(order.optDouble("discount")), 13, MUTED, false));
            bill.addView(text(host, "Paid   " + Records.money(order.optDouble("paid")), 14, MUTED, false));
            bill.addView(text(host, "Balance due   " + Records.money(Records.balance(order)), 17, TEAL, true)); content.addView(bill);
            if (!order.optString("notes").isEmpty()) { gap(content, 14); content.addView(text(host, "Care instructions: " + order.optString("notes"), 13, MUTED, false)); }
            gap(content, 20); label(content, "Update every garment");
            Spinner state = spinner(host, STATUS, indexOf(STATUS, order.optString("status"))); content.addView(state);
            content.addView(button(host, "Update all garments", () -> {
                if (saving) return;
                saving = true;
                try {
                    JSONObject next = host.snapshot(); JSONObject current = Records.order(next, id);
                    if (current == null) throw new IllegalArgumentException("Order no longer exists.");
                    String status = String.valueOf(state.getSelectedItem());
                    JSONObject tags = new JSONObject();
                    for (Records.Tag tag : Records.tags(current)) put(tags, tag.id, status);
                    put(current, "status", status); put(current, "tagStatuses", tags);
                    if (host.save(next)) render();
                } catch (Exception e) { host.error(message(e)); }
                finally { saving = false; }
            }, true));
            content.addView(text(host, "This updates all pieces. Scan a tag to change just one garment.", 12, MUTED, false));
            if (Records.balance(order) > 0) {
                gap(content, 20); label(content, "Record payment (₹)");
                EditText payment = edit(host, "Up to " + plain(Records.balance(order)), "", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL); content.addView(payment);
                content.addView(button(host, "Add payment", () -> {
                    if (saving) return;
                    saving = true;
                    try {
                        String input = payment.getText().toString().trim();
                        JSONObject next = host.snapshot(); JSONObject current = Records.order(next, id);
                        if (current == null) throw new IllegalArgumentException("Order no longer exists.");
                        if (!validMoney(input) || number(input) <= 0 || number(input) > Records.balance(current)) throw new IllegalArgumentException("Enter a positive payment up to the outstanding balance.");
                        JSONArray ledger = current.optJSONArray("payments");
                        if (ledger == null) { ledger = new JSONArray(); if (current.optDouble("paid") > 0) ledger.put(object("id", UUID.randomUUID().toString(), "amount", current.optDouble("paid"), "paidAt", current.optString("createdAt"))); }
                        double value = round(number(input));
                        ledger.put(object("id", UUID.randomUUID().toString(), "amount", value, "paidAt", Instant.now().toString()));
                        put(current, "payments", ledger); put(current, "paid", round(current.optDouble("paid") + value));
                        if (host.save(next)) render();
                    } catch (Exception e) { host.error(message(e)); }
                    finally { saving = false; }
                }, false));
            }
            gap(content, 22);
            content.addView(action(host, "Print bill", () -> PrintHelper.print(host, host.snapshot(), requireOrder(), false)));
            content.addView(action(host, "Print garment tags", () -> PrintHelper.print(host, host.snapshot(), requireOrder(), true)));
            content.addView(action(host, "Share PDF bill", () -> PrintHelper.shareBill(host, host.snapshot(), requireOrder())));
            content.addView(action(host, "Share on WhatsApp", () -> PrintHelper.whatsapp(host, host.snapshot(), requireOrder())));
            gap(content, 20);
            List<Records.Tag> tags = Records.tags(order);
            content.addView(text(host, tags.size() + " individual garment tags", 17, INK, true));
            for (int i = 0; i < Math.min(tags.size(), 6); i++) {
                Records.Tag tag = tags.get(i);
                content.addView(text(host, tag.id + "\n" + tag.garment + " · " + tag.status, 12, MUTED, false)); gap(content, 9);
            }
            if (tags.size() > 6) content.addView(text(host, "+ " + (tags.size() - 6) + " more tags · use Print garment tags for all pieces.", 12, MUTED, false));
        }
        JSONObject requireOrder() {
            JSONObject order = Records.order(host.snapshot(), id);
            if (order == null) throw new IllegalArgumentException("Order no longer exists.");
            return order;
        }
    }

    private interface TextValue { void changed(String value); }
    private interface CheckedAction { void run() throws Exception; }
    private static Button action(MainActivity host, String label, CheckedAction task) {
        Button result = button(host, label, () -> { try { task.run(); } catch (Exception e) { host.error(message(e)); } }, true);
        return result;
    }
    private static int count(JSONObject order) { int count = 0; JSONArray items = Records.array(order, "items"); for (int i = 0; i < items.length(); i++) count += items.optJSONObject(i).optInt("quantity"); return count; }
    private static JSONObject object(Object... pairs) { JSONObject object = new JSONObject(); for (int i = 0; i < pairs.length; i += 2) put(object, String.valueOf(pairs[i]), pairs[i + 1]); return object; }
    private static void put(JSONObject object, String key, Object value) { try { object.put(key, value); } catch (Exception e) { throw new IllegalArgumentException("Invalid record.", e); } }
    private static double number(String text) { try { double n = Double.parseDouble(text); return Double.isFinite(n) ? n : 0; } catch (Exception e) { return 0; } }
    private static boolean validMoney(String text) { return text != null && text.matches("\\d+(?:\\.\\d{1,2})?") && Double.isFinite(number(text)) && text.length() <= 14; }
    private static double round(double amount) { return Math.round((amount + Math.ulp(amount)) * 100d) / 100d; }
    private static String plain(double value) { return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value); }
    private static String canonical(String phone) { String value = phone.replaceAll("\\D", ""); if (value.length() == 11 && value.startsWith("0")) value = value.substring(1); if (value.length() == 12 && value.startsWith("91")) value = value.substring(2); return value; }
    private static int indexOf(String[] values, String value) { for (int i = 0; i < values.length; i++) if (values[i].equals(value)) return i; return 0; }
    private static String message(Exception error) { return error.getMessage() == null ? "These changes could not be completed. Your records were kept." : error.getMessage(); }
    private static AdapterView.OnItemSelectedListener selection(Runnable callback) { return new AdapterView.OnItemSelectedListener() { @Override public void onItemSelected(AdapterView<?> p, View v, int position, long id) { callback.run(); } @Override public void onNothingSelected(AdapterView<?> p) { } }; }
    private static void watch(EditText input, Runnable callback) { input.addTextChangedListener(new TextWatcher() { @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { } @Override public void onTextChanged(CharSequence s, int start, int before, int count) { callback.run(); } @Override public void afterTextChanged(Editable text) { } }); }
    private static EditText field(LinearLayout parent, String label, String value, int type, TextValue onChange) { Context context = parent.getContext(); label(parent, label); EditText input = edit(context, label, value, type); parent.addView(input); watch(input, () -> onChange.changed(input.getText().toString())); return input; }
    private static void label(LinearLayout parent, String value) { TextView title = text(parent.getContext(), value, 12, MUTED, true); title.setPadding(0, dp(parent.getContext(), 12), 0, dp(parent.getContext(), 6)); parent.addView(title); }
    private static Spinner spinner(Context context, String[] options, int selected) { Spinner input = new Spinner(context); ArrayAdapter<String> adapter = new ArrayAdapter<>(context, android.R.layout.simple_spinner_item, options); adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item); input.setAdapter(adapter); input.setSelection(Math.max(0, selected), false); input.setMinimumHeight(dp(context, 50)); input.setPadding(0, dp(context, 6), 0, dp(context, 6)); input.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(context, 56))); return input; }
    private static EditText edit(Context context, String hint, String value, int type) { EditText input = new EditText(context); input.setInputType(type); input.setHint(hint); input.setText(value); input.setTextColor(INK); input.setHintTextColor(MUTED); input.setTextSize(15); input.setSingleLine((type & InputType.TYPE_TEXT_FLAG_MULTI_LINE) == 0); input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(1000)}); input.setPadding(dp(context, 12), dp(context, 10), dp(context, 12), dp(context, 10)); input.setMinHeight(dp(context, 49)); input.setBackground(shape(Color.WHITE, BORDER, dp(context, 9))); LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); params.bottomMargin = dp(context, 12); input.setLayoutParams(params); input.setContentDescription(hint); return input; }
    private static TextView text(Context context, String value, int size, int color, boolean bold) { TextView text = new TextView(context); text.setText(value); text.setTextSize(size); text.setTextColor(color); text.setPadding(0, dp(context, 3), 0, dp(context, 3)); text.setLineSpacing(dp(context, 3), 1); if (bold) text.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return text; }
    private static TextView badge(Context context, String value) { TextView badge = text(context, value, 11, TEAL, true); badge.setPadding(dp(context, 9), dp(context, 5), dp(context, 9), dp(context, 5)); badge.setBackground(shape(Color.rgb(232, 245, 237), Color.TRANSPARENT, dp(context, 7))); return badge; }
    private static Button button(Context context, String label, Runnable callback, boolean secondary) { Button button = new Button(context); button.setText(label); button.setAllCaps(false); button.setTextSize(13); button.setTextColor(secondary ? TEAL : Color.WHITE); button.setMinHeight(dp(context, 47)); button.setPadding(dp(context, 12), dp(context, 6), dp(context, 12), dp(context, 6)); button.setBackground(shape(secondary ? Color.WHITE : TEAL, secondary ? BORDER : TEAL, dp(context, 9))); LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); params.topMargin = dp(context, 6); params.bottomMargin = dp(context, 6); button.setLayoutParams(params); button.setOnClickListener(v -> callback.run()); return button; }
    private static LinearLayout column(Context context, int padding) { LinearLayout column = new LinearLayout(context); column.setOrientation(LinearLayout.VERTICAL); column.setPadding(dp(context, padding), dp(context, padding), dp(context, padding), dp(context, padding)); column.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)); return column; }
    private static LinearLayout row(Context context) { LinearLayout row = new LinearLayout(context); row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL); row.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)); return row; }
    private static LinearLayout card(Context context) { LinearLayout card = column(context, 16); card.setBackground(shape(Color.WHITE, BORDER, dp(context, 13))); return card; }
    private static ScrollView scroll(Context context, View body) { ScrollView scroll = new ScrollView(context); scroll.setFillViewport(false); scroll.addView(body); return scroll; }
    private static GradientDrawable shape(int color, int stroke, int radius) { GradientDrawable shape = new GradientDrawable(); shape.setColor(color); shape.setCornerRadius(radius); shape.setStroke(1, stroke); return shape; }
    private static void gap(LinearLayout parent, int height) { View gap = new View(parent.getContext()); parent.addView(gap, new LinearLayout.LayoutParams(1, dp(parent.getContext(), height))); }
    private static int dp(Context context, int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
    private static Dialog fullDialog(MainActivity host, String title) { Dialog dialog = new Dialog(host); dialog.requestWindowFeature(Window.FEATURE_NO_TITLE); LinearLayout shell = column(host, 0); shell.setBackgroundColor(BG); LinearLayout header = row(host); header.setPadding(dp(host, 20), dp(host, 12), dp(host, 12), dp(host, 12)); header.setBackgroundColor(Color.WHITE); header.addView(text(host, title, 19, INK, true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1)); Button close = button(host, "Close", dialog::dismiss, true); header.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)); shell.addView(header); dialog.setContentView(shell, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)); dialog.findViewById(android.R.id.content).setTag(shell); dialog.setCanceledOnTouchOutside(false); Window window = dialog.getWindow(); if (window != null) { window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE); window.setBackgroundDrawableResource(android.R.color.transparent); } return dialog; }
    private static void sizeDialog(Dialog dialog) { Window window = dialog.getWindow(); if (window != null) window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT); }
}
