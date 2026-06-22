"use client";

import { BadgeKey, ResultItem } from "@/lib/types";

const BADGE_CONFIG: Record<BadgeKey, { bg: string; color: string; label: string }> = {
  deal: { bg: "#EAF3DE", color: "#3B6D11", label: "Best deal" },
  fast: { bg: "#E6F1FB", color: "#185FA5", label: "Fast" },
  close: { bg: "#FAEEDA", color: "#854F0B", label: "Nearby" },
};

interface ResultCardProps {
  item: ResultItem;
  index: number;
  inRoute: boolean;
  onAddToRoute: (item: ResultItem) => void;
  onCardClick: (item: ResultItem) => void;
}

export default function ResultCard({
  item,
  index,
  inRoute,
  onAddToRoute,
  onCardClick,
}: ResultCardProps) {
  const isTop = index === 0;

  return (
    <button
      onClick={() => onCardClick(item)}
      className={`w-full text-left rounded-xl p-4 border bg-white dark:bg-black transition-colors
        ${isTop
          ? "border-[#1D9E75] border-2"
          : "border-[#E5E5EA] dark:border-[#38383A] border hover:border-[#1D9E75]/40"
        }`}
      aria-label={`${item.name}, ${item.price}`}
    >
      {isTop && (
        <span className="inline-block text-[10px] font-medium text-[#0F6E56] bg-[#E1F5EE] rounded-full px-2 py-0.5 mb-2">
          Top pick
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-medium text-black dark:text-white truncate flex-1 mr-2">
          {item.name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[16px] font-medium text-[#1D9E75]">{item.price}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToRoute(item);
            }}
            aria-label={inRoute ? "In route" : "Add to route"}
            className={`w-7 h-7 rounded-full border flex items-center justify-center text-base transition-colors
              ${inRoute
                ? "border-[#1D9E75] text-[#1D9E75]"
                : "border-[#E5E5EA] dark:border-[#38383A] text-[#AEAEB2] dark:text-[#636366] hover:border-[#1D9E75] hover:text-[#1D9E75]"
              }`}
          >
            {inRoute ? "✓" : "+"}
          </button>
        </div>
      </div>
      <p className="text-[12px] text-[#6C6C70] dark:text-[#ABABAB] mt-0.5 truncate">
        {item.description}
      </p>
      <div className="flex items-center flex-wrap gap-2 mt-2">
        {item.badges.map((b) => {
          const cfg = BADGE_CONFIG[b];
          if (!cfg) return null;
          return (
            <span
              key={b}
              className="text-[11px] rounded-full px-2 py-0.5 font-medium"
              style={{ backgroundColor: cfg.bg, color: cfg.color }}
            >
              {cfg.label}
            </span>
          );
        })}
        <span className="text-[11px] text-[#AEAEB2] dark:text-[#636366]">
          📍 {item.distance}
        </span>
      </div>
    </button>
  );
}
