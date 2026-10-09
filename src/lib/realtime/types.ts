export const QUEUE_CHANNEL = "queue_events";

export const HEARTBEAT_MS = 25_000;

export const POLL_INTERVAL_MS = 5_000;

export type QueueEvent = {
  id: string | null;
  type: string;
  ticketId: string | null;
  counterId: number | null;
  serviceId: number | null;
  ticketNumber?: string | null;
  counterName?: string | null;
  displayNumber?: number | null;
};

export type QueueActiveTicket = {
  id: string;
  number: string;
  serviceId: number;
  callCount: number;
  calledAt: string | null;
};

export type QueueCounterState = {
  id: number;
  name: string;
  displayNumber: number;
  status: "CLOSED" | "OPEN" | "PAUSED";
  officerId: number | null;
  officerName: string | null;
  serviceIds: number[];
  activeTicket: QueueActiveTicket | null;
};

export type QueueServiceState = {
  id: number;
  name: string;
  prefix: string;
  waitingCount: number;
  /** Nomor menunggu paling awal hari ini, yang akan dipanggil berikutnya untuk layanan ini. */
  nextNumber: string | null;
};

export type QueueLastCall = {
  id: string;
  type: "TICKET_CALLED" | "TICKET_RECALLED";
  ticketId: string;
  ticketNumber: string;
  serviceId: number;
  counterId: number | null;
  counterName: string | null;
  displayNumber: number | null;
  calledAt: string | null;
};

export type QueueDisplaySettings = {
  branchName: string;
  runningText: string;
  voiceEnabled: boolean;
  maxRecall: number;
  targetServiceMinutes: number;
  ticketFooter: string;
  ticketWidthMm: number;
};

export type QueueState = {
  services: QueueServiceState[];
  counters: QueueCounterState[];
  lastCall: QueueLastCall | null;
  /** Panggilan terakhir hari ini, satu per tiket, terbaru dulu. Yang pertama sama dengan lastCall. */
  recentCalls: QueueLastCall[];
  settings: QueueDisplaySettings;
  asOf: string;
};

export function parseQueueEvent(payload: string | undefined): QueueEvent | null {
  if (!payload) return null;
  try {
    const value: unknown = JSON.parse(payload);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.type !== "string" || record.type.length === 0) return null;
    return {
      id: typeof record.id === "string" ? record.id : null,
      type: record.type,
      ticketId: record.ticketId == null ? null : String(record.ticketId),
      counterId: typeof record.counterId === "number" ? record.counterId : null,
      serviceId: typeof record.serviceId === "number" ? record.serviceId : null,
      ticketNumber: typeof record.ticketNumber === "string" ? record.ticketNumber : null,
      counterName: typeof record.counterName === "string" ? record.counterName : null,
      displayNumber: typeof record.displayNumber === "number" ? record.displayNumber : null,
    };
  } catch {
    return null;
  }
}
