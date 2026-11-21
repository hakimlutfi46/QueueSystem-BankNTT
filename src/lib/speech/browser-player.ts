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

/**
 * Rekaman suara (/audio/*.wav) diutamakan: terdengar sama di semua layar dan tidak bergantung pada mesin
 * TTS. Banyak TV Android menyebut punya suara Indonesia padahal datanya belum diunduh, sehingga
 * speechSynthesis diam tanpa error. TTS hanya dipakai bila ada klip yang tidak bisa dimuat, misalnya
 * nama loket yang tidak punya rekaman.
 */
async function speakAnnouncement(text: string, clips: string[]): Promise<void> {
  const spoken = (window as Window & { __spoken?: string[] }).__spoken;
  if (spoken) spoken.push(text);
  const context = audioContext();
  if (context && context.state !== "running") await withTimeout(context.resume().catch(() => undefined), 300);
  if (context && context.state === "running") {
    const buffers = await withTimeout(Promise.all(clips.map((src) => loadClip(context, src))), 5_000);
    if (buffers && buffers.every((buffer): buffer is AudioBuffer => buffer !== null)) {
      for (const buffer of buffers) await playBuffer(context, buffer);
      return;
    }
  }
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

const bufferCache = new Map<string, Promise<AudioBuffer | null>>();

function loadClip(context: AudioContext, src: string): Promise<AudioBuffer | null> {
  let buffer = bufferCache.get(src);
  if (!buffer) {
    buffer = fetch(src)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      // Bentuk callback: Safari lama belum mengembalikan Promise dari decodeAudioData.
      .then((data) => new Promise<AudioBuffer>((resolve, reject) => void context.decodeAudioData(data, resolve, reject)))
      .catch(() => {
        bufferCache.delete(src);
        return null;
      });
    bufferCache.set(src, buffer);
  }
  return buffer;
}

/**
 * Klip diputar lewat AudioContext yang sama dengan bunyi "ding". Browser TV berbasis WebView (misalnya
 * TV Bro) mengizinkan AudioContext tanpa sentuhan tetapi menahan elemen <audio>; tanpa ini nada terdengar
 * namun narator diam, terlebih di TV tanpa suara Indonesia untuk speechSynthesis.
 */
async function playClip(src: string): Promise<void> {
  const context = audioContext();
  if (context) {
    if (context.state !== "running") await withTimeout(context.resume().catch(() => undefined), 300);
    if (context.state === "running") {
      const buffer = await withTimeout(loadClip(context, src), 3_000);
      if (buffer) {
        await playBuffer(context, buffer);
        return;
      }
    }
  }
  return playElement(src);
}

async function playBuffer(context: AudioContext, buffer: AudioBuffer): Promise<void> {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  await withTimeout(new Promise<void>((resolve) => {
    source.onended = () => resolve();
    source.start();
  }), buffer.duration * 1000 + 300);
  source.disconnect();
}

const clipCache = new Map<string, HTMLAudioElement>();

function playElement(src: string): Promise<void> {
  return new Promise((resolve) => {
    let audio = clipCache.get(src);
    if (!audio) {
      audio = new Audio(src);
      audio.preload = "auto";
      clipCache.set(src, audio);
    }
    audio.currentTime = 0;
    audio.onended = () => resolve();
    const fallbackToSpeech = () => {
      const match = /\/audio\/(.+)\.wav$/i.exec(src);
      const word = match?.[1]?.replace(/-/g, " ");
      if (word && "speechSynthesis" in window) {
        try {
          const utter = new SpeechSynthesisUtterance(word);
          utter.lang = "id-ID";
          utter.onend = () => resolve();
          utter.onerror = () => resolve();
          window.speechSynthesis.speak(utter);
          return;
        } catch {
          resolve();
          return;
        }
      }
      resolve();
    };
    audio.onerror = () => fallbackToSpeech();
    void audio.play().catch(() => fallbackToSpeech());
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
