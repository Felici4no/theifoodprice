import type { Explained } from "@/lib/statistics";
import { PRICE_LABEL_TEXT, type PriceLabel } from "@/lib/pricing/analysis";
import { Explain } from "./explain";

const STYLE: Record<PriceLabel, string> = {
  low: "bg-good-soft text-good",
  near: "bg-surface text-foreground",
  high: "bg-brand-soft text-brand",
  insufficient: "bg-warn-soft text-warn",
};

export function PriceLabelBadge({ label }: { label: Explained<PriceLabel> }) {
  return (
    <Explain
      explanation={label.explanation}
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold no-underline ${STYLE[label.value]}`}
    >
      {PRICE_LABEL_TEXT[label.value]}
    </Explain>
  );
}
