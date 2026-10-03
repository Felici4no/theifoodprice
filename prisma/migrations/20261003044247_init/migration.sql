-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('ABSOLUTE_PRICE', 'PERCENTILE', 'BELOW_MEDIAN_PCT', 'NEW_HISTORICAL_LOW');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('TELEGRAM', 'CONSOLE');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'manual',
    "externalRef" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "externalRef" TEXT,
    "tracked" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceObservation" (
    "id" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "listPrice" INTEGER NOT NULL,
    "currentPrice" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "serviceFee" INTEGER NOT NULL DEFAULT 0,
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "effectivePrice" INTEGER NOT NULL,
    "promotionType" TEXT,
    "deliveryEtaMin" INTEGER,
    "deliveryEtaMax" INTEGER,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "rawPayload" JSONB,
    "notes" TEXT,
    "supersedesId" TEXT,

    CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAnalysis" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "methodologyVersion" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "firstObservedAt" TIMESTAMP(3),
    "lastObservedAt" TIMESTAMP(3),
    "currentEffective" INTEGER,
    "median" DOUBLE PRECISION,
    "mean" DOUBLE PRECISION,
    "stdDev" DOUBLE PRECISION,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "p10" DOUBLE PRECISION,
    "p25" DOUBLE PRECISION,
    "p75" DOUBLE PRECISION,
    "p90" DOUBLE PRECISION,
    "percentileRank" DOUBLE PRECISION,
    "zScore" DOUBLE PRECISION,
    "diffFromMedianPct" DOUBLE PRECISION,
    "explanations" JSONB NOT NULL,

    CONSTRAINT "PriceAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "thresholdCents" INTEGER,
    "thresholdPercent" DOUBLE PRECISION,
    "window" TEXT NOT NULL DEFAULT '30d',
    "minSampleSize" INTEGER NOT NULL DEFAULT 10,
    "channel" "AlertChannel" NOT NULL DEFAULT 'TELEGRAM',
    "telegramChatId" TEXT,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 360,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL,
    "deliveryError" TEXT,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_platform_name_key" ON "Merchant"("platform", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_merchantId_name_key" ON "Item"("merchantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PriceObservation_supersedesId_key" ON "PriceObservation"("supersedesId");

-- CreateIndex
CREATE INDEX "PriceObservation_itemId_observedAt_idx" ON "PriceObservation"("itemId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceObservation_observedAt_idx" ON "PriceObservation"("observedAt");

-- CreateIndex
CREATE INDEX "PriceAnalysis_itemId_window_computedAt_idx" ON "PriceAnalysis"("itemId", "window", "computedAt");

-- CreateIndex
CREATE INDEX "AlertEvent_ruleId_triggeredAt_idx" ON "AlertEvent"("ruleId", "triggeredAt");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PriceObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAnalysis" ADD CONSTRAINT "PriceAnalysis_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "PriceObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written: raw observations are append-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION price_observation_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PriceObservation is append-only: insert a correcting row with supersedesId instead of % on %', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER price_observation_no_update
  BEFORE UPDATE OR DELETE ON "PriceObservation"
  FOR EACH ROW EXECUTE FUNCTION price_observation_immutable();

-- Monetary sanity: cents are non-negative and effectivePrice follows the formula.
ALTER TABLE "PriceObservation"
  ADD CONSTRAINT price_observation_non_negative CHECK (
    "listPrice" >= 0 AND "currentPrice" >= 0 AND "deliveryFee" >= 0
    AND "serviceFee" >= 0 AND "discountValue" >= 0
  ),
  ADD CONSTRAINT price_observation_effective_formula CHECK (
    "effectivePrice" = GREATEST(0, "currentPrice" + "deliveryFee" + "serviceFee" - "discountValue")
  );
