-- Add phoneNormalized and waId to Contact model
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "waId" TEXT;

-- Create unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_phoneNormalized_key" ON "Contact"("phoneNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_waId_key" ON "Contact"("waId");

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS "Contact_phoneNormalized_idx" ON "Contact"("phoneNormalized");
CREATE INDEX IF NOT EXISTS "Contact_waId_idx" ON "Contact"("waId");
