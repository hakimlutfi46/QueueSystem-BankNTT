export type CounterChoice = {
  id: number;
  name: string;
  displayNumber: number;
  status: "CLOSED" | "OPEN" | "PAUSED";
  officerId: number | null;
  officerName: string | null;
  available: boolean;
  serviceNames: string[];
};

export type DeskTicket = {
  id: string;
  number: string;
  serviceName: string;
  calledAt: string | null;
  callCount: number;
};

export type RecentTicket = {
  id: string;
  number: string;
  serviceName: string;
  status: "DONE" | "NO_SHOW";
  handlingSeconds: number | null;
};

export type CounterDesk =
  | {
      mode: "pick";
      branchName: string;
      counters: CounterChoice[];
    }
  | {
      mode: "desk";
      branchName: string;
      targetServiceMinutes: number;
      counter: {
        id: number;
        name: string;
        displayNumber: number;
        status: "OPEN" | "PAUSED";
        serviceNames: string[];
      };
      activeTicket: DeskTicket | null;
      waitingCount: number;
      recent: RecentTicket[];
    };
