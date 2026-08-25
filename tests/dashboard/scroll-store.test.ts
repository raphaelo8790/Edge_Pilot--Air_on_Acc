/**
 * The speedometer's scroll store — the state machine behind the cockpit mark.
 *
 * WHY THIS IS A TEST AND NOT A CLICK-THROUGH. The gauge reads scroll position
 * to wind the needle up, and shows a reverse lamp when the page is scrolled
 * back up. Neither behaviour can be observed in a hidden document: a
 * backgrounded page fires no scroll events and no animation frames at all, so
 * a browser check of this feature proves nothing. The rules are pinned here
 * instead, where they can actually fail.
 *
 * The store touches five browser APIs and nothing else, so they are stubbed
 * directly rather than pulling in a DOM environment the rest of this suite
 * does not use.
 */

interface FakePage {
  setScroll: (y: number) => void;
  fireScroll: () => void;
  listenerCount: (type: string) => number;
}

function installFakeWindow({
  scrollHeight = 2000,
  innerHeight = 1000,
}: { scrollHeight?: number; innerHeight?: number } = {}): FakePage {
  const listeners = new Map<string, Set<() => void>>();
  const win = {
    scrollY: 0,
    innerHeight,
    addEventListener(type: string, fn: () => void) {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
  };

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = win;
  globals.document = { documentElement: { scrollHeight } };
  // Frames run synchronously so assertions do not need to await anything.
  globals.requestAnimationFrame = (cb: (t: number) => void) => {
    cb(0);
    return 1;
  };
  globals.cancelAnimationFrame = () => {};

  return {
    setScroll: (y: number) => {
      win.scrollY = y;
    },
    fireScroll: () => {
      listeners.get("scroll")?.forEach((fn) => fn());
    },
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

function cleanupFakeWindow() {
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals.window;
  delete globals.document;
  delete globals.requestAnimationFrame;
  delete globals.cancelAnimationFrame;
}

/** The store is a module-level singleton, so each test gets a fresh copy. */
async function freshStore() {
  jest.resetModules();
  return import("@/components/scrollStore");
}

describe("scroll store", () => {
  let page: FakePage;

  beforeEach(() => {
    page = installFakeWindow();
  });

  afterEach(() => {
    cleanupFakeWindow();
  });

  /** scrollHeight 2000 - innerHeight 1000 = 1000px of travel. */
  const scrollTo = (y: number) => {
    page.setScroll(y);
    page.fireScroll();
  };

  test("parks at zero progress before any scrolling", async () => {
    const store = await freshStore();
    const stop = store.subscribeScroll(() => {});

    expect(store.parseScroll(store.getScrollSnapshot())).toEqual({
      progress: 0,
      reverse: false,
    });
    stop();
  });

  test("scrolling down winds progress up towards 1", async () => {
    const store = await freshStore();
    const stop = store.subscribeScroll(() => {});

    scrollTo(250);
    expect(
      store.parseScroll(store.getScrollSnapshot()).progress,
    ).toBeCloseTo(0.25, 1);

    scrollTo(750);
    expect(
      store.parseScroll(store.getScrollSnapshot()).progress,
    ).toBeCloseTo(0.75, 1);

    scrollTo(1000);
    const end = store.parseScroll(store.getScrollSnapshot());
    expect(end.progress).toBe(1);
    expect(end.reverse).toBe(false);
    stop();
  });

  test("scrolling back up engages reverse without losing position", async () => {
    const store = await freshStore();
    const stop = store.subscribeScroll(() => {});

    scrollTo(800);
    expect(store.parseScroll(store.getScrollSnapshot()).reverse).toBe(false);

    scrollTo(600); // backing up
    const reversing = store.parseScroll(store.getScrollSnapshot());
    expect(reversing.reverse).toBe(true);
    expect(reversing.progress).toBeCloseTo(0.6, 1);

    scrollTo(900); // forwards again
    expect(store.parseScroll(store.getScrollSnapshot()).reverse).toBe(false);
    stop();
  });

  test("returning to the top comes out of reverse, so the mark cannot stick", async () => {
    const store = await freshStore();
    const stop = store.subscribeScroll(() => {});

    scrollTo(800);
    scrollTo(400);
    expect(store.parseScroll(store.getScrollSnapshot()).reverse).toBe(true);

    scrollTo(0);
    expect(store.parseScroll(store.getScrollSnapshot())).toEqual({
      progress: 0,
      reverse: false,
    });
    stop();
  });

  test("a jitter smaller than the deadzone does not flip direction", async () => {
    const store = await freshStore();
    const stop = store.subscribeScroll(() => {});

    scrollTo(500);
    scrollTo(499); // 1px of trackpad noise, under the 2px deadzone
    expect(store.parseScroll(store.getScrollSnapshot()).reverse).toBe(false);
    stop();
  });

  test("notifies subscribers only when the quantised snapshot changes", async () => {
    const store = await freshStore();
    const onChange = jest.fn();
    const stop = store.subscribeScroll(onChange);
    onChange.mockClear();

    scrollTo(500);
    const afterRealMove = onChange.mock.calls.length;
    expect(afterRealMove).toBeGreaterThan(0);

    scrollTo(500); // same position: nothing to report
    expect(onChange.mock.calls.length).toBe(afterRealMove);
    stop();
  });

  test("an unscrollable page reports zero rather than dividing by zero", async () => {
    cleanupFakeWindow();
    page = installFakeWindow({ scrollHeight: 800, innerHeight: 800 });
    const store = await freshStore();
    const stop = store.subscribeScroll(() => {});

    scrollTo(0);
    const snapshot = store.parseScroll(store.getScrollSnapshot());
    expect(Number.isFinite(snapshot.progress)).toBe(true);
    expect(snapshot.progress).toBe(0);
    stop();
  });

  test("detaches its listeners when the last subscriber leaves", async () => {
    const store = await freshStore();

    const stopA = store.subscribeScroll(() => {});
    const stopB = store.subscribeScroll(() => {});
    expect(page.listenerCount("scroll")).toBe(1);

    stopA();
    expect(page.listenerCount("scroll")).toBe(1); // one subscriber remains

    stopB();
    expect(page.listenerCount("scroll")).toBe(0);
    expect(page.listenerCount("resize")).toBe(0);
  });

  test("the server snapshot is the parked gauge", async () => {
    const store = await freshStore();
    expect(store.parseScroll(store.getScrollServerSnapshot())).toEqual({
      progress: 0,
      reverse: false,
    });
  });
});
