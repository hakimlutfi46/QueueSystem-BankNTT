import type { AnnouncementPlayer } from "@/lib/speech/queue";

/**
 * Pemutar suara TV. Satu AudioContext dipakai bersama: browser hanya mengizinkan suara dari konteks
 * yang dibuka saat ada interaksi atau saat Chrome dijalankan dengan --autoplay-policy=no-user-gesture-required.
 * Konteks baru per panggilan akan tertahan, sehingga panggilan kedua dan seterusnya (termasuk panggil
 * ulang) tidak pernah berbunyi dan antrean pengumuman macet.
 */

const CHIME_MS = 400;

let sharedContext: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  sharedContext ??= new AudioContext();
  return sharedContext;
}

/**
 * Coba nyalakan suara. Benar bila browser mengizinkan, misalnya TV yang dijalankan dengan
 * --autoplay-policy=no-user-gesture-required, atau dipanggil dari klik atau tombol.
 */
export async function unlockAudio(): Promise<boolean> {
  const context = audioContext();
  if (!context) return false;
  if (context.state !== "running") {
    await withTimeout(context.resume().catch(() => undefined), 500);
  }
  if ("speechSynthesis" in window) {
    // Membuka izin speechSynthesis di Chrome; ucapan kosong tidak terdengar.
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }
  return context.state === "running";
}

export function createBrowserPlayer(): AnnouncementPlayer {
  return {
    chime: playChime,
    speak: speakAnnouncement,
  };
}

async function playChime(): Promise<void> {
  const context = audioContext();
  if (!context) return;
  if (context.state !== "running") await withTimeout(context.resume().catch(() => undefined), 300);
  if (context.state !== "running") return;
  const now = context.currentTime;
  const gain = context.createGain();
  const tone = context.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(880, now);
  tone.frequency.exponentialRampToValueAtTime(440, now + 0.35);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  tone.connect(gain);
  gain.connect(context.destination);
  tone.start(now);
  tone.stop(now + CHIME_MS / 1000);
  // onended tidak selalu terpanggil; batas waktu menjaga antrean tetap jalan.
  await withTimeout(new Promise<void>((resolve) => {
    tone.onended = () => resolve();
  }), CHIME_MS + 300);
  tone.disconnect();
  gain.disconnect();
}

async function speakAnnouncement(text: string, clips: string[]): Promise<void> {
  const spoken = (window as Window & { __spoken?: string[] }).__spoken;
  if (spoken) spoken.push(text);
  const voice = await indonesianVoice();
  if (voice) {
    await withTimeout(speakWithVoice(text, voice), 4_000 + text.length * 120);
    return;
  }
  for (const src of clips) {
    await withTimeout(playClip(src), 4_000);
  }
}

function speakWithVoice(text: string, voice: SpeechSynthesisVoice): Promise<void> {
  return new Promise((resolve) => {
    // Chrome kadang tertahan dalam keadaan "paused"; kosongkan dulu supaya ucapan baru terdengar.
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

async function indonesianVoice(): Promise<SpeechSynthesisVoice | null> {
  if (!("speechSynthesis" in window)) return null;
  const voices = await loadVoices();
  return voices.find((voice) => voice.lang.toLowerCase().startsWith("id")) ?? null;
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const current = window.speechSynthesis.getVoices();
  if (current.length > 0) return Promise.resolve(current);
  return new Promise((resolve) => {
    const finish = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, 500);
  });
}

const clipCache = new Map<string, HTMLAudioElement>();

function playClip(src: string): Promise<void> {
  return new Promise((resolve) => {
    let audio = clipCache.get(src);
    if (!audio) {
      audio = new Audio(src);
      audio.preload = "auto";
      clipCache.set(src, audio);
    }
    audio.currentTime = 0;
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().catch(() => resolve());
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), ms);
    void promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}
