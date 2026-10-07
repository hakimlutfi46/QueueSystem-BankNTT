import { describe, expect, it, vi } from "vitest";
import { printTicket, type PrintTarget } from "@/lib/print/print-ticket";

describe("printTicket", () => {
  it("prints the saved ticket once", async () => {
    const printed = vi.fn();
    const removed = vi.fn();
    const frameListeners = new Map<string, () => void>();
    const iframe = {
      title: "",
      src: "",
      style: {},
      setAttribute: vi.fn(),
      remove: removed,
      contentWindow: {
        print: () => {
          printed();
          frameListeners.get("afterprint")?.();
        },
        addEventListener: (name: string, listener: () => void) => {
          frameListeners.set(name, listener);
        },
        removeEventListener: vi.fn(),
      },
      addEventListener: (name: string, listener: () => void) => {
        if (name === "load") listener();
      },
    };
    const target = {
      createElement: () => iframe,
      body: { append: () => undefined },
    } as unknown as PrintTarget;

    await printTicket({ id: "42" }, target);

    expect(iframe.src).toBe("/kiosk/print/42");
    expect(printed).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
  });

  it("does not leave the frame in place when printing fails", async () => {
    const removed = vi.fn();
    const iframe = {
      title: "",
      src: "",
      style: {},
      setAttribute: vi.fn(),
      remove: removed,
      contentWindow: {
        print: () => {
          throw new Error("printer offline");
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      addEventListener: (name: string, listener: () => void) => {
        if (name === "load") listener();
      },
    };
    const target = {
      createElement: () => iframe,
      body: { append: () => undefined },
    } as unknown as PrintTarget;

    await expect(printTicket({ id: "7" }, target)).rejects.toThrow("printer offline");
    expect(removed).toHaveBeenCalledOnce();
  });
});
