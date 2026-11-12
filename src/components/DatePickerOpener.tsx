"use client";

/**
 * Click anywhere in a date (or month) field to open its calendar.
 *
 * Desktop browsers only open the picker from the small calendar icon; a click
 * on the date text just selects a segment to type over, which reads as "the
 * calendar didn't pop up". Mounted once in the root layout so every date field
 * in the app behaves the same. Phones already open their own picker on tap,
 * so this only runs where there's a mouse. Typing a date still works.
 */
import { useEffect } from "react";

export function DatePickerOpener() {
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.type !== "date" && el.type !== "month") return;
      if (el.disabled || el.readOnly) return;
      try {
        el.showPicker?.();
      } catch {
        // Older browser or picker not allowed here: the field still takes typing.
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
