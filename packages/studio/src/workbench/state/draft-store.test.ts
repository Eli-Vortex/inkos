import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDraftMirror,
  findRecoverableDraft,
  loadDraftMirror,
  saveDraftMirror,
  type DraftKey,
} from "./draft-store";

/** Minimal in-memory Storage so the mirror can be exercised without a browser. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  } as Storage;
}

const key: DraftKey = {
  bookId: "b1",
  chapterId: "b1-ch-3",
  candidateId: "b1-ch-3-current",
};

describe("draft mirror", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeStorage() };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("round-trips a mirrored draft", () => {
    saveDraftMirror({ key, baseRevision: 4, body: "未保存的正文" });
    const record = loadDraftMirror(key);
    expect(record?.body).toBe("未保存的正文");
    expect(record?.baseRevision).toBe(4);
  });

  it("keeps chapters independent", () => {
    saveDraftMirror({ key, baseRevision: 4, body: "第三章草稿" });
    saveDraftMirror({
      key: { ...key, chapterId: "b1-ch-4", candidateId: "b1-ch-4-current" },
      baseRevision: 1,
      body: "第四章草稿",
    });
    expect(loadDraftMirror(key)?.body).toBe("第三章草稿");
    expect(loadDraftMirror({ ...key, chapterId: "b1-ch-4", candidateId: "b1-ch-4-current" })?.body)
      .toBe("第四章草稿");
  });

  it("clears a mirror once the server has the text", () => {
    saveDraftMirror({ key, baseRevision: 4, body: "x" });
    clearDraftMirror(key);
    expect(loadDraftMirror(key)).toBeNull();
  });

  it("offers a draft that differs from the server text", () => {
    saveDraftMirror({ key, baseRevision: 4, body: "本地更新" });
    const found = findRecoverableDraft({ key, baseRevision: 4, serverBody: "服务端旧文" });
    expect(found?.body).toBe("本地更新");
  });

  it("does not offer a draft identical to the server text", () => {
    saveDraftMirror({ key, baseRevision: 4, body: "一样的正文" });
    expect(findRecoverableDraft({ key, baseRevision: 4, serverBody: "一样的正文" })).toBeNull();
  });

  it("does not offer a draft written against a different revision", () => {
    saveDraftMirror({ key, baseRevision: 3, body: "旧基线草稿" });
    // Replaying this over r4 could overwrite prose written since.
    expect(findRecoverableDraft({ key, baseRevision: 4, serverBody: "服务端新文" })).toBeNull();
  });

  it("ignores a corrupt mirror instead of throwing", () => {
    (globalThis as { window: { localStorage: Storage } }).window.localStorage
      .setItem("inkos.workbench.draft:b1:b1-ch-3:b1-ch-3-current", "{not json");
    expect(loadDraftMirror(key)).toBeNull();
  });

  it("ignores a mirror from an unknown schema version", () => {
    (globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(
      "inkos.workbench.draft:b1:b1-ch-3:b1-ch-3-current",
      JSON.stringify({ schemaVersion: 99, body: "x" }),
    );
    expect(loadDraftMirror(key)).toBeNull();
  });

  it("is inert when storage is unavailable, rather than failing the editor", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(() => saveDraftMirror({ key, baseRevision: 1, body: "x" })).not.toThrow();
    expect(loadDraftMirror(key)).toBeNull();
  });
});
