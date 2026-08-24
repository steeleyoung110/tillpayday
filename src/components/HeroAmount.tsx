"use client";

/**
 * The safe-to-spend number. Wraps CountUp with the dashboard's exact money
 * formatting so the animation and the static render can't disagree by a cent.
 */
import { CountUp } from "@/components/CountUp";

const heroCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function HeroAmount({ value }: { value: number }) {
  return <CountUp value={value} format={(n) => heroCurrency.format(n)} />;
}
