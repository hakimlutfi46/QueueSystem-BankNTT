-- Kode pemasangan pendek (6 karakter, berlaku 30 menit) untuk aplikasi kiosk Windows.
-- Hanya hash-nya yang disimpan; kode dihapus begitu ditukar dengan token.
ALTER TABLE "devices" ADD COLUMN "pair_code_hash" TEXT;
ALTER TABLE "devices" ADD COLUMN "pair_code_expires_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "devices_pair_code_hash_key" ON "devices"("pair_code_hash");
