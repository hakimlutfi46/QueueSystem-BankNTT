-- Perangkat yang mendaftar sendiri (tanpa kode) menunggu persetujuan admin: approved_at kosong.
-- Perangkat yang sudah ada dianggap disetujui sejak dibuat.
ALTER TABLE "devices" ADD COLUMN "approved_at" TIMESTAMPTZ(6);
UPDATE "devices" SET "approved_at" = "created_at";

-- ID instalasi aplikasi kiosk/TV, supaya pemasangan ulang di PC yang sama memakai perangkat yang sama.
ALTER TABLE "devices" ADD COLUMN "install_id" TEXT;
CREATE UNIQUE INDEX "devices_install_id_key" ON "devices"("install_id");
