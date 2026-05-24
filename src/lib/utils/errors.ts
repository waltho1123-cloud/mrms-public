import { v4 as uuidv4 } from 'uuid';

export class AppError extends Error {
  code: string;
  statusCode: number;
  requestId: string;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = uuidv4();
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        request_id: this.requestId,
      },
    };
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(error.toJSON(), { status: error.statusCode });
  }

  const appError = new AppError(
    'ERR_INTERNAL',
    error instanceof Error ? error.message : 'Internal server error',
    500
  );
  return Response.json(appError.toJSON(), { status: 500 });
}
