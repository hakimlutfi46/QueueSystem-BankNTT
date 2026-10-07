export type AnnouncementPlayer = {
  chime: () => Promise<void>;
  speak: (text: string, clips: string[]) => Promise<void>;
};

export type AnnouncementRequest = {
  id: string;
  text: string;
  clips: string[];
  audible: boolean;
};

export function createAnnouncementQueue(player: AnnouncementPlayer): {
  enable: () => void;
  seen: (id: string) => void;
  announce: (request: AnnouncementRequest) => void;
  subscribe: (listener: () => void) => () => void;
  getHighlight: () => string | null;
  getServerHighlight: () => null;
} {
  const done = new Set<string>();
  const pending: AnnouncementRequest[] = [];
  const listeners = new Set<() => void>();
  let highlight: string | null = null;
  let enabled = false;
  let playing = false;

  function emit() {
    for (const listener of listeners) listener();
  }

  async function pump() {
    if (!enabled || playing) return;
    const next = pending.shift();
    if (!next) return;
    playing = true;
    done.add(next.id);
    try {
      await player.chime();
      await player.speak(next.text, next.clips);
    } finally {
      playing = false;
      void pump();
    }
  }

  return {
    enable() {
      enabled = true;
      void pump();
    },
    seen(id) {
      if (!id) return;
      done.add(id);
    },
    announce(request) {
      if (!request.id || done.has(request.id) || pending.some((item) => item.id === request.id)) return;
      highlight = request.id;
      emit();
      if (!request.audible) {
        done.add(request.id);
        return;
      }
      pending.push(request);
      void pump();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getHighlight() {
      return highlight;
    },
    getServerHighlight() {
      return null;
    },
  };
}
