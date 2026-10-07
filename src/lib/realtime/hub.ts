import type { QueueEvent } from "@/lib/realtime/types";

type Subscriber = (event: QueueEvent) => void;

const subscribers = new Set<Subscriber>();

export function publish(event: QueueEvent): void {
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      // One broken client must not stop the others.
    }
  }
}

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
