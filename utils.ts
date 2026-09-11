import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDzd(amount: number, lang: "ar" | "fr"): string {
  const n = new Intl.NumberFormat("fr-DZ").format(Math.round(amount));
  return lang === "ar" ? `${n} د.ج` : `${n} DA`;
}

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || `p-${Date.now().toString(36)}`;
}

export function orderNumber(): string {
  const part = Math.random().toString(36).slice(2, 8).toUpperCase();
  const n = Date.now().toString(36).toUpperCase().slice(-4);
  return `MAS-${n}${part}`;
}


