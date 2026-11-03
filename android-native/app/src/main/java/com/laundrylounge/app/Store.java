package com.laundrylounge.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native private storage. Each record is a separate row, and saves are atomic. */
public final class Store extends SQLiteOpenHelper {
    private static final String[] TABLES = {"customers", "orders", "expenses"};
    private JSONObject data;

    public Store(Context context) { this(context, true); }
    private Store(Context context, boolean readExisting) {
        super(context.getApplicationContext(), "native-laundry-lounge.db", null, 1);
        setWriteAheadLoggingEnabled(true);
        SQLiteDatabase database = getWritableDatabase();
        if (!readExisting) return;
        try (Cursor meta = database.query("settings", new String[]{"data"}, "id=?", new String[]{"business"}, null, null, null)) {
            if (!meta.moveToFirst()) {
                long existing = 0;
                for (String table : TABLES) try (Cursor count = database.rawQuery("SELECT COUNT(*) FROM " + table, null)) { if (count.moveToFirst()) existing += count.getLong(0); }
                if (existing != 0) throw new IllegalStateException("Saved business settings are missing. Existing records have been preserved. Restore a backup before changing data.");
                data = Records.emptyStore();
                save(data);
                return;
            }
            JSONObject loaded = Records.emptyStore();
            JSONObject settings = new JSONObject(meta.getString(0));
            StringBuilder logo = new StringBuilder();
            try (Cursor chunks = database.query("settings", new String[]{"data"}, "id LIKE ?", new String[]{"logo-%"}, null, null, "id ASC")) {
                while (chunks.moveToNext()) logo.append(chunks.getString(0));
            }
            if (logo.length() > 0) Records.put(settings, "logo", logo.toString());
            Records.put(loaded, "settings", settings);
            for (String table : TABLES) {
                JSONArray rows = new JSONArray();
                try (Cursor cursor = database.query(table, new String[]{"data"}, null, null, null, null, "position ASC")) {
                    while (cursor.moveToNext()) rows.put(new JSONObject(cursor.getString(0)));
                }
                Records.put(loaded, table, rows);
            }
            if (!Records.validate(loaded)) throw new IllegalStateException("Saved records are invalid. Existing data has been preserved; restore a valid backup.");
            data = loaded;
        } catch (IllegalStateException error) { close(); throw error; }
        catch (Exception error) { close(); throw new IllegalStateException("Saved records could not be read. Existing data has been preserved.", error); }
    }
    /** Called only by a user-confirmed restore/reset flow; validation happens first. */
    public static Store restore(Context context, JSONObject backup) {
        if (!Records.validate(backup)) throw new IllegalArgumentException("Choose a valid Laundry Lounge backup.");
        Store store = new Store(context, false);
        try { store.save(backup); return store; }
        catch (RuntimeException error) { store.close(); throw error; }
    }
    @Override public void onCreate(SQLiteDatabase db) {
        for (String table : TABLES) db.execSQL("CREATE TABLE " + table + " (id TEXT PRIMARY KEY NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL)");
        db.execSQL("CREATE TABLE settings (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int previous, int next) { throw new IllegalStateException("A database migration is required; no records have been removed."); }
    public synchronized JSONObject snapshot() { return Records.cloneObject(data); }
    public synchronized void save(JSONObject next) {
        if (!Records.validate(next)) throw new IllegalArgumentException("The records contain invalid values and could not be saved.");
        // Clone first so caller mutations after a save cannot change the active snapshot.
        JSONObject accepted = Records.cloneObject(next);
        SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try {
            for (String table : TABLES) {
                db.delete(table, null, null); JSONArray rows = Records.array(accepted, table);
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject item = rows.optJSONObject(i); ContentValues values = new ContentValues();
                    values.put("id", item.optString("id")); values.put("position", i); values.put("data", item.toString());
                    db.insertOrThrow(table, null, values);
                }
            }
            JSONObject business = Records.cloneObject(accepted.optJSONObject("settings"));
            String logo = business.optString("logo", ""); business.remove("logo");
            db.delete("settings", null, null);
            ContentValues settings = new ContentValues(); settings.put("id", "business"); settings.put("data", business.toString());
            db.insertOrThrow("settings", null, settings);
            // Store larger original-logo data in bounded rows, not one CursorWindow.
            int chunk = 0;
            for (int offset = 0; offset < logo.length(); offset += 131072) {
                ContentValues part = new ContentValues();
                part.put("id", String.format(java.util.Locale.ROOT, "logo-%06d", chunk++));
                part.put("data", logo.substring(offset, Math.min(logo.length(), offset + 131072)));
                db.insertOrThrow("settings", null, part);
            }
            db.setTransactionSuccessful();
        } catch (Exception error) { throw new IllegalStateException("Your phone could not save these changes. Existing records have been kept. Export a backup and check free storage.", error); }
        finally { db.endTransaction(); }
        data = accepted;
    }
}
