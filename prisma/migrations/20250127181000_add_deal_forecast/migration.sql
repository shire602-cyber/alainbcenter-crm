-- Add forecast fields to Lead model
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "dealProbability" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "expectedRevenueAED" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "forecastReasonJson" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "serviceFeeAED" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "stageProbabilityOverride" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "forecastModelVersion" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "forecastLastComputedAt" TIMESTAMP;

-- Create ServicePricing table
CREATE TABLE IF NOT EXISTS "ServicePricing" (
  "id" SERIAL PRIMARY KEY,
  "serviceKey" TEXT UNIQUE NOT NULL,
  "defaultFeeAED" INTEGER NOT NULL,
  "minFeeAED" INTEGER,
  "maxFeeAED" INTEGER,
  "serviceTypeId" INTEGER,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "ServicePricing_serviceKey_idx" ON "ServicePricing"("serviceKey");
