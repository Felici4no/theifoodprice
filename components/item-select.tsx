"use client";

import { useRouter } from "next/navigation";

export function ItemSelect({
  items,
  value,
  window,
  basePath,
}: {
  items: { id: string; label: string }[];
  value: string;
  window: string;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Item"
      value={value}
      onChange={(e) => router.push(`${basePath}?item=${e.target.value}&w=${window}`)}
      className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm font-semibold sm:w-auto"
    >
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.label}
        </option>
      ))}
    </select>
  );
}
