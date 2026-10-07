import type { AnnouncementPlayer } from "@/lib/speech/queue";

export function createBrowserPlayer(): AnnouncementPlayer {
  return {
    chime: playChime,
    speak: speakAnnouncement,
  };
}

async function playChime(): Promise<void> {
  const context = new AudioContext();
  try {
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
    tone.stop(now + 0.4);
    await new Promise<void>((resolve) => {
      tone.onended = () => resolve();
    });
  } finally {
    await context.close();
  }
}

async function speakAnnouncement(text: string, clips: string[]): Promise<void> {
  const spoken = (window as Window & { __spoken?: string[] }).__spoken;
  if (spoken) spoken.push(text);
  const voice = await indonesianVoice();
  if (voice) {
    await speakWithVoice(text, voice);
    return;
  }
  for (const src of clips) {
    await playClip(src);
  }
}

function speakWithVoice(text: string, voice: SpeechSynthesisVoice): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

async function indonesianVoice(): Promise<SpeechSynthesisVoice | null> {
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

function playClip(src: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().catch(() => resolve());
  });
}
