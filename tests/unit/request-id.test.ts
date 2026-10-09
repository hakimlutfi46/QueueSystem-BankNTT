import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newRequestId } from "@/lib/request-id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newRequestId", () => {
  it("builds a v4 UUID when randomUUID is missing on plain HTTP", () => {
    const insecure = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } as Pick<Crypto, "getRandomValues">;
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId(insecure)));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it("uses randomUUID when the browser has it", () => {
    expect(newRequestId(webcrypto as unknown as Crypto)).toMatch(UUID_V4);
  });
});
