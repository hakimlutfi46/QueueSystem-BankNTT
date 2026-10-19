"use client";

export async function submitAdmin(url: string, method: string, body?: unknown): Promise<string | null> {
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return payload?.error?.message ?? "Perubahan gagal disimpan.";
}

/** Seperti submitAdmin, tetapi mengembalikan isi jawaban, misalnya token perangkat yang baru dibuat. */
export async function requestAdmin<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (response.ok && payload) return { data: payload, error: null };
    return { data: null, error: payload?.error?.message ?? "Perubahan gagal disimpan." };
  } catch {
    return { data: null, error: "Server tidak terjangkau." };
  }
}
