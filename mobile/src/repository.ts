import { seedStore, validateStore } from "./domain-core";
import type { SnapshotStorage } from "./storage-core";
import type { Store } from "./types";

/** Native persistence contract; native SQLite is injected so it can be tested. */
export function createStoreRepository(storage: SnapshotStorage) {
  async function rawSavedData(): Promise<string | null> {
    try {
      return await storage.read();
    } catch {
      throw new Error(
        "Saved data could not be accessed on this phone. Please try again.",
      );
    }
  }
  async function saveStore(store: Store): Promise<void> {
    if (!validateStore(store))
      throw new Error(
        "These changes contain invalid data and could not be saved.",
      );
    try {
      await storage.write(JSON.stringify(store));
    } catch {
      throw new Error(
        "This phone could not save the changes. Free up storage and try again, or export a backup.",
      );
    }
  }
  async function loadStore(): Promise<Store> {
    const raw = await rawSavedData();
    if (raw === null) {
      const initial = seedStore();
      await saveStore(initial);
      return initial;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        "Saved data could not be read. Your original records are preserved. Restore a valid backup to recover.",
      );
    }
    if (!validateStore(data))
      throw new Error(
        "Saved data is invalid. Your original records are preserved. Restore a valid backup to recover.",
      );
    return data;
  }
  return { loadStore, saveStore, rawSavedData };
}
