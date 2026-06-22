"use client";

import { useCallback, useEffect, useState } from "react";
import { ResultItem, RouteItem, StoreGroup } from "@/lib/types";

const STORAGE_KEY = "chifufu_route";

function load(): RouteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(items: RouteItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useRoute() {
  const [items, setItems] = useState<RouteItem[]>([]);

  useEffect(() => {
    setItems(load());
  }, []);

  const persist = useCallback((next: RouteItem[]) => {
    setItems(next);
    save(next);
  }, []);

  const add = useCallback(
    (item: ResultItem) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.id === item.id);
        let next: RouteItem[];
        if (existing) {
          next = prev.map((i) =>
            i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
          );
        } else {
          next = [...prev, { ...item, quantity: 1 }];
        }
        save(next);
        return next;
      });
    },
    []
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        save(next);
        return next;
      });
    },
    []
  );

  const setQuantity = useCallback(
    (id: string, qty: number) => {
      if (qty <= 0) {
        remove(id);
        return;
      }
      setItems((prev) => {
        const next = prev.map((i) =>
          i.id === id ? { ...i, quantity: qty } : i
        );
        save(next);
        return next;
      });
    },
    [remove]
  );

  const clear = useCallback(() => persist([]), [persist]);

  const isInRoute = useCallback(
    (id: string) => items.some((i) => i.id === id),
    [items]
  );

  const count = items.reduce((s, i) => s + i.quantity, 0);

  // Group by store name
  const stores: StoreGroup[] = (() => {
    const map = new Map<string, StoreGroup>();
    for (const item of items) {
      if (!map.has(item.name)) {
        map.set(item.name, {
          storeName: item.name,
          address: item.address,
          lat: item.lat,
          lng: item.lng,
          items: [],
        });
      }
      map.get(item.name)!.items.push(item);
    }
    return Array.from(map.values());
  })();

  const total = items.reduce((s, i) => s + i.priceValue * i.quantity, 0);

  return { items, stores, count, total, add, remove, setQuantity, clear, isInRoute };
}
