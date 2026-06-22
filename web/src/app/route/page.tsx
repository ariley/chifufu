"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RouteStore from "@/components/RouteStore";
import { useRoute } from "@/hooks/useRoute";
import { shareCart } from "@/lib/api";

export default function RoutePage() {
  const router = useRouter();
  const { stores, count, total, setQuantity, clear, items } = useRoute();
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  function buildGoogleMapsUrl() {
    const stops = stores.flatMap((s) => (s.address ? [s.address] : [s.storeName]));
    if (stops.length === 0) return null;
    const encoded = stops.map((s) => encodeURIComponent(s));
    return `https://www.google.com/maps/dir/My+Location/${encoded.join("/")}`;
  }

  async function handleShare() {
    if (items.length === 0) return;
    setSharing(true);
    try {
      const { webUrl } = await shareCart(items);
      await navigator.clipboard.writeText(webUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard fails
      try {
        const { webUrl } = await shareCart(items);
        prompt("Copy this link:", webUrl);
      } catch {
        alert("Could not share. Make sure you are connected.");
      }
    } finally {
      setSharing(false);
    }
  }

  function handleClear() {
    if (confirmClear) {
      clear();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  }

  const mapsUrl = buildGoogleMapsUrl();

  if (items.length === 0) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-48px)]">
        {/* Nav */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#E5E5EA] dark:border-[#38383A]">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="text-[28px] leading-8 text-[#1D9E75] mr-1"
          >
            ‹
          </button>
          <p className="flex-1 text-[16px] font-medium text-black dark:text-white">My Route</p>
        </div>
        {/* Empty */}
        <div className="flex flex-col items-center justify-center flex-1 p-10 gap-2">
          <span className="text-[52px] mb-2">🗺️</span>
          <p className="text-[18px] font-semibold text-black dark:text-white text-center">
            Your route is empty
          </p>
          <p className="text-[14px] text-[#6C6C70] dark:text-[#ABABAB] text-center leading-snug max-w-xs">
            Tap + on any result to add stops, then navigate to all stores in one trip.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-48px)]">
      {/* Nav */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#E5E5EA] dark:border-[#38383A] bg-white dark:bg-black">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="text-[28px] leading-8 text-[#1D9E75] mr-1"
        >
          ‹
        </button>
        <p className="flex-1 text-[16px] font-medium text-black dark:text-white">
          My Route · {count} {count === 1 ? "item" : "items"}
        </p>
        <button
          onClick={handleClear}
          className={`text-[14px] font-medium transition-colors ${
            confirmClear ? "text-[#FF3B30]" : "text-[#FF3B30]/70 hover:text-[#FF3B30]"
          }`}
        >
          {confirmClear ? "Tap to confirm" : "Clear"}
        </button>
      </div>

      {/* Store list */}
      <div className="flex-1 p-4 flex flex-col gap-3 pb-48">
        {stores.map((store) => (
          <RouteStore key={store.storeName} store={store} onSetQuantity={setQuantity} />
        ))}

        {/* Total */}
        <div className="flex justify-between items-center mt-2 px-1">
          <span className="text-[14px] text-[#6C6C70] dark:text-[#ABABAB]">Estimated total</span>
          <span className="text-[20px] font-semibold text-[#1D9E75]">${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-black px-6 pb-8 pt-3 border-t border-[#E5E5EA] dark:border-[#38383A]">
        <div className="max-w-[640px] mx-auto flex flex-col gap-2.5">
          {/* Share button */}
          <button
            onClick={handleShare}
            disabled={sharing}
            className="w-full rounded-xl border border-[#1D9E75] text-[#1D9E75] text-[15px] font-medium py-3.5 flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
          >
            {sharing ? (
              <span className="animate-spin">↻</span>
            ) : copied ? (
              "✓ Link copied!"
            ) : (
              "↑ Share Route with a Friend"
            )}
          </button>

          {/* Navigate button */}
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-xl bg-[#1D9E75] text-[#E1F5EE] text-[16px] font-medium py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              🗺️ Navigate — {stores.length} {stores.length === 1 ? "stop" : "stops"}
            </a>
          ) : (
            <button
              disabled
              className="w-full rounded-xl bg-[#1D9E75] text-[#E1F5EE] text-[16px] font-medium py-4 opacity-50 cursor-not-allowed"
            >
              🗺️ Navigate — {stores.length} {stores.length === 1 ? "stop" : "stops"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
