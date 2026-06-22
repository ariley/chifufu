"use client";

import { StoreGroup } from "@/lib/types";

interface RouteStoreProps {
  store: StoreGroup;
  onSetQuantity: (id: string, qty: number) => void;
}

export default function RouteStore({ store, onSetQuantity }: RouteStoreProps) {
  return (
    <div className="rounded-2xl border border-[#E5E5EA] dark:border-[#38383A] bg-[#F2F2F7] dark:bg-[#1C1C1E] overflow-hidden">
      {/* Store header */}
      <div className="flex items-center gap-2.5 p-3.5">
        <span className="text-[22px]">🏪</span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-black dark:text-white truncate">
            {store.storeName}
          </p>
          {store.address && (
            <p className="text-[12px] text-[#AEAEB2] dark:text-[#636366] truncate mt-0.5">
              {store.address}
            </p>
          )}
        </div>
      </div>

      {/* Items */}
      {store.items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 px-3.5 py-2.5 border-t border-[#E5E5EA] dark:border-[#38383A]"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[14px] text-black dark:text-white truncate">{item.description}</p>
            <p className="text-[12px] font-medium text-[#1D9E75] mt-0.5">{item.price} each</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSetQuantity(item.id, item.quantity - 1)}
              className="w-7 h-7 rounded-full border border-[#E5E5EA] dark:border-[#38383A] flex items-center justify-center text-base text-black dark:text-white hover:border-[#1D9E75] transition-colors"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="text-[15px] font-medium text-black dark:text-white w-5 text-center">
              {item.quantity}
            </span>
            <button
              onClick={() => onSetQuantity(item.id, item.quantity + 1)}
              className="w-7 h-7 rounded-full border border-[#E5E5EA] dark:border-[#38383A] flex items-center justify-center text-base text-[#1D9E75] hover:border-[#1D9E75] transition-colors"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
