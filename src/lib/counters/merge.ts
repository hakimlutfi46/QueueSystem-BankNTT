import type { CounterDesk } from "@/lib/counters/types";
import type { QueueState } from "@/lib/realtime/types";

export function mergeCounterDesk(
  desk: CounterDesk,
  live: QueueState | null,
  officerId: number,
  syncedAsOf: string | null,
): CounterDesk {
  if (!live) return desk;
  if (desk.mode === "pick") {
    return {
      mode: "pick",
      branchName: live.settings.branchName,
      counters: live.counters.map((counter) => ({
        id: counter.id,
        name: counter.name,
        displayNumber: counter.displayNumber,
        status: counter.status,
        officerId: counter.officerId,
        officerName: counter.officerName,
        available: counter.status === "CLOSED" || counter.officerId === officerId,
        serviceNames: live.services
          .filter((service) => counter.serviceIds.includes(service.id))
          .map((service) => service.name),
      })),
    };
  }
  if (live.asOf === syncedAsOf) return desk;

  const held = live.counters.find((counter) => counter.id === desk.counter.id);
  const serviceIds = held?.serviceIds ?? [];
  const waitingCount = serviceIds.length
    ? live.services
        .filter((service) => serviceIds.includes(service.id))
        .reduce((total, service) => total + service.waitingCount, 0)
    : desk.waitingCount;
  const liveIsMine = held?.officerId === officerId && held.status !== "CLOSED";
  const active = liveIsMine ? held.activeTicket : null;

  return {
    ...desk,
    branchName: live.settings.branchName,
    targetServiceMinutes: live.settings.targetServiceMinutes,
    counter: {
      ...desk.counter,
      status: liveIsMine ? (held.status === "PAUSED" ? "PAUSED" : "OPEN") : desk.counter.status,
      serviceNames: serviceIds.length
        ? live.services
            .filter((service) => serviceIds.includes(service.id))
            .map((service) => service.name)
        : desk.counter.serviceNames,
    },
    activeTicket:
      liveIsMine && active
        ? {
            id: active.id,
            number: active.number,
            serviceName:
              live.services.find((service) => service.id === active.serviceId)?.name ??
              desk.activeTicket?.serviceName ??
              "",
            calledAt: active.calledAt,
            callCount: active.callCount,
          }
        : liveIsMine
          ? null
          : desk.activeTicket,
    waitingCount,
  };
}
