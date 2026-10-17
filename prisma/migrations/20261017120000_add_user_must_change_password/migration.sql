-- Akun dengan kata sandi bawaan, lemah, atau sementara dari admin wajib mengganti sandinya sebelum bekerja.
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
