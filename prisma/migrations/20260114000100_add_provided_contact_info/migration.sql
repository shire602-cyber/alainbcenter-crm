ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "provided_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "provided_phone_e164" TEXT,
  ADD COLUMN IF NOT EXISTS "provided_email" TEXT;

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "provided_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "provided_phone_e164" TEXT,
  ADD COLUMN IF NOT EXISTS "provided_email" TEXT;
