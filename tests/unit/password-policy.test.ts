import { describe, expect, it } from "vitest";
import { isWeakPassword, newPasswordProblem, weakPasswordsAllowed } from "@/lib/auth/password-policy";

describe("password policy", () => {
  it("treats seeded, common, short, and username-based passwords as weak", () => {
    for (const password of ["Password123", "change-me", "12345678", "admin123", "petugas.cs99", "aaaaaaaa", "abc12"]) {
      expect(isWeakPassword(password, "petugas.cs"), password).toBe(true);
    }
    expect(isWeakPassword("Kupang-Lobi-2026", "petugas.cs")).toBe(false);
  });

  it("explains what is wrong with a new password", () => {
    const base = { username: "sari", current: "Lama-Sekali-1" };
    expect(newPasswordProblem({ ...base, password: "pendek", confirm: "pendek" })).toContain("minimal 8");
    expect(newPasswordProblem({ ...base, password: "Kupang-2026!", confirm: "Kupang-2027!" })).toContain("sama persis");
    expect(newPasswordProblem({ ...base, password: "Lama-Sekali-1", confirm: "Lama-Sekali-1" })).toContain("berbeda");
    expect(newPasswordProblem({ ...base, password: "Password123", confirm: "Password123" })).toContain("mudah ditebak");
    expect(newPasswordProblem({ ...base, password: "Kupang-2026!", confirm: "Kupang-2026!" })).toBeNull();
  });

  it("allows weak passwords only when the end-to-end switch is set", () => {
    expect(weakPasswordsAllowed({})).toBe(false);
    expect(weakPasswordsAllowed({ AUTH_ALLOW_WEAK_PASSWORDS: "true" })).toBe(true);
    expect(weakPasswordsAllowed({ AUTH_ALLOW_WEAK_PASSWORDS: "1" })).toBe(false);
  });
});
