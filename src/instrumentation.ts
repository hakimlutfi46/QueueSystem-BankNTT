import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getPrisma } = await import("@/lib/db");
  const { ensureDayClosed, startDayClose } = await import("@/lib/queue/day-close");
  startDayClose(() => ensureDayClosed(getPrisma()));
}

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Request failed ${request.method} ${request.path}: ${message}`);
};
