export type PrintableTicket = {
  id: string;
};

type PrintFrame = HTMLIFrameElement;

export type PrintTarget = {
  createElement: (tag: "iframe") => PrintFrame;
  body: { append: (frame: PrintFrame) => void };
};

export function printTicket(ticket: PrintableTicket, target?: PrintTarget): Promise<void> {
  const documentTarget = target ?? browserTarget();
  return new Promise((resolve, reject) => {
    const iframe = documentTarget.createElement("iframe");
    iframe.title = "Cetak tiket";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "80mm";
    iframe.style.height = "200mm";
    iframe.style.border = "0";
    iframe.src = `/kiosk/print/${encodeURIComponent(ticket.id)}`;

    const fail = (error: unknown) => {
      iframe.remove();
      reject(error instanceof Error ? error : new Error("Could not print the ticket."));
    };

    iframe.addEventListener("error", () => {
      fail(new Error("Could not load the ticket."));
    });
    iframe.addEventListener("load", () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        fail(new Error("Could not print the ticket."));
        return;
      }
      const finish = () => {
        frameWindow.removeEventListener("afterprint", finish);
        iframe.remove();
        resolve();
      };
      frameWindow.addEventListener("afterprint", finish);
      try {
        frameWindow.print();
      } catch (error) {
        frameWindow.removeEventListener("afterprint", finish);
        fail(error);
      }
    });

    documentTarget.body.append(iframe);
  });
}

function browserTarget(): PrintTarget {
  return document;
}
