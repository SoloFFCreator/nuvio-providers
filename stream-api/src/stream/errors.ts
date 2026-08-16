export class StreamApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "StreamApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
