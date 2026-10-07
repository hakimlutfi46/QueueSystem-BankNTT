const DEFAULT_TIMEZONE = "Asia/Makassar";

export function appTimezone(): string {
  const configured = process.env.APP_TIMEZONE?.trim();
  return configured ? configured : DEFAULT_TIMEZONE;
}
