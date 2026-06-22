"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ResultCard from "@/components/ResultCard";
import { SkeletonList } from "@/components/SkeletonCard";
import { fetchResults } from "@/lib/api";
import { CategoryKey, ResultItem } from "@/lib/types";
import { useRoute } from "@/hooks/useRoute";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  "go-out": "Go out",
  "order-in": "Order in",
  grocery: "Groceries",
  under5: "Under $5",
  under10: "Under $10",
  "pet-stores": "Pet Stores",
};

const CHIPS: { key: CategoryKey; label: string }[] = [
  { key: "go-out", label: "Go out" },
  { key: "order-in", label: "Order in" },
  { key: "grocery", label: "Groceries" },
  { key: "pet-stores", label: "🐾 Pet Stores" },
  { key: "under5", label: "Under $5" },
  { key: "under10", label: "Under $10" },
];

interface DetailDrawerProps {
  item: ResultItem;
  inRoute: boolean;
  onAddToRoute: () => void;
  onClose: () => void;
}

function DetailDrawer({ item, inRoute, onAddToRoute, onClose }: DetailDrawerProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[640px] bg-white dark:bg-[#1C1C1E] rounded-t-2xl p-6 pb-10 animate-[slideUp_0.2s_ease-out]">
        <div className="w-10 h-1 bg-[#E5E5EA] dark:bg-[#38383A] rounded-full mx-auto mb-5" />
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-[18px] font-semibold text-black dark:text-white leading-snug flex-1">
            {item.name}
          </h2>
          <span className="text-[20px] font-semibold text-[#1D9E75] shrink-0">{item.price}</span>
        </div>
        <p className="text-[14px] text-[#6C6C70] dark:text-[#ABABAB] mb-4">{item.description}</p>
        {item.address && (
          <p className="text-[13px] text-[#AEAEB2] dark:text-[#636366] mb-4">
            📍 {item.address}
          </p>
        )}
        {item.platform && (
          <p className="text-[13px] text-[#AEAEB2] dark:text-[#636366] mb-4">
            Via {item.platform}
          </p>
        )}
        <button
          onClick={() => {
            onAddToRoute();
            onClose();
          }}
          className={`w-full rounded-xl py-4 text-[15px] font-medium transition-colors ${
            inRoute
              ? "bg-[#E1F5EE] text-[#1D9E75]"
              : "bg-[#1D9E75] text-[#E1F5EE]"
          }`}
        >
          {inRoute ? "✓ In your route" : "+ Add to Route"}
        </button>
      </div>
    </div>
  );
}

function ResultsContent() {
  const router = useRouter();
  const params = useSearchParams();

  const initialCategory = (params.get("category") as CategoryKey) ?? "grocery";
  const location = params.get("location") ?? "My Location";
  const searchQuery = params.get("q") ?? undefined;
  const lat = params.get("lat") ? Number(params.get("lat")) : undefined;
  const lng = params.get("lng") ? Number(params.get("lng")) : undefined;

  const [activeCategory, setActiveCategory] = useState<CategoryKey>(initialCategory);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ResultItem | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { add, isInRoute, count: routeCount } = useRoute();

  const loadResults = useCallback(
    async (category: CategoryKey) => {
      setLoading(true);
      setError(null);
      setResults([]);
      try {
        const items = await fetchResults(location, category, searchQuery, lat, lng);
        setResults(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [location, searchQuery, lat, lng]
  );

  useEffect(() => {
    loadResults(activeCategory);
  }, [activeCategory, loadResults]);

  function handleAddToRoute(item: ResultItem) {
    add(item);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 1800);
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-48px)]">
      {/* Nav bar */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#E5E5EA] dark:border-[#38383A] bg-white dark:bg-black">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="text-[28px] leading-8 text-[#1D9E75] mr-1"
        >
          ‹
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-medium text-black dark:text-white truncate">
            {searchQuery ? `"${searchQuery}"` : CATEGORY_LABELS[activeCategory]}
          </p>
          <p className="text-[12px] text-[#AEAEB2] dark:text-[#636366]">
            {location} · sorted by price
          </p>
        </div>
        <Link
          href="/route"
          aria-label={`My Route — ${routeCount} stops`}
          className="relative p-0.5"
        >
          <span className="text-[20px]">🗺️</span>
          {routeCount > 0 && (
            <span className="absolute -top-1 -right-1.5 bg-[#1D9E75] text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
              {routeCount > 9 ? "9+" : routeCount}
            </span>
          )}
        </Link>
      </div>

      {/* Filter chips */}
      <div className="bg-white dark:bg-black py-3 border-b border-[#E5E5EA] dark:border-[#38383A]">
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4">
          {CHIPS.map((chip) => {
            const active = chip.key === activeCategory;
            return (
              <button
                key={chip.key}
                onClick={() => setActiveCategory(chip.key)}
                className={`shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "bg-[#1D9E75] border-[#1D9E75] text-[#E1F5EE]"
                    : "border-[#E5E5EA] dark:border-[#38383A] text-[#6C6C70] dark:text-[#ABABAB] bg-white dark:bg-black hover:border-[#1D9E75]/50"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {loading ? (
          <SkeletonList />
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-10 gap-2 mt-8">
            <span className="text-5xl mb-1">⚠️</span>
            <p className="text-[17px] font-semibold text-black dark:text-white text-center">
              Couldn&apos;t load results
            </p>
            <p className="text-[13px] text-[#6C6C70] dark:text-[#ABABAB] text-center leading-snug">
              {error}
            </p>
            <button
              onClick={() => loadResults(activeCategory)}
              className="mt-3 bg-[#1D9E75] text-white rounded-xl px-6 py-2.5 text-[14px] font-medium"
            >
              Try again
            </button>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 gap-2 mt-8">
            <span className="text-5xl mb-1">🔍</span>
            <p className="text-[17px] font-semibold text-black dark:text-white text-center">
              No results found
            </p>
            <p className="text-[13px] text-[#6C6C70] dark:text-[#ABABAB] text-center">
              Try a different category or search term.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0 p-4">
            <p className="text-[11px] font-medium tracking-widest text-[#AEAEB2] dark:text-[#636366] mb-2.5">
              CHEAPEST FIRST
            </p>
            <div className="flex flex-col gap-2.5">
              {results.map((item, index) => (
                <ResultCard
                  key={item.id}
                  item={item}
                  index={index}
                  inRoute={isInRoute(item.id)}
                  onAddToRoute={handleAddToRoute}
                  onCardClick={setSelectedItem}
                />
              ))}
            </div>
            <p className="text-[11px] text-center text-[#AEAEB2] dark:text-[#636366] mt-6 mb-2 px-4 leading-4">
              Prices are AI-generated estimates — verify at the store before you go.
            </p>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedItem && (
        <DetailDrawer
          item={selectedItem}
          inRoute={isInRoute(selectedItem.id)}
          onAddToRoute={() => handleAddToRoute(selectedItem)}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Toast */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1D9E75] text-white text-[14px] font-medium px-5 py-2.5 rounded-full pointer-events-none transition-opacity duration-300 ${
          toastVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        ✓ Added to route
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <ResultsContent />
    </Suspense>
  );
}
