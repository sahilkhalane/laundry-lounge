package com.laundrylounge.app;

import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.Base64;
import android.util.Patterns;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Consumer;

/** Native customer, expense, reporting, and business-settings screens. */
public final class BusinessScreens {
    private BusinessScreens() {}
    private static final String[] CATEGORIES = {"Supplies", "Utilities", "Rent", "Salaries", "Maintenance", "Transport", "Other"};

    public static View customers(MainActivity host) {
        LinearLayout body = page(host, "Customers", "A little care for every familiar face.");
        JSONObject initial = host.snapshot();
        JSONArray customers = Records.array(initial, "customers");
        double outstanding = 0;
        JSONArray orders = Records.array(initial, "orders");
        for (int i = 0; i < orders.length(); i++) outstanding += Records.balance(orders.optJSONObject(i));
        metric(host, body, "Your customers", Integer.toString(customers.length()), Records.money(outstanding) + " outstanding across all accounts");
        body.addView(Ui.button(host, "Add customer", () -> customerForm(host, null), false));
        gap(host, body, 16);
        EditText search = Ui.field(host, body, "Find customer", "", InputType.TYPE_CLASS_TEXT);
        search.setHint("Name or phone number");
        LinearLayout list = Ui.column(host);
        body.addView(list);
        Runnable render = () -> {
            list.removeAllViews();
            String query = search.getText().toString().trim().toLowerCase(Locale.ROOT);
            JSONObject store = host.snapshot();
            JSONArray rows = Records.array(store, "customers");
            int matches = 0;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject customer = rows.optJSONObject(i);
                if (customer == null) continue;
                String haystack = (customer.optString("name") + " " + customer.optString("phone") + " " + customer.optString("email")).toLowerCase(Locale.ROOT);
                if (!haystack.contains(query)) continue;
                matches++;
                int count = 0; double due = 0;
                JSONArray allOrders = Records.array(store, "orders");
                for (int j = 0; j < allOrders.length(); j++) {
                    JSONObject order = allOrders.optJSONObject(j);
                    if (order != null && order.optString("customerId").equals(customer.optString("id"))) { count++; due += Records.balance(order); }
                }
                LinearLayout card = Ui.card(host);
                card.addView(Ui.text(host, customer.optString("name"), 17, Ui.INK, true));
                card.addView(Ui.text(host, customer.optString("phone"), 14, Ui.MUTED, false));
                if (!customer.optString("email").isEmpty()) card.addView(Ui.text(host, customer.optString("email"), 12, Ui.MUTED, false));
                if (!customer.optString("address").isEmpty()) card.addView(Ui.text(host, customer.optString("address"), 12, Ui.MUTED, false));
                gap(host, card, 10);
                card.addView(Ui.text(host, count + " orders · " + Records.money(due) + " due", 13, Ui.TEAL, true));
                JSONObject selected = Records.cloneObject(customer);
                card.addView(Ui.button(host, "Edit customer", () -> customerForm(host, selected), true));
                list.addView(card);
                gap(host, list, 12);
            }
            if (matches == 0) empty(host, list, rows.length() == 0 ? "Your first familiar face" : "No customers found", rows.length() == 0 ? "Add a customer to create their first order." : "Try another name or phone number.");
        };
        watch(search, render); render.run();
        return Ui.scroll(host, body);
    }

    private static void customerForm(MainActivity host, JSONObject existing) {
        LinearLayout form = Ui.column(host);
        EditText name = Ui.field(host, form, "Full name", existing == null ? "" : existing.optString("name"), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        EditText phone = Ui.field(host, form, "Phone number", existing == null ? "" : existing.optString("phone"), InputType.TYPE_CLASS_PHONE);
        EditText email = Ui.field(host, form, "Email (optional)", existing == null ? "" : existing.optString("email"), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText address = Ui.field(host, form, "Address (optional)", existing == null ? "" : existing.optString("address"), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        address.setMinLines(2);
        TextView error = errorLabel(host, form);
        AlertDialog dialog = Ui.dialog(host, existing == null ? "Add customer" : "Edit customer", form);
        final boolean[] busy = {false};
        form.addView(Ui.button(host, "Save customer", () -> {
            if (busy[0]) return;
            try {
                String fullName = name.getText().toString().trim(), number = phone.getText().toString().trim(), mail = email.getText().toString().trim();
                if (fullName.length() < 2) throw new IllegalArgumentException("Enter a name with at least two characters.");
                String digits = number.replaceAll("\\D", "");
                if (!number.matches("\\+?[0-9 ()-]+") || digits.length() < 10 || digits.length() > 15) throw new IllegalArgumentException("Enter a valid phone number with 10–15 digits.");
                if (!mail.isEmpty() && !Patterns.EMAIL_ADDRESS.matcher(mail).matches()) throw new IllegalArgumentException("Enter a valid email address.");
                JSONObject next = host.snapshot(); JSONArray rows = Records.array(next, "customers");
                String id = existing == null ? UUID.randomUUID().toString() : existing.optString("id");
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (!row.optString("id").equals(id) && canonicalPhone(row.optString("phone")).equals(canonicalPhone(number))) throw new IllegalArgumentException("This phone number already belongs to another customer.");
                }
                JSONObject value = new JSONObject().put("id", id).put("name", fullName).put("phone", number).put("email", mail).put("address", address.getText().toString().trim());
                JSONArray updated = new JSONArray(); boolean replaced = false;
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (row.optString("id").equals(id)) { updated.put(value); replaced = true; } else updated.put(row);
                }
                if (!replaced) updated.put(value);
                next.put("customers", updated); busy[0] = true;
                if (host.save(next)) dialog.dismiss();
            } catch (Exception failure) { error.setText(message(failure)); }
            finally { busy[0] = false; }
        }, false));
    }

    public static View expenses(MainActivity host) {
        LinearLayout body = page(host, "Expenses", "Small details. A clearer picture of your business.");
        String month = Records.today().substring(0, 7);
        JSONArray all = Records.array(host.snapshot(), "expenses");
        double monthly = 0; int count = 0;
        for (int i = 0; i < all.length(); i++) { JSONObject e = all.optJSONObject(i); if (day(e.optString("date")).startsWith(month)) { monthly += e.optDouble("amount"); count++; } }
        metric(host, body, "This month", Records.money(monthly), count + " recorded expenses");
        body.addView(Ui.button(host, "Add expense", () -> expenseForm(host), false)); gap(host, body, 16);
        EditText search = Ui.field(host, body, "Find expense", "", InputType.TYPE_CLASS_TEXT);
        String[] filters = new String[CATEGORIES.length + 1]; filters[0] = "All categories"; System.arraycopy(CATEGORIES, 0, filters, 1, CATEGORIES.length);
        Spinner category = Ui.spinner(host, body, "Category", filters, 0);
        LinearLayout list = Ui.column(host); body.addView(list);
        Runnable render = () -> {
            list.removeAllViews(); String query = search.getText().toString().toLowerCase(Locale.ROOT); String selected = category.getSelectedItem().toString();
            JSONArray rows = Records.array(host.snapshot(), "expenses"); List<JSONObject> found = new ArrayList<>(); double total = 0;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject e = rows.optJSONObject(i);
                if ((selected.equals("All categories") || selected.equals(e.optString("category"))) && (e.optString("title") + " " + e.optString("category")).toLowerCase(Locale.ROOT).contains(query)) found.add(e);
            }
            found.sort((a,b) -> b.optString("date").compareTo(a.optString("date")));
            for (JSONObject e : found) {
                total += e.optDouble("amount"); LinearLayout card = Ui.card(host);
                card.addView(Ui.text(host, e.optString("title"), 16, Ui.INK, true));
                card.addView(Ui.text(host, e.optString("category") + " · " + Records.date(e.optString("date")), 12, Ui.MUTED, false));
                card.addView(Ui.text(host, Records.money(e.optDouble("amount")), 21, Ui.TEAL, true));
                list.addView(card); gap(host, list, 12);
            }
            if (found.isEmpty()) empty(host, list, "No expenses here yet", "Add an expense or try another filter.");
            list.addView(Ui.text(host, found.size() + " expenses · Total " + Records.money(total), 13, Ui.MUTED, true));
        };
        watch(search, render);
        category.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            public void onItemSelected(android.widget.AdapterView<?> p, View v, int position, long id) { render.run(); }
            public void onNothingSelected(android.widget.AdapterView<?> p) {}
        }); render.run();
        return Ui.scroll(host, body);
    }

    private static void expenseForm(MainActivity host) {
        LinearLayout form = Ui.column(host);
        EditText title = Ui.field(host, form, "Description", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        EditText amount = Ui.field(host, form, "Amount (₹)", "", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        final String[] date = {Records.today()};
        dateButton(host, form, "Expense date", date[0], chosen -> date[0] = chosen, null);
        Spinner category = Ui.spinner(host, form, "Category", CATEGORIES, 0);
        TextView error = errorLabel(host, form); AlertDialog dialog = Ui.dialog(host, "Record expense", form);
        boolean[] busy = {false};
        form.addView(Ui.button(host, "Save expense", () -> {
            if (busy[0]) return;
            try {
                String description = title.getText().toString().trim(); if (description.isEmpty()) throw new IllegalArgumentException("Enter an expense description.");
                double value = currency(amount.getText().toString()); if (value <= 0 || value > 10000000) throw new IllegalArgumentException("Enter an amount greater than zero, up to ₹1 crore.");
                JSONObject next = host.snapshot(); JSONArray rows = Records.array(next, "expenses");
                JSONArray updated = new JSONArray(); updated.put(new JSONObject().put("id", UUID.randomUUID().toString()).put("title", description).put("amount", value).put("date", date[0]).put("category", category.getSelectedItem().toString()));
                for (int i = 0; i < rows.length(); i++) updated.put(rows.optJSONObject(i));
                next.put("expenses", updated); busy[0] = true; if (host.save(next)) dialog.dismiss();
            } catch (Exception failure) { error.setText(message(failure)); }
            finally { busy[0] = false; }
        }, false));
    }

    public static View reports(MainActivity host) {
        LinearLayout body = page(host, "Reports", "A clear view of your business, one day at a time.");
        String today = Records.today(); final String[] from = {today.substring(0,7) + "-01"}, to = {today};
        LinearLayout filters = Ui.card(host); body.addView(filters); LinearLayout figures = Ui.column(host); body.addView(figures);
        final Runnable[] render = new Runnable[1];
        final Button[] endButton = new Button[1];
        dateButton(host, filters, "From", from[0], chosen -> { from[0] = chosen; if (from[0].compareTo(to[0]) > 0) { to[0] = from[0]; if (endButton[0] != null) endButton[0].setText(Records.date(to[0])); } if (render[0] != null) render[0].run(); }, null);
        endButton[0] = dateButton(host, filters, "To", to[0], chosen -> { to[0] = chosen; if (to[0].compareTo(from[0]) < 0) { from[0] = to[0]; } if (render[0] != null) render[0].run(); }, () -> LocalDate.parse(from[0]));
        body.addView(Ui.button(host, "Share orders CSV", () -> {
            try { PrintHelper.shareText(host, ordersCsv(host.snapshot(), from[0], to[0]), "laundry-lounge-orders-" + from[0] + "-" + to[0] + ".csv", "text/csv"); }
            catch (Exception failure) { host.error(message(failure)); }
        }, true)); gap(host, body, 16);
        render[0] = () -> {
            figures.removeAllViews(); JSONObject store = host.snapshot();
            List<JSONObject> orders = periodOrders(store, from[0], to[0]);
            double collected = Records.collected(store, from[0], to[0]); double billed = 0, due = 0, spent = 0; int expenseCount = 0;
            Map<String,Double> services = new LinkedHashMap<>(); for (String service : Records.SERVICES) services.put(service, 0d);
            Map<String,Double> expenseTotals = new TreeMap<>();
            for (JSONObject order : orders) {
                billed += Records.total(order); due += Records.balance(order);
                JSONArray items = Records.array(order, "items");
                for (int i = 0; i < items.length(); i++) { JSONObject item = items.optJSONObject(i); String service = item.optString("service"); services.put(service, services.getOrDefault(service, 0d) + item.optInt("quantity") * item.optDouble("price")); }
            }
            JSONArray expenses = Records.array(store, "expenses");
            for (int i = 0; i < expenses.length(); i++) { JSONObject expense = expenses.optJSONObject(i); String date = day(expense.optString("date")); if (!between(date, from[0], to[0])) continue; double amount = expense.optDouble("amount"); spent += amount; expenseCount++; String category = expense.optString("category"); expenseTotals.put(category, expenseTotals.getOrDefault(category, 0d) + amount); }
            metric(host, figures, "Payments collected", Records.money(collected), "Payments actually received in this period");
            metric(host, figures, "Total billed", Records.money(billed), orders.size() + " orders placed · " + Records.money(due) + " currently due");
            metric(host, figures, "Expenses", Records.money(spent), expenseCount + " recorded expenses");
            metric(host, figures, "Cash after expenses", Records.money(collected - spent), "Collected payments minus recorded expenses");
            LinearLayout serviceCard = Ui.card(host); serviceCard.addView(Ui.text(host, "Service mix", 18, Ui.INK, true)); serviceCard.addView(Ui.text(host, "Garment value before order discounts", 12, Ui.MUTED, false));
            double serviceMax = 1; for (double amount : services.values()) serviceMax = Math.max(serviceMax, amount);
            for (Map.Entry<String,Double> entry : services.entrySet()) chart(host, serviceCard, entry.getKey(), entry.getValue(), serviceMax);
            figures.addView(serviceCard); gap(host, figures, 15);
            LinearLayout expenseCard = Ui.card(host); expenseCard.addView(Ui.text(host, "Where money goes", 18, Ui.INK, true));
            if (expenseTotals.isEmpty()) expenseCard.addView(Ui.text(host, "No expenses in this date range.", 13, Ui.MUTED, false));
            for (Map.Entry<String,Double> entry : expenseTotals.entrySet()) chart(host, expenseCard, entry.getKey(), entry.getValue(), Math.max(spent,1));
            figures.addView(expenseCard);
            gap(host, figures, 15); figures.addView(Ui.text(host, "Collections use payment dates. Billing and CSV orders use order creation dates; exported payment totals and balances are current cumulative amounts.", 12, Ui.MUTED, false));
        };
        render[0].run(); return Ui.scroll(host, body);
    }

    public static View settings(MainActivity host) {
        LinearLayout body = page(host, "Settings", "The little details that make it Laundry Lounge.");
        JSONObject values = host.snapshot().optJSONObject("settings");
        LinearLayout details = Ui.card(host); body.addView(details);
        details.addView(Ui.text(host, "Business details", 19, Ui.INK, true));
        logo(host, details, values.optString("logo"));
        details.addView(Ui.button(host, "Choose original business logo", host::chooseLogo, true));
        gap(host, details, 14);
        EditText name = Ui.field(host, details, "Business name", values.optString("businessName"), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        EditText phone = Ui.field(host, details, "Business phone", values.optString("phone"), InputType.TYPE_CLASS_PHONE);
        EditText address = Ui.field(host, details, "Business address", values.optString("address"), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        address.setMinLines(2);
        EditText footer = Ui.field(host, details, "Receipt footer", values.optString("receiptFooter"), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        TextView error = errorLabel(host, details);
        details.addView(Ui.button(host, "Save business details", () -> {
            try {
                String businessName = name.getText().toString().trim(), businessPhone = phone.getText().toString().trim();
                if (businessName.isEmpty()) throw new IllegalArgumentException("Enter the business name.");
                if (!businessPhone.isEmpty()) { String digits = businessPhone.replaceAll("\\D", ""); if (!businessPhone.matches("\\+?[0-9 ()-]+") || digits.length() < 7 || digits.length() > 15) throw new IllegalArgumentException("Enter a valid business phone number."); }
                JSONObject next = host.snapshot(); JSONObject updated = next.getJSONObject("settings");
                updated.put("businessName", businessName).put("phone", businessPhone).put("address", address.getText().toString().trim()).put("receiptFooter", footer.getText().toString().trim());
                if (host.save(next)) host.toast("Business details saved");
            } catch (Exception failure) { error.setText(message(failure)); }
        }, false));
        gap(host, body, 16);
        LinearLayout backups = Ui.card(host); body.addView(backups);
        backups.addView(Ui.text(host, "Your records, in your hands", 18, Ui.INK, true));
        backups.addView(Ui.text(host, "Records stay on this phone in private SQLite storage. Export backups regularly. Uninstalling the app can remove its records; keep a backup before changing phones.", 13, Ui.MUTED, false));
        gap(host, backups, 12);
        backups.addView(Ui.button(host, "Export backup", host::exportBackup, false));
        gap(host, backups, 8); backups.addView(Ui.button(host, "Restore backup", host::restoreBackup, true));
        gap(host, body, 16);
        LinearLayout integrations = Ui.card(host); body.addView(integrations);
        integrations.addView(Ui.text(host, "WhatsApp & printing", 18, Ui.INK, true));
        integrations.addView(Ui.text(host, "WhatsApp opens a prepared message for you to review and send. Bills and QR tags use Android’s print menu. PDF bills and CSV reports can be shared to other apps.", 13, Ui.MUTED, false));
        gap(host, integrations, 10); integrations.addView(Ui.text(host, "This version does not sync records between devices or send background WhatsApp messages. A dedicated Bluetooth printer driver is not included.", 12, Ui.MUTED, false));
        gap(host, body, 16);
        LinearLayout reset = Ui.card(host); body.addView(reset);
        reset.addView(Ui.text(host, "Start fresh", 18, Ui.INK, true));
        reset.addView(Ui.text(host, "Clear all customers, orders and expenses only after exporting a backup. Business details and the logo are kept.", 13, Ui.MUTED, false));
        reset.addView(Ui.button(host, "Clear workspace records", host::clearRecords, true));
        return Ui.scroll(host, body);
    }

    private static LinearLayout page(MainActivity host, String title, String subtitle) {
        LinearLayout body = Ui.column(host); int inset=Ui.dp(host,20); body.setPadding(inset,inset,inset,inset); body.addView(Ui.text(host, title, 28, Ui.INK, true)); body.addView(Ui.text(host, subtitle, 13, Ui.MUTED, false)); gap(host, body, 18); return body;
    }
    private static void metric(MainActivity host, LinearLayout parent, String label, String value, String note) {
        LinearLayout card = Ui.card(host); card.addView(Ui.text(host, label, 12, Ui.MUTED, false)); card.addView(Ui.text(host, value, 27, Ui.INK, true)); card.addView(Ui.text(host, note, 12, Ui.MUTED, false)); parent.addView(card); gap(host, parent, 12);
    }
    private static void empty(MainActivity host, LinearLayout parent, String title, String subtitle) {
        LinearLayout card = Ui.card(host); card.addView(Ui.text(host, title, 18, Ui.INK, true)); card.addView(Ui.text(host, subtitle, 13, Ui.MUTED, false)); parent.addView(card);
    }
    private static void chart(MainActivity host, LinearLayout parent, String label, double amount, double max) {
        gap(host, parent, 14); parent.addView(Ui.text(host, label + " · " + Records.money(amount), 13, Ui.INK, false));
        ProgressBar bar = new ProgressBar(host, null, android.R.attr.progressBarStyleHorizontal); bar.setMax(1000); bar.setProgress((int)Math.round(Math.max(0, amount) / Math.max(1,max) * 1000)); bar.setProgressTintList(android.content.res.ColorStateList.valueOf(Ui.TEAL)); bar.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(Ui.BORDER)); parent.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(host, 12)));
    }
    private static Button dateButton(MainActivity host, LinearLayout parent, String label, String initial, Consumer<String> onChange, java.util.function.Supplier<LocalDate> minimum) {
        parent.addView(Ui.text(host, label, 12, Ui.MUTED, true)); final String[] value = {initial};
        Button button = Ui.button(host, Records.date(initial), () -> {}, true);
        button.setOnClickListener(view -> {
            LocalDate selected; try { selected = LocalDate.parse(value[0]); } catch (Exception ignored) { selected = LocalDate.now(); }
            DatePickerDialog picker = new DatePickerDialog(host, (datePicker,y,m,d) -> { value[0] = LocalDate.of(y,m+1,d).toString(); button.setText(Records.date(value[0])); onChange.accept(value[0]); }, selected.getYear(), selected.getMonthValue()-1, selected.getDayOfMonth());
            if (minimum != null) { LocalDate min = minimum.get(); picker.getDatePicker().setMinDate(min.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()); }
            picker.show();
        }); parent.addView(button); gap(host,parent,12); return button;
    }
    private static void logo(MainActivity host, LinearLayout parent, String value) {
        if (!value.startsWith("data:image/")) return;
        try {
            byte[] bytes = Base64.decode(value.substring(value.indexOf(',')+1), Base64.DEFAULT);
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true; BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
            options.inSampleSize = 1; while (options.outWidth / options.inSampleSize > 600 || options.outHeight / options.inSampleSize > 600) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false; Bitmap bitmap = BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
            if (bitmap == null) return; ImageView image = new ImageView(host); image.setImageBitmap(bitmap); image.setScaleType(ImageView.ScaleType.FIT_CENTER); image.setContentDescription("Laundry Lounge business logo"); parent.addView(image,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,Ui.dp(host,110)));
        } catch (Exception | OutOfMemoryError ignored) { parent.addView(Ui.text(host,"Choose a valid business logo to update this preview.",12,Ui.MUTED,false)); }
    }
    private static List<JSONObject> periodOrders(JSONObject store, String from, String to) {
        List<JSONObject> result = new ArrayList<>(); JSONArray all = Records.array(store,"orders");
        for(int i=0;i<all.length();i++){JSONObject order=all.optJSONObject(i);if(between(day(order.optString("createdAt")),from,to))result.add(order);}return result;
    }
    private static String ordersCsv(JSONObject store, String from, String to) {
        StringBuilder out = new StringBuilder("\uFEFFOrder,Customer,Created,Due,Status,Garments,Billed INR,Total collected INR,Current outstanding INR\r\n");
        for(JSONObject order:periodOrders(store,from,to)){
            JSONObject customer=Records.customer(store,order.optString("customerId"));int count=0;JSONArray items=Records.array(order,"items");for(int i=0;i<items.length();i++)count+=items.optJSONObject(i).optInt("quantity");
            Object[] values={order.optString("id"),customer==null?"Customer":customer.optString("name"),day(order.optString("createdAt")),order.optString("dueDate"),order.optString("status"),count,Records.total(order),order.optDouble("paid"),Records.balance(order)};
            for(int i=0;i<values.length;i++){if(i>0)out.append(',');out.append(csv(String.valueOf(values[i])));}out.append("\r\n");
        }return out.toString();
    }
    private static String csv(String value){if(!value.isEmpty() && "=+@-\t\r".indexOf(value.charAt(0)) >= 0)value="'"+value;return "\""+value.replace("\"","\"\"")+"\"";}
    private static boolean between(String date,String from,String to){return !date.isEmpty()&&date.compareTo(from)>=0&&date.compareTo(to)<=0;}
    private static String day(String value){try{if(value.length()==10)return LocalDate.parse(value).toString();return Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDate().toString();}catch(Exception ignored){try{return OffsetDateTime.parse(value).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate().toString();}catch(Exception invalid){return "";}}}
    private static String canonicalPhone(String phone){String digits=phone.replaceAll("\\D","");return digits.length()==12&&digits.startsWith("91")?digits.substring(2):digits;}
    private static double currency(String input){String value=input.trim();if(!value.matches("\\d+(?:\\.\\d{1,2})?"))throw new IllegalArgumentException("Enter an amount with up to two decimal places.");double number=Double.parseDouble(value);if(!Double.isFinite(number))throw new IllegalArgumentException("Enter a valid amount.");return Math.round(number*100d)/100d;}
    private static TextView errorLabel(MainActivity host, LinearLayout parent){TextView label=Ui.text(host,"",13,0xffb64f43,false);parent.addView(label);return label;}
    private static String message(Exception failure){return failure.getMessage()==null?"These changes could not be saved. Please try again.":failure.getMessage();}
    private static void gap(MainActivity host, LinearLayout parent,int height){View spacer=new View(host);parent.addView(spacer,new LinearLayout.LayoutParams(1,Ui.dp(host,height)));}
    private static void watch(EditText input,Runnable action){input.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){action.run();}public void afterTextChanged(Editable e){}});}
}
