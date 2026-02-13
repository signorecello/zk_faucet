export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }

  static invalidModule(moduleId: string): AppError {
    return new AppError(
      `Unknown module: ${moduleId}`,
      "INVALID_MODULE",
      400,
    );
  }

  static invalidPublicInputs(reason: string): AppError {
    return new AppError(
      `Invalid public inputs: ${reason}`,
      "INVALID_PUBLIC_INPUTS",
      400,
    );
  }

  static invalidProof(reason?: string): AppError {
    return new AppError(
      reason ?? "Proof verification failed",
      "INVALID_PROOF",
      400,
    );
  }

  static alreadyClaimed(): AppError {
    return new AppError(
      "Nullifier already spent this epoch",
      "ALREADY_CLAIMED",
      409,
    );
  }

  static dispatchFailed(reason: string): AppError {
    return new AppError(
      `Fund dispatch failed: ${reason}`,
      "DISPATCH_FAILED",
      500,
    );
  }

  static rateLimited(): AppError {
    return new AppError(
      "Too many requests, please try again later",
      "RATE_LIMITED",
      429,
    );
  }

  static notFound(resource: string): AppError {
    return new AppError(
      `${resource} not found`,
      "NOT_FOUND",
      404,
    );
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}
