"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CategoryCard, { HOME_OPTIONS } from "@/components/CategoryCard";
import { useLocation } from "@/hooks/useLocation";
import { CategoryKey } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const { location, lat, lng, locating, setLocation } = useLocation();
  const [selected, setSelected] = useState<CategoryKey>("grocery");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");

  function handleLocationClick() {
    setLocationDraft(location);
    setEditingLocation(true);
  }

  function handleLocationSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locationDraft.trim()) {
      setLocation(locationDraft.trim());
    }
    setEditingLocation(false);
  }

  function navigate(query?: string, cat?: CategoryKey) {
    const q = (query ?? searchQuery).trim();
    const category = cat ?? selected;
    const params = new URLSearchParams({
      category,
      location,
    });
    if (q) params.set("q", q);
    if (lat != null) params.set("lat", String(lat));
    if (lng != null) params.set("lng", String(lng));
    router.push(`/results?${params.toString()}`);
  }

  return (
    <div className="px-6 pb-32 pt-7">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[12px] font-medium tracking-widest text-[#AEAEB2] dark:text-[#636366] mb-1.5">
          CHIFUFU
        </p>
        <h1 className="text-[26px] font-medium leading-[1.25] text-black dark:text-white mb-1">
          {"What's the cheapest"}
          <br />
          {"option near you?"}
        </h1>
        <p className="text-[14px] text-[#6C6C70] dark:text-[#ABABAB]">
          We find the best value — every time.
        </p>
      </div>

      {/* Location row */}
      {editingLocation ? (
        <form onSubmit={handleLocationSubmit} className="mb-4">
          <div className="flex items-center gap-2 rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#38383A] p-3">
            <span className="text-base">📍</span>
            <input
              autoFocus
              type="text"
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              className="flex-1 bg-transparent text-[14px] font-medium text-black dark:text-white outline-none placeholder-[#AEAEB2]"
              placeholder="City, zip, or address"
            />
            <button
              type="submit"
              className="text-[13px] font-medium text-[#1D9E75]"
            >
              Done
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={handleLocationClick}
          className="flex items-center gap-2 w-full rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#38383A] p-3 mb-4 text-left"
          aria-label={locating ? "Detecting location" : `Near ${location}. Tap to change.`}
        >
          <span className="text-base">{locating ? "⌖" : "📍"}</span>
          <span className="text-[14px] text-[#6C6C70] dark:text-[#ABABAB] flex-1">Near</span>
          <span
            className={`text-[14px] font-medium mr-1 ${
              locating ? "text-[#AEAEB2] dark:text-[#636366]" : "text-black dark:text-white"
            }`}
          >
            {locating ? "Detecting…" : location}
          </span>
          {!locating && (
            <span className="text-[18px] text-[#AEAEB2] dark:text-[#636366]">›</span>
          )}
        </button>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2 rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#38383A] p-3 mb-4">
        <span className="text-base">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchQuery.trim()) navigate();
          }}
          placeholder="Search for an item… e.g. avocados"
          className="flex-1 bg-transparent text-[15px] text-black dark:text-white outline-none placeholder-[#AEAEB2] dark:placeholder-[#636366]"
        />
        {searchQuery.length > 0 && (
          <button
            onClick={() => setSearchQuery("")}
            className="text-[#AEAEB2] dark:text-[#636366] text-base leading-none"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Section label */}
      <p className="text-[12px] font-medium tracking-widest text-[#AEAEB2] dark:text-[#636366] mb-3">
        {searchQuery.trim() ? "OR BROWSE BY CATEGORY" : "HOW DO YOU WANT TO EAT?"}
      </p>

      {/* Category cards */}
      <div className="flex flex-col gap-2.5">
        {HOME_OPTIONS.map((opt) => (
          <CategoryCard
            key={opt.key}
            option={opt}
            selected={selected === opt.key}
            onSelect={setSelected}
          />
        ))}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-black px-6 pb-8 pt-3 border-t border-[#E5E5EA] dark:border-[#38383A]">
        <div className="max-w-[640px] mx-auto">
          <button
            onClick={() => navigate()}
            disabled={locating}
            className="w-full rounded-xl bg-[#1D9E75] text-[#E1F5EE] text-[16px] font-medium py-4 disabled:opacity-50 transition-opacity active:scale-[0.98] transition-transform"
          >
            {searchQuery.trim()
              ? `🔍  Search "${searchQuery.trim()}"`
              : "🔍  Find cheap food"}
          </button>
        </div>
      </div>
    </div>
  );
}
