import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "./types";

type CartState = {
  items: CartLine[];
  coupon: string;
  add: (line: Omit<CartLine, "quantity">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setCoupon: (code: string) => void;
  count: () => number;
};

export function lineKey(line: { productId: string; variantId?: string }) {
  return line.variantId ? `${line.productId}:${line.variantId}` : line.productId;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      coupon: "",
      add: (line, qty = 1) => {
        const key = lineKey(line);
        const items = [...get().items];
        const i = items.findIndex((it) => lineKey(it) === key);
        if (i >= 0) items[i] = { ...items[i], quantity: items[i].quantity + qty };
        else items.push({ ...line, quantity: qty });
        set({ items });
      },
      setQty: (key, qty) => {
        if (qty <= 0) {
          set({ items: get().items.filter((it) => lineKey(it) !== key) });
          return;
        }
        set({
          items: get().items.map((it) =>
            lineKey(it) === key ? { ...it, quantity: qty } : it,
          ),
        });
      },
      remove: (key) => set({ items: get().items.filter((it) => lineKey(it) !== key) }),
      clear: () => set({ items: [], coupon: "" }),
      setCoupon: (code) => set({ coupon: code }),
      count: () => get().items.reduce((n, it) => n + it.quantity, 0),
    }),
    { name: "masaala-cart" },
  ),
);
