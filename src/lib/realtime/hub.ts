import type { QueueEvent } from "@/lib/realtime/types";

type Subscriber = (event: QueueEvent) => void;

/**
 * Pelanggan disimpan di globalThis, sama seperti pendengar LISTEN di listen.ts. Bila modul ini dimuat
 * ulang (HMR di `npm run dev`, atau salinan modul terpisah per route), semua salinan tetap memakai satu
 * daftar. Tanpa ini, pendengar database mengirim ke daftar lama yang kosong dan layar tidak lagi
 * menerima sinyal, padahal sambungannya tampak "Langsung".
 */
const globalForHub = globalThis as typeof globalThis & {
  queueSubscribers?: Set<Subscriber>;
};
const subscribers = (globalForHub.queueSubscribers ??= new Set<Subscriber>());

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
