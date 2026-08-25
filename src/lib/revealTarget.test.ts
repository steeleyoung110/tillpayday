import { describe, expect, it } from "vitest";
import { revealTarget, type DetailsLike, type Revealable } from "./revealTarget";

/** A <details> that knows what it's nested inside. */
function details(parent: DetailsLike | null, open = false): DetailsLike {
  return {
    open,
    parentElement: parent === null ? null : { closest: () => parent },
  };
}

function target(inside: DetailsLike | null) {
  const calls: string[] = [];
  const el: Revealable = {
    closest: () => inside,
    scrollIntoView: () => calls.push("scroll"),
    focus: () => calls.push("focus"),
  };
  return { el, calls };
}

describe("revealTarget", () => {
  it("scrolls to a field that isn't hidden inside anything", () => {
    const { el, calls } = target(null);
    expect(revealTarget(el)).toBe(0);
    expect(calls).toEqual(["scroll"]);
  });

  it("opens the collapsed <details> a field is hiding in", () => {
    const d = details(null);
    const { el } = target(d);
    expect(revealTarget(el)).toBe(1);
    expect(d.open).toBe(true);
  });

  it("opens every level of nesting, outermost included", () => {
    const outer = details(null);
    const inner = details(outer);
    const { el } = target(inner);
    expect(revealTarget(el)).toBe(2);
    expect(inner.open).toBe(true);
    expect(outer.open).toBe(true);
  });

  it("leaves an already-open <details> alone", () => {
    const d = details(null, true);
    const { el } = target(d);
    expect(revealTarget(el)).toBe(0);
    expect(d.open).toBe(true);
  });

  it("opens before it scrolls — a field in a closed panel has no position", () => {
    const order: string[] = [];
    const d: DetailsLike = {
      get open() {
        return false;
      },
      set open(v: boolean) {
        if (v) order.push("open");
      },
      parentElement: null,
    };
    const el: Revealable = {
      closest: () => d,
      scrollIntoView: () => order.push("scroll"),
      focus: () => order.push("focus"),
    };
    revealTarget(el);
    expect(order).toEqual(["open", "scroll"]);
  });
});
