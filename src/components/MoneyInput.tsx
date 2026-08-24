"use client";

/**
 * A money field that behaves like money. Numeric keypad on phones, thousands
 * separators appearing as you type, cents that stop at two places.
 *
 * The visible input is decoration; a hidden sibling carries the plain number
 * under the real `name`, so every existing Server Action keeps receiving
 * exactly what it received before — no parsing changes anywhere downstream.
 */
import { useId, useState } from "react";
import { formatMoneyInput, parseMoneyInput, toMoneyDisplay } from "@/lib/moneyInput";

export function MoneyInput({
  name,
  defaultValue,
  placeholder = "$ 0.00",
  required,
  className = "",
  ariaLabel,
  autoFocus,
  onValueChange,
}: {
  /** Form field name the Server Action reads. */
  name: string;
  defaultValue?: number | string | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** Live plain-number value, for forms that preview consequences. */
  onValueChange?: (value: string) => void;
}) {
  const [display, setDisplay] = useState(() => toMoneyDisplay(defaultValue));
  const id = useId();
  const raw = parseMoneyInput(display);

  return (
    <>
      <input
        id={id}
        type="text"
        // Numeric keypad with a decimal point, without `type=number`'s
        // scroll-wheel and spinner sharp edges.
        inputMode="decimal"
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoFocus={autoFocus}
        // Validation lives on the visible field: hidden inputs are exempt
        // from constraint validation, so `required` there does nothing.
        required={required}
        value={display}
        onChange={(e) => {
          const next = formatMoneyInput(e.target.value);
          setDisplay(next);
          onValueChange?.(parseMoneyInput(next));
        }}
        onBlur={() => {
          // Tidy a half-typed "12." into "12" once they leave the field.
          if (display.endsWith(".")) setDisplay(display.slice(0, -1));
        }}
        className={className}
      />
      <input type="hidden" name={name} value={raw} />
    </>
  );
}
