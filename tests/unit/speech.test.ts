import { describe, expect, it } from "vitest";
import { announcementScript } from "@/lib/speech/announcement";
import { createAnnouncementQueue, type AnnouncementPlayer } from "@/lib/speech/queue";
import { terbilang } from "@/lib/speech/terbilang";

describe("terbilang", () => {
  it("reads Indonesian numbers, including the special forms", () => {
    expect(terbilang(0)).toBe("nol");
    expect(terbilang(1)).toBe("satu");
    expect(terbilang(10)).toBe("sepuluh");
    expect(terbilang(11)).toBe("sebelas");
    expect(terbilang(12)).toBe("dua belas");
    expect(terbilang(20)).toBe("dua puluh");
    expect(terbilang(21)).toBe("dua puluh satu");
    expect(terbilang(100)).toBe("seratus");
    expect(terbilang(101)).toBe("seratus satu");
    expect(terbilang(111)).toBe("seratus sebelas");
    expect(terbilang(200)).toBe("dua ratus");
    expect(terbilang(1000)).toBe("seribu");
    expect(terbilang(1001)).toBe("seribu satu");
    expect(terbilang(1100)).toBe("seribu seratus");
    expect(terbilang(2000)).toBe("dua ribu");
    expect(terbilang(10000)).toBe("sepuluh ribu");
    expect(terbilang(101000)).toBe("seratus satu ribu");
    expect(terbilang(1000000)).toBe("satu juta");
  });
});

describe("announcementScript", () => {
  it("builds the call sentence from the ticket and the counter", () => {
    expect(announcementScript("A012", "CS 1", 1)).toEqual({
      text: "Nomor antrian A, dua belas. Silakan menuju loket CS satu.",
      clips: [
        "/audio/nomor-antrian.wav",
        "/audio/a.wav",
        "/audio/dua.wav",
        "/audio/belas.wav",
        "/audio/silakan-menuju-loket.wav",
        "/audio/cs.wav",
        "/audio/satu.wav",
      ],
    });
  });
});

describe("announcement queue", () => {
  it("speaks two close calls in order and never repeats an id", async () => {
    const spoken: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const player: AnnouncementPlayer = {
      chime: async () => {
        spoken.push("chime");
      },
      speak: async (text) => {
        spoken.push(text);
        if (spoken.filter((item) => item !== "chime").length === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
      },
    };
    const queue = createAnnouncementQueue(player);
    queue.enable();
    queue.announce({ id: "1", text: "pertama", clips: [], audible: true });
    queue.announce({ id: "2", text: "kedua", clips: [], audible: true });
    queue.announce({ id: "1", text: "pertama lagi", clips: [], audible: true });

    await waitFor(() => spoken.includes("pertama"));
    expect(spoken).toEqual(["chime", "pertama"]);

    releaseFirst?.();
    await waitFor(() => spoken.includes("kedua"));
    expect(spoken).toEqual(["chime", "pertama", "chime", "kedua"]);
  });
});

async function waitFor(ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for the announcement queue.");
}
