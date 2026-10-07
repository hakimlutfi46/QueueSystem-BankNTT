export class QueueError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "QueueError";
    this.code = code;
  }
}
