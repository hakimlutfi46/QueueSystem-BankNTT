import { QueueError } from "@/lib/queue/errors";
import { TICKET_STATUSES, type TicketStatus } from "@/lib/queue/types";

const LEGAL_TRANSITIONS = new Set<string>([
  "WAITING:SERVING",
  "SERVING:DONE",
  "SERVING:NO_SHOW",
  "WAITING:EXPIRED",
]);

export function assertLegalTransition(from: TicketStatus, to: TicketStatus): void {
  if (!LEGAL_TRANSITIONS.has(`${from}:${to}`)) {
    throw new QueueError("INVALID_TRANSITION", `Cannot move a ticket from ${from} to ${to}.`);
  }
}

export function illegalTransitions(): Array<[TicketStatus, TicketStatus]> {
  const pairs: Array<[TicketStatus, TicketStatus]> = [];
  for (const from of TICKET_STATUSES) {
    for (const to of TICKET_STATUSES) {
      if (!LEGAL_TRANSITIONS.has(`${from}:${to}`)) {
        pairs.push([from, to]);
      }
    }
  }
  return pairs;
}
