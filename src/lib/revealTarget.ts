/**
 * Take someone to the field that fixes an empty section: open whatever it's
 * hidden inside, scroll it into view, then focus it.
 *
 * Split out of the component so the order-of-operations is testable without a
 * browser. The order matters — focusing a field inside a closed <details>
 * does nothing, and focusing before the scroll starts makes iOS yank the page.
 */

/** The slice of the DOM this needs. Kept narrow so tests can fake it. */
export interface Revealable {
  closest(selector: string): DetailsLike | null;
  scrollIntoView(opts: { block: "center"; behavior: "smooth" }): void;
  focus(): void;
}

export interface DetailsLike {
  open: boolean;
  parentElement: { closest(selector: string): DetailsLike | null } | null;
}

/**
 * Opens every <details> the element sits inside, then scrolls to it.
 * Returns how many were opened — the tests care, the caller doesn't.
 */
export function revealTarget(el: Revealable): number {
  let opened = 0;
  for (
    let d = el.closest("details");
    d;
    d = d.parentElement?.closest("details") ?? null
  ) {
    if (!d.open) opened += 1;
    d.open = true;
  }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  return opened;
}
