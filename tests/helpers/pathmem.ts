// Shared path-memory reset — the captured full paths live beside the folder
// handles (I-63), so a test that must start with nothing captured drops the
// memory first. The double keeps object identity, as IndexedDB does for a real
// handle, which is what makes a restored folder provable across a "reload".
import { resetPathMemory, type PathStore, type StoredPath } from "../../src/lib/pathmemory";

/** An in-memory capture store, plus what it now holds. */
export interface PathMemoryDouble extends PathStore {
  rows(): StoredPath[];
}

/** Points the app's path memory at a fresh double — call it in `beforeEach`. */
export function freshPathMemory(): PathMemoryDouble {
  let rows: StoredPath[] = [];
  const store: PathMemoryDouble = {
    read: async () => rows,
    write: async (next) => { rows = [...next]; },
    rows: () => rows,
  };
  resetPathMemory(store);
  return store;
}
