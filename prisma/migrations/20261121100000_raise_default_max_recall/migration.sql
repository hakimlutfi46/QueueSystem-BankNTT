-- Batas panggil ulang bawaan naik dari 3 ke 5. Hanya mengubah cabang yang masih memakai bawaan lama;
-- nilai lain yang sudah diatur admin tidak disentuh.
UPDATE "settings" SET "value" = '5'::jsonb WHERE "key" = 'max_recall' AND "value" = '3'::jsonb;
