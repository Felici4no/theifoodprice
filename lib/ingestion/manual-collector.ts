import {
  rawPriceObservationSchema,
  type PriceCollector,
  type RawPriceObservation,
  type RawPriceObservationInput,
} from "./types";

/**
 * Collector for observations typed in by a person (form, API, CSV).
 * `submit` validates and queues; `collect` drains the queue.
 */
export class ManualCollector implements PriceCollector {
  readonly source = "manual";
  private queue: RawPriceObservation[] = [];

  /** Throws a ZodError if the input is invalid; nothing is queued in that case. */
  submit(...inputs: RawPriceObservationInput[]): void {
    const parsed = inputs.map((i) => rawPriceObservationSchema.parse(i));
    this.queue.push(...parsed);
  }

  async collect(): Promise<RawPriceObservation[]> {
    const out = this.queue;
    this.queue = [];
    return out;
  }
}
