export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown) {
    return new AppError(message, 400, code, details);
  }
  static unauthorized(message = 'Not authenticated', code = 'UNAUTHORIZED') {
    return new AppError(message, 401, code);
  }
  static forbidden(message = 'Not authorized', code = 'FORBIDDEN') {
    return new AppError(message, 403, code);
  }
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(message, 404, code);
  }
  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(message, 409, code);
  }
}
