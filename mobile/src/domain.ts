import { createStoreRepository } from "./repository";
import { snapshotStorage } from "./storage";
export * from "./domain-core";

// Native screens retain one async repository API. Database writes finish before
// the caller updates React state, so a failed write cannot appear as saved.
const repository = createStoreRepository(snapshotStorage);
export const loadStore = repository.loadStore;
export const saveStore = repository.saveStore;
export const rawSavedData = repository.rawSavedData;
