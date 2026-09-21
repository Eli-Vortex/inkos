import { describe, expect, it } from "vitest";
import { parseHash, routeToHash } from "./use-hash-route";
import { WORKBENCH_AREAS } from "../workbench/areas";

describe("hash route", () => {
  describe("parseHash", () => {
    it("parses empty hash as dashboard", () => {
      expect(parseHash("")).toEqual({ page: "dashboard" });
    });

    it("parses #/ as dashboard", () => {
      expect(parseHash("#/")).toEqual({ page: "dashboard" });
    });

    it("parses chat route", () => {
      expect(parseHash("#/chat")).toEqual({ page: "chat" });
    });

    it("parses book route", () => {
      expect(parseHash("#/book/my-novel")).toEqual({ page: "book", bookId: "my-novel" });
    });

    it("parses book settings route", () => {
      expect(parseHash("#/book/my-novel/settings")).toEqual({ page: "book-settings", bookId: "my-novel" });
    });

    it("decodes encoded bookId", () => {
      expect(parseHash("#/book/%E4%B9%9D%E9%BE%99")).toEqual({ page: "book", bookId: "九龙" });
    });

    it("parses book/new as book-create", () => {
      expect(parseHash("#/book/new")).toEqual({ page: "book-create" });
    });

    it("parses config as services (redirect)", () => {
      expect(parseHash("#/config")).toEqual({ page: "services" });
    });

    it("parses services", () => {
      expect(parseHash("#/services")).toEqual({ page: "services" });
    });

    it("parses project settings", () => {
      expect(parseHash("#/settings")).toEqual({ page: "project-settings" });
    });

    it("parses service-detail", () => {
      expect(parseHash("#/services/openai")).toEqual({ page: "service-detail", serviceId: "openai" });
    });

    it("parses import tab routes", () => {
      expect(parseHash("#/import/fanfic")).toEqual({ page: "import", tab: "fanfic" });
    });

    it("parses #/translation", () => {
      expect(parseHash("#/translation")).toEqual({ page: "translation" });
    });

    it("decodes encoded serviceId", () => {
      expect(parseHash("#/services/%E8%87%AA%E5%AE%9A%E4%B9%89")).toEqual({ page: "service-detail", serviceId: "自定义" });
    });

    it("falls back to dashboard for unknown hash", () => {
      expect(parseHash("#/unknown/route")).toEqual({ page: "dashboard" });
    });
  });

  describe("routeToHash", () => {
    it("dashboard -> #/", () => {
      expect(routeToHash({ page: "dashboard" })).toBe("#/");
    });

    it("chat -> #/chat", () => {
      expect(routeToHash({ page: "chat" })).toBe("#/chat");
    });

    it("book -> #/book/{id}", () => {
      expect(routeToHash({ page: "book", bookId: "novel-1" })).toBe("#/book/novel-1");
    });

    it("book-settings -> #/book/{id}/settings", () => {
      expect(routeToHash({ page: "book-settings", bookId: "novel-1" })).toBe("#/book/novel-1/settings");
    });

    it("encodes Chinese bookId", () => {
      const hash = routeToHash({ page: "book", bookId: "九龙城夜行" });
      expect(hash).toContain("#/book/");
      expect(decodeURIComponent(hash)).toContain("九龙城夜行");
    });

    it("book-create -> #/book/new", () => {
      expect(routeToHash({ page: "book-create" })).toBe("#/book/new");
    });

    it("services -> #/services", () => {
      expect(routeToHash({ page: "services" })).toBe("#/services");
    });

    it("project-settings -> #/settings", () => {
      expect(routeToHash({ page: "project-settings" })).toBe("#/settings");
    });

    it("service-detail -> #/services/{id}", () => {
      expect(routeToHash({ page: "service-detail", serviceId: "openai" })).toBe("#/services/openai");
    });

    it("import tab -> #/import/{tab}", () => {
      expect(routeToHash({ page: "import", tab: "chapters" })).toBe("#/import/chapters");
    });

    it("translation -> #/translation", () => {
      expect(routeToHash({ page: "translation" })).toBe("#/translation");
    });

    it("encodes Chinese serviceId", () => {
      const hash = routeToHash({ page: "service-detail", serviceId: "自定义" });
      expect(hash).toContain("#/services/");
      expect(decodeURIComponent(hash)).toContain("自定义");
    });

    it("round-trips auxiliary pages so a refresh keeps the author in place", () => {
      for (const page of ["doctor", "genres", "style", "radar", "daemon", "logs"] as const) {
        const hash = routeToHash({ page } as never);
        expect(hash).toBe(`#/${page}`);
        expect(parseHash(hash)).toEqual({ page });
      }
    });

    it("round-trips book-scoped pages", () => {
      const chapterHash = routeToHash({ page: "chapter", bookId: "novel-1", chapterNumber: 12 });
      expect(chapterHash).toBe("#/book/novel-1/chapter/12");
      expect(parseHash(chapterHash)).toEqual({ page: "chapter", bookId: "novel-1", chapterNumber: 12 });

      const analyticsHash = routeToHash({ page: "analytics", bookId: "novel-1" });
      expect(parseHash(analyticsHash)).toEqual({ page: "analytics", bookId: "novel-1" });

      const truthHash = routeToHash({ page: "truth", bookId: "novel-1" });
      expect(parseHash(truthHash)).toEqual({ page: "truth", bookId: "novel-1" });
    });
  });
});

describe("play route", () => {
  it("parses #/play/:id", () => {
    expect(parseHash("#/play/my-id")).toEqual({ page: "play", projectId: "my-id" });
  });
  it("round-trips to hash", () => {
    expect(routeToHash({ page: "play", projectId: "my-id" })).toBe("#/play/my-id");
  });
  it("decodes url-encoded ids", () => {
    expect(parseHash("#/play/a%20b")).toEqual({ page: "play", projectId: "a b" });
  });
});

describe("workbench route", () => {
  it("parses #/workbench as the workbench with no area chosen yet", () => {
    expect(parseHash("#/workbench")).toEqual({ page: "workbench" });
  });

  it("parses every declared area", () => {
    for (const area of WORKBENCH_AREAS) {
      expect(parseHash(`#/workbench/${area}`)).toEqual({ page: "workbench", area });
    }
  });

  it("keeps the route and drops only an unknown area", () => {
    expect(parseHash("#/workbench/chapter")).toEqual({ page: "workbench" });
  });

  it("carries the book context so a deep link can select it", () => {
    expect(parseHash("#/workbench/outline/九龙城夜行")).toEqual({
      page: "workbench",
      area: "outline",
      bookId: "九龙城夜行",
    });
  });

  it("decodes an encoded book id", () => {
    expect(parseHash("#/workbench/compare/%E4%B9%9D%E9%BE%99")).toEqual({
      page: "workbench",
      area: "compare",
      bookId: "九龙",
    });
  });

  it("does not shadow an existing route", () => {
    expect(parseHash("#/chat")).toEqual({ page: "chat" });
    expect(parseHash("#/book/alpha")).toEqual({ page: "book", bookId: "alpha" });
    expect(parseHash("#/services/openai")).toEqual({ page: "service-detail", serviceId: "openai" });
  });

  it("round-trips area and book context", () => {
    expect(routeToHash({ page: "workbench" })).toBe("#/workbench");
    expect(routeToHash({ page: "workbench", area: "books" })).toBe("#/workbench/books");
    expect(routeToHash({ page: "workbench", area: "compare", bookId: "b-1" })).toBe("#/workbench/compare/b-1");
  });

  it("never emits a book context without an area, so the book survives a reload", () => {
    const hash = routeToHash({ page: "workbench", bookId: "b-1" });
    expect(hash).toBe("#/workbench/writing/b-1");
    expect(parseHash(hash)).toEqual({ page: "workbench", area: "writing", bookId: "b-1" });
  });
});
