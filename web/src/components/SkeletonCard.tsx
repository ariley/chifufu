export default function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 border border-[#E5E5EA] dark:border-[#38383A] bg-[#F2F2F7] dark:bg-[#1C1C1E] animate-pulse">
      <div className="h-3.5 w-3/5 bg-[#E5E5EA] dark:bg-[#2C2C2E] rounded-full" />
      <div className="h-3 w-1/3 bg-[#E5E5EA] dark:bg-[#2C2C2E] rounded-full mt-2" />
      <div className="h-2.5 w-4/5 bg-[#E5E5EA] dark:bg-[#2C2C2E] rounded-full mt-3" />
    </div>
  );
}

export function SkeletonList() {
  return (
    <div className="flex flex-col gap-2.5 p-4">
      <div className="h-3 w-24 bg-[#E5E5EA] dark:bg-[#2C2C2E] rounded-full mb-1 animate-pulse" />
      {[0, 1, 2, 3].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
