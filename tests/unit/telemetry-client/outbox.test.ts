/**
 * Outbox backends: IndexedDB (fake-indexeddb), localStorage fallback when IndexedDB is absent,
 * and seq resumption across "reloads" on a persistent store.
 */
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IndexedDbOutbox,
  LOCAL_STORAGE_PREFIX,
  LocalStorageOutbox,
  MemoryOutbox,
  createTelemetryTracker,
  openDefaultOutbox,
  type Outbox,
} from "@/features/telemetry/client";

import { SESSION, fakeFetch } from "./helpers";

class MapStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const tracker = (storage: Outbox, replies: Parameters<typeof fakeFetch>[0] = [500, 500, 500]) =>
  createTelemetryTracker({
    sessionId: SESSION,
    contentVersion: "v1",
    appBuild: "b",
    mode: "study",
    storage,
    fetchImpl: fakeFetch(replies).impl,
    sendBeacon: null,
    lifecycle: false,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("telemetry outbox", () => {
  it("prefers IndexedDB and resumes the seq after a reload", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("IDBKeyRange", IDBKeyRange);
    const store = await openDefaultOutbox();
    expect(store.kind).toBe("indexeddb");
    const t1 = tracker(store);
    await t1.pageEntered();
    await t1.pageExited();
    await t1.flush(); // 500: stays stored
    t1.dispose();

    const reopened = await IndexedDbOutbox.open();
    expect((await reopened.list(SESSION)).map((e) => e.seq)).toEqual([0, 1]);
    expect(await reopened.getNextSeq(SESSION)).toBe(2);
    const t2 = tracker(reopened, [200]);
    expect((await t2.sessionResumed())?.seq).toBe(2);
    await t2.flush();
    expect(t2.getStats()).toMatchObject({ acked: 3, pending: 0 });
    expect(await reopened.list(SESSION)).toEqual([]);
    await reopened.addDeadLetters(SESSION, [{ event: (await t2.pageEntered())!, reason: "x", status: 400, at: new Date().toISOString() }]);
    expect(await reopened.listDeadLetters(SESSION)).toHaveLength(1);
  });

  it("falls back to localStorage when IndexedDB is absent", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const ls = new MapStorage();
    vi.stubGlobal("localStorage", ls);
    const store = await openDefaultOutbox();
    expect(store.kind).toBe("localstorage");
    const t = tracker(store);
    await t.pageEntered();
    await t.flush();
    expect(JSON.parse(ls.getItem(`${LOCAL_STORAGE_PREFIX}:${SESSION}:events`)!)).toHaveLength(1);
    expect(ls.getItem(`${LOCAL_STORAGE_PREFIX}:${SESSION}:next-seq`)).toBe("1");
    const again = tracker(new LocalStorageOutbox(ls));
    expect((await again.pageEntered())?.seq).toBe(1);
  });

  it("falls back to memory when no storage works", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("localStorage", {
      setItem() {
        throw new Error("denied");
      },
    });
    expect((await openDefaultOutbox()).kind).toBe("memory");
    expect(new MemoryOutbox().kind).toBe("memory");
  });

  it("keeps events in memory and counts the error when a storage write fails", async () => {
    const failing = new MemoryOutbox();
    failing.append = async () => {
      throw new Error("quota");
    };
    const t = tracker(failing, [200]);
    await t.pageEntered();
    expect(t.getStats()).toMatchObject({ storageErrors: 1, pending: 1, lastError: { code: "storage_write_failed" } });
    await t.flush();
    expect(t.getStats()).toMatchObject({ acked: 1, pending: 0 });
  });
});
