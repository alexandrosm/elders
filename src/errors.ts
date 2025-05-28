export class OpenRouterError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

export class RateLimitError extends OpenRouterError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 429, undefined, true);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends OpenRouterError {
  constructor(message: string, public cause?: Error) {
    super(message, undefined, undefined, true);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends OpenRouterError {
  constructor(message: string) {
    super(message, 400, undefined, false);
    this.name = 'ValidationError';
  }
}