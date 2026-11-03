package com.laundrylounge.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Base64;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Android PDF, print-service and share-sheet integrations. No browser is used. */
public final class PrintHelper {
    private static final int INK = Color.rgb(31, 55, 45);
    private static final int TEAL = Color.rgb(0, 139, 128);
    private static final int MUTED = Color.rgb(105, 126, 112);
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private PrintHelper() {}

    public static Bitmap qrBitmap(String tag, int size) {
        try {
            BitMatrix matrix = qr(tag, Math.max(100, size));
            Bitmap bitmap = Bitmap.createBitmap(matrix.getWidth(), matrix.getHeight(), Bitmap.Config.ARGB_8888);
            int[] pixels = new int[matrix.getWidth() * matrix.getHeight()];
            for (int y = 0; y < matrix.getHeight(); y++) for (int x = 0; x < matrix.getWidth(); x++) pixels[y * matrix.getWidth() + x] = matrix.get(x, y) ? Color.BLACK : Color.WHITE;
            bitmap.setPixels(pixels, 0, matrix.getWidth(), 0, 0, matrix.getWidth(), matrix.getHeight());
            return bitmap;
        } catch (Exception error) { throw new IllegalArgumentException("Could not create garment QR tag.", error); }
    }
    private static BitMatrix qr(String tag, int size) throws Exception {
        String parsed = Records.parseTag(tag);
        if (parsed == null || parsed.length() == 0) throw new IllegalArgumentException("Invalid garment tag.");
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.MARGIN, 4);
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
        return new MultiFormatWriter().encode("LAUNDRY-LOUNGE:" + parsed, BarcodeFormat.QR_CODE, size, size, hints);
    }
    public static void print(Activity host, JSONObject store, JSONObject order, boolean tags) {
        IO.execute(() -> {
            try {
                File file = pdf(host, store, order, tags);
                MAIN.post(() -> {
                    if (host.isFinishing() || host.isDestroyed()) return;
                    try {
                        PrintManager manager = (PrintManager) host.getSystemService(Context.PRINT_SERVICE);
                        if (manager == null) throw new IllegalStateException("Android printing is unavailable.");
                        manager.print("Laundry Lounge " + order.optString("id") + (tags ? " garment tags" : " bill"), new PdfAdapter(file), new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).setColorMode(PrintAttributes.COLOR_MODE_COLOR).build());
                    } catch (Exception error) { showError(host, "Could not open Android printing. " + message(error)); }
                });
            } catch (Exception error) { showError(host, "The PDF could not be prepared. " + message(error)); }
        });
    }
    public static void shareBill(Activity host, JSONObject store, JSONObject order) {
        IO.execute(() -> {
            try { File file = pdf(host, store, order, false); MAIN.post(() -> shareFile(host, file, "application/pdf", "Share " + order.optString("id") + " bill")); }
            catch (Exception error) { showError(host, "The bill could not be shared. " + message(error)); }
        });
    }
    public static void shareText(Activity host, String text, String filename, String mime) {
        IO.execute(() -> {
            try {
                File folder = new File(host.getCacheDir(), "shares");
                if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("Temporary storage is unavailable.");
                String safeName = filename.replaceAll("[^A-Za-z0-9._-]", "_");
                if (safeName.length() == 0) safeName = "laundry-lounge-backup.json";
                File file = new File(folder, safeName);
                try (FileOutputStream out = new FileOutputStream(file)) { out.write(text.getBytes(StandardCharsets.UTF_8)); }
                MAIN.post(() -> shareFile(host, file, mime, "Save or share Laundry Lounge file"));
            } catch (Exception error) { showError(host, "The file could not be shared. " + message(error)); }
        });
    }
    private static void shareFile(Activity host, File file, String mime, String title) {
        if (host.isFinishing() || host.isDestroyed()) return;
        try {
            Uri uri = FileProvider.getUriForFile(host, host.getPackageName() + ".files", file);
            Intent intent = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setClipData(android.content.ClipData.newRawUri("Laundry Lounge file", uri));
            host.startActivity(Intent.createChooser(intent, title));
        } catch (Exception error) { showError(host, "No compatible sharing app is available. " + message(error)); }
    }
    public static void whatsapp(Activity host, JSONObject store, JSONObject order) {
        try {
            JSONObject customer = Records.customer(store, order.optString("customerId"));
            if (customer == null) throw new IllegalArgumentException("The customer was not found.");
            String phone = customer.optString("phone").replaceAll("\\D", "");
            if (phone.length() == 11 && phone.startsWith("0")) phone = phone.substring(1);
            if (phone.length() == 10) phone = "91" + phone;
            if (!phone.matches("[1-9][0-9]{9,14}")) throw new IllegalArgumentException("Add a valid customer phone number before sharing.");
            JSONObject settings = store.optJSONObject("settings");
            String business = settings == null ? "Laundry Lounge" : settings.optString("businessName", "Laundry Lounge");
            StringBuilder text = new StringBuilder("Hello ").append(customer.optString("name")).append(", your ").append(business).append(" order ").append(order.optString("id")).append(" is ").append(order.optString("status").toLowerCase(java.util.Locale.ROOT)).append(".\n\n");
            JSONArray items = Records.array(order, "items");
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                text.append(item.optInt("quantity")).append(" × ").append(item.optString("garment")).append(" · ").append(item.optString("service")).append(" · ").append(Records.money(item.optDouble("quantity") * item.optDouble("price"))).append('\n');
            }
            text.append("\nTotal: ").append(Records.money(Records.total(order))).append("\nPaid: ").append(Records.money(order.optDouble("paid"))).append("\nBalance: ").append(Records.money(Records.balance(order))).append("\nCollection: ").append(Records.date(order.optString("dueDate")));
            if (settings != null && settings.optString("receiptFooter").length() > 0) text.append("\n\n").append(settings.optString("receiptFooter"));
            Uri nativeUri = Uri.parse("whatsapp://send?phone=" + phone + "&text=" + Uri.encode(text.toString()));
            try { host.startActivity(new Intent(Intent.ACTION_VIEW, nativeUri)); }
            catch (ActivityNotFoundException missing) { host.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/" + phone + "?text=" + Uri.encode(text.toString())))); }
        } catch (Exception error) { showError(host, message(error)); }
    }
    private static File pdf(Context context, JSONObject store, JSONObject order, boolean tags) throws Exception {
        File folder = new File(context.getCacheDir(), "shares");
        if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("Temporary storage is unavailable.");
        File file = new File(folder, order.optString("id").replaceAll("[^A-Za-z0-9-]", "_") + (tags ? "-tags-" : "-bill-") + System.currentTimeMillis() + ".pdf");
        PdfDocument document = new PdfDocument();
        try {
            if (tags) tagPages(document, store, order); else billPages(document, store, order);
            try (FileOutputStream output = new FileOutputStream(file)) { document.writeTo(output); }
        } finally { document.close(); }
        return file;
    }
    private static Paint paint(float size, int color, boolean bold) { Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); p.setTextSize(size); p.setColor(color); p.setTypeface(bold ? Typeface.create("sans-serif", Typeface.BOLD) : Typeface.create("sans-serif", Typeface.NORMAL)); return p; }
    private static Bitmap businessLogo(JSONObject settings) {
        try {
            String data = settings.optString("logo");
            int split = data.indexOf(',');
            if (!data.matches("^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$") || split < 0 || data.length() > 8_000_000) return null;
            byte[] bytes = Base64.decode(data.substring(split + 1), Base64.DEFAULT);
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            options.inSampleSize = 1;
            while (options.outWidth / options.inSampleSize > 512 || options.outHeight / options.inSampleSize > 512) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        } catch (Exception error) { return null; }
    }
    private static void billPages(PdfDocument document, JSONObject store, JSONObject order) {
        JSONObject settings = store.optJSONObject("settings"); if (settings == null) settings = new JSONObject();
        JSONObject customer = Records.customer(store, order.optString("customerId"));
        PageWriter writer = new PageWriter(document, settings.optString("businessName", "Laundry Lounge"), order.optString("id"));
        Bitmap logo = businessLogo(settings);
        if (logo != null) { float width = Math.min(100, 65f * logo.getWidth() / logo.getHeight()); writer.canvas.drawBitmap(logo, null, new RectF((595 - width) / 2, writer.y, (595 + width) / 2, writer.y + 65), null); writer.y += 75; }
        Paint title = paint(23, TEAL, true); title.setTextAlign(Paint.Align.CENTER);
        writer.canvas.drawText(settings.optString("businessName", "Laundry Lounge"), 297.5f, writer.y + 22, title); writer.y += 37;
        writer.center("Your finest fabric caretaker.", paint(10, MUTED, false));
        writer.center(settings.optString("address"), paint(10, MUTED, false));
        if (settings.optString("phone").length() > 0) writer.center("Tel: " + settings.optString("phone"), paint(10, MUTED, false));
        writer.line();
        writer.pair("BILL " + order.optString("id"), "Issued " + Records.date(order.optString("createdAt")), paint(11, INK, true));
        writer.wrapped(customer == null ? "Customer" : customer.optString("name"), paint(15, INK, true), 531, 19);
        if (customer != null) writer.wrapped(customer.optString("phone"), paint(11, MUTED, false), 531, 15);
        writer.wrapped("Collection: " + Records.date(order.optString("dueDate")) + (order.optBoolean("express") ? " · EXPRESS" : ""), paint(11, MUTED, false), 531, 17);
        writer.y += 12;
        writer.pair("GARMENT / SERVICE", "AMOUNT", paint(10, MUTED, true)); writer.line();
        JSONArray items = Records.array(order, "items"); double subtotal = 0;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i); if (item == null) continue;
            double amount = item.optInt("quantity") * item.optDouble("price"); subtotal += amount;
            writer.ensure(60);
            writer.pair(item.optInt("quantity") + " × " + item.optString("garment"), Records.money(amount), paint(12, INK, true));
            writer.wrapped(item.optString("service") + " · " + Records.money(item.optDouble("price")) + " each", paint(10, MUTED, false), 531, 14);
            writer.y += 6; writer.line();
        }
        writer.ensure(160);
        writer.pair("Subtotal", Records.money(subtotal), paint(11, INK, false));
        if (order.optDouble("discount") > 0) writer.pair("Discount", "− " + Records.money(order.optDouble("discount")), paint(11, INK, false));
        writer.pair("Total", Records.money(Records.total(order)), paint(16, TEAL, true));
        writer.pair("Payment received", Records.money(order.optDouble("paid")), paint(11, INK, false));
        writer.pair("Balance due", Records.money(Records.balance(order)), paint(13, INK, true));
        if (order.optString("notes").length() > 0) { writer.y += 10; writer.wrapped("Care instructions: " + order.optString("notes"), paint(11, MUTED, false), 531, 16); }
        writer.y += 20;
        writer.wrapped(settings.optString("receiptFooter"), paint(11, TEAL, false), 531, 16);
        writer.wrapped("Please bring this bill when collecting garments. Amounts in INR; no tax added.", paint(9, MUTED, false), 531, 13);
        writer.finish();
    }
    private static void tagPages(PdfDocument document, JSONObject store, JSONObject order) throws Exception {
        List<Records.Tag> tags = Records.tags(order);
        JSONObject customer = Records.customer(store, order.optString("customerId"));
        JSONObject settings = store.optJSONObject("settings");
        String business = settings == null ? "Laundry Lounge" : settings.optString("businessName", "Laundry Lounge");
        Bitmap logo = settings == null ? null : businessLogo(settings);
        for (int start = 0, pageNo = 1; start < tags.size(); start += 10, pageNo++) {
            PdfDocument.Page page = document.startPage(new PdfDocument.PageInfo.Builder(595, 842, pageNo).create()); Canvas canvas = page.getCanvas();
            for (int index = start; index < Math.min(start + 10, tags.size()); index++) {
                Records.Tag tag = tags.get(index); int cell = index - start;
                float left = 26 + (cell % 2) * 278, top = 24 + (cell / 2) * 158;
                Paint border = paint(1, Color.rgb(155, 176, 150), false); border.setStyle(Paint.Style.STROKE); border.setStrokeWidth(.7f);
                canvas.drawRect(left, top, left + 265, top + 148, border);
                float brandX = left + 10;
                if (logo != null) { canvas.drawBitmap(logo, null, new RectF(left + 9, top + 3, left + 31, top + 21), null); brandX = left + 37; }
                drawClipped(canvas, business, brandX, top + 17, left + 256 - brandX, paint(10, TEAL, true));
                canvas.drawLine(left + 9, top + 24, left + 256, top + 24, border);
                drawQr(canvas, tag.id, left + 7, top + 29, 91);
                float x = left + 105, y = top + 43;
                y = drawLines(canvas, tag.garment, x, y, 149, paint(11, INK, true), 13, 2);
                y = drawLines(canvas, tag.service, x, y + 3, 149, paint(9, MUTED, false), 12, 2);
                y = drawLines(canvas, customer == null ? "Customer" : customer.optString("name"), x, y + 3, 149, paint(9, INK, false), 12, 2);
                drawClipped(canvas, "Due " + Records.date(order.optString("dueDate")) + (order.optBoolean("express") ? " · EXPRESS" : ""), x, Math.min(y + 4, top + 111), 149, paint(8, MUTED, false));
                Paint code = paint(10, INK, true); code.setTextAlign(Paint.Align.CENTER); canvas.drawText(tag.id, left + 132.5f, top + 127, code);
                String note = tag.note == null || tag.note.length() == 0 ? order.optString("notes") : tag.note;
                if (note.length() > 0) drawClipped(canvas, note, left + 9, top + 141, 247, paint(7, MUTED, false));
            }
            document.finishPage(page);
        }
    }
    private static void drawQr(Canvas canvas, String id, float left, float top, float size) throws Exception {
        BitMatrix matrix = qr(id, 0); float scale = size / matrix.getWidth();
        Paint black = paint(1, Color.BLACK, false); black.setAntiAlias(false);
        canvas.drawRect(left, top, left + size, top + size, paint(1, Color.WHITE, false));
        for (int y = 0; y < matrix.getHeight(); y++) for (int x = 0; x < matrix.getWidth();) {
            if (!matrix.get(x, y)) { x++; continue; }
            int start = x; while (x < matrix.getWidth() && matrix.get(x, y)) x++;
            canvas.drawRect(left + start * scale, top + y * scale, left + x * scale, top + (y + 1) * scale, black);
        }
    }
    private static List<String> lines(String text, Paint paint, float width) {
        List<String> result = new ArrayList<>();
        for (String paragraph : (text == null ? "" : text).split("\\n", -1)) {
            String remaining = paragraph.trim();
            if (remaining.length() == 0) { result.add(""); continue; }
            while (remaining.length() > 0) {
                int count = paint.breakText(remaining, true, width, null);
                if (count < 1) count = 1;
                if (count < remaining.length()) { int space = remaining.lastIndexOf(' ', count - 1); if (space > count / 3) count = space; }
                result.add(remaining.substring(0, count)); remaining = remaining.substring(count).trim();
            }
        }
        return result;
    }
    private static float drawLines(Canvas canvas, String text, float x, float y, float width, Paint paint, int height, int max) {
        List<String> lines = lines(text, paint, width);
        for (int i = 0; i < Math.min(lines.size(), max); i++) { String line = lines.get(i); if (i == max - 1 && lines.size() > max) line += "…"; canvas.drawText(line, x, y, paint); y += height; }
        return y;
    }
    private static void drawClipped(Canvas canvas, String text, float x, float y, float width, Paint paint) {
        String value = text == null ? "" : text.replace('\n', ' ');
        if (paint.measureText(value) > width) { int count = paint.breakText(value, true, width - paint.measureText("…"), null); value = value.substring(0, Math.max(0, count)) + "…"; }
        canvas.drawText(value, x, y, paint);
    }
    private static String message(Exception error) { String message = error.getMessage(); return message == null || message.length() == 0 ? "Please try again." : message; }
    private static void showError(Activity host, String text) { MAIN.post(() -> { if (!host.isFinishing() && !host.isDestroyed()) Toast.makeText(host, text, Toast.LENGTH_LONG).show(); }); }
    private static final class PageWriter {
        final PdfDocument document; final String business, id; PdfDocument.Page page; Canvas canvas; int y; int number;
        PageWriter(PdfDocument document, String business, String id) { this.document = document; this.business = business; this.id = id; start(false); }
        void start(boolean continuation) { page = document.startPage(new PdfDocument.PageInfo.Builder(595, 842, ++number).create()); canvas = page.getCanvas(); y = 32; if (continuation) { pair(business, id + " · continued", paint(11, TEAL, true)); line(); } }
        void ensure(int height) { if (y + height > 790) { finishPage(); start(true); } }
        void finishPage() { Paint footer = paint(8, MUTED, false); footer.setTextAlign(Paint.Align.RIGHT); canvas.drawText("Page " + number, 563, 817, footer); document.finishPage(page); }
        void finish() { finishPage(); }
        void line() { ensure(15); Paint p = paint(1, Color.rgb(213, 225, 209), false); p.setStrokeWidth(.7f); canvas.drawLine(32, y, 563, y, p); y += 15; }
        void pair(String left, String right, Paint paint) { ensure(28); drawClipped(canvas, left, 32, y + paint.getTextSize(), 340, paint); Paint aligned = new Paint(paint); aligned.setTextAlign(Paint.Align.RIGHT); canvas.drawText(right, 563, y + paint.getTextSize(), aligned); y += Math.max(22, (int) paint.getTextSize() + 11); }
        void center(String text, Paint paint) { if (text == null || text.length() == 0) return; for (String line : lines(text, paint, 500)) { ensure(16); Paint aligned = new Paint(paint); aligned.setTextAlign(Paint.Align.CENTER); canvas.drawText(line, 297.5f, y + 10, aligned); y += 15; } }
        void wrapped(String text, Paint paint, int width, int height) { if (text == null || text.length() == 0) return; for (String line : lines(text, paint, width)) { ensure(height); canvas.drawText(line, 32, y + paint.getTextSize(), paint); y += height; } }
    }
    private static final class PdfAdapter extends PrintDocumentAdapter {
        final File file;
        PdfAdapter(File file) { this.file = file; }
        @Override public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancel, LayoutResultCallback callback, android.os.Bundle extras) {
            if (cancel.isCanceled()) { callback.onLayoutCancelled(); return; }
            callback.onLayoutFinished(new PrintDocumentInfo.Builder(file.getName()).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN).build(), !newAttributes.equals(oldAttributes));
        }
        @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancel, WriteResultCallback callback) {
            IO.execute(() -> {
                try (FileInputStream input = new FileInputStream(file); FileOutputStream output = new FileOutputStream(destination.getFileDescriptor())) {
                    byte[] buffer = new byte[16_384]; int read;
                    while ((read = input.read(buffer)) != -1) { if (cancel.isCanceled()) { MAIN.post(callback::onWriteCancelled); return; } output.write(buffer, 0, read); }
                    output.flush(); MAIN.post(() -> callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES}));
                } catch (Exception error) { MAIN.post(() -> callback.onWriteFailed("The PDF could not be sent to the printer.")); }
            });
        }
    }
}
