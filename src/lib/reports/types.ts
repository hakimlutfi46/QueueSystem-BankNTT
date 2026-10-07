export type DurationStats = {
  averageSeconds: number | null;
  maxSeconds: number | null;
};

export type ReportTotals = {
  total: number;
  done: number;
  noShow: number;
  expired: number;
  wait: DurationStats;
  handle: DurationStats;
};

export type ServiceRecap = ReportTotals & {
  serviceId: number;
  serviceName: string;
};

export type CounterRecap = ReportTotals & {
  counterId: number;
  counterName: string;
  officerName: string;
};

export type HourBucket = {
  hour: number;
  count: number;
};

export type TicketDetail = {
  number: string;
  serviceName: string;
  counterName: string | null;
  officerName: string | null;
  createdAt: string;
  calledAt: string | null;
  finishedAt: string | null;
  waitSeconds: number | null;
  handleSeconds: number | null;
  callCount: number;
  status: string;
  autoClosed: boolean;
};

export type DailyReport = {
  date: string;
  timeZone: string;
  totals: ReportTotals;
  services: ServiceRecap[];
  counters: CounterRecap[];
  hours: HourBucket[];
  tickets: TicketDetail[];
};

export type RangeDay = ReportTotals & {
  date: string;
};

export type RangeReport = {
  from: string;
  to: string;
  timeZone: string;
  days: RangeDay[];
  totals: ReportTotals;
};

export type ReportFile = {
  filename: string;
  contentType: string;
  body: Buffer;
};
