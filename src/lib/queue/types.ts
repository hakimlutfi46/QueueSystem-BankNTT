export const TICKET_STATUSES = ["WAITING", "SERVING", "DONE", "NO_SHOW", "EXPIRED"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type QueueTicket = {
  id: bigint;
  requestId: string;
  serviceId: number;
  serviceDate: string;
  seq: number;
  number: string;
  status: TicketStatus;
  counterId: number | null;
  servedBy: number | null;
  callCount: number;
  autoClosed: boolean;
  createdAt: Date;
  calledAt: Date | null;
  finishedAt: Date | null;
};

export type ClockInput = {
  now?: Date;
  timeZone?: string;
};

export type CounterActionInput = ClockInput & {
  counterId: number;
  userId: number;
};

export type IssuedTicket = {
  ticket: QueueTicket;
  aheadCount: number;
};

export type CallNextResult = {
  finished: QueueTicket | null;
  called: QueueTicket | null;
};

export type CloseDayResult = {
  expired: number;
  autoClosed: number;
};
