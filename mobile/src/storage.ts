import * as SQLite from "expo-sqlite";
import { createSnapshotStorage } from "./storage-core";

// expo-sqlite reads TEXT directly through SQLite, avoiding Android CursorWindow
// and AsyncStorage's small per-entry limit. This file stays inside app storage.
export const DATABASE_NAME = "laundry-lounge.db";
export const snapshotStorage = createSnapshotStorage(() =>
  SQLite.openDatabaseAsync(DATABASE_NAME),
);
