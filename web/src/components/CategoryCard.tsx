"use client";

import { CategoryKey } from "@/lib/types";

interface Option {
  key: CategoryKey;
  title: string;
  description: string;
  icon: string;
  iconBg: string;
}

interface CategoryCardProps {
  option: Option;
  selected: boolean;
  onSelect: (key: CategoryKey) => void;
}

export const HOME_OPTIONS: Option[] = [
  {
    key: "grocery",
    title: "Groceries",
    description: "Cheapest items at stores near you",
    icon: "🛒",
    iconBg: "#EAF3DE",
  },
  {
    key: "order-in",
    title: "Order in",
    description: "Delivery deals under your budget",
    icon: "🚲",
    iconBg: "#E6F1FB",
  },
  {
    key: "go-out",
    title: "Go out",
    description: "Cheapest meals at nearby spots",
    icon: "🍽️",
    iconBg: "#FAECE7",
  },
  {
    key: "pet-stores",
    title: "Pet Stores",
    description: "Cheapest pet food and supplies",
    icon: "🐾",
    iconBg: "#F3E8FB",
  },
];

export default function CategoryCard({ option, selected, onSelect }: CategoryCardProps) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(option.key)}
      className={`flex items-center gap-4 w-full rounded-xl p-4 border text-left transition-colors
        ${selected
          ? "border-[#1D9E75] border-2 bg-white dark:bg-black"
          : "border-[#E5E5EA] dark:border-[#38383A] border bg-white dark:bg-black hover:border-[#1D9E75]/50"
        }`}
    >
      <span
        className="w-11 h-11 rounded-[10px] flex items-center justify-center text-[22px] shrink-0"
        style={{ backgroundColor: option.iconBg }}
      >
        {option.icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium text-black dark:text-white">
          {option.title}
        </span>
        <span className="block text-[13px] text-[#6C6C70] dark:text-[#ABABAB] mt-0.5">
          {option.description}
        </span>
      </span>
      <span className="text-[18px] text-[#AEAEB2] dark:text-[#636366]">›</span>
    </button>
  );
}
