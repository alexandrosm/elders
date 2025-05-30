import chalk from 'chalk';
import { z } from 'zod';

/**
 * Validate and parse data with Zod schema
 */
export function validateAndParse<T>(
  schema: z.Schema<T>,
  data: unknown,
  errorPrefix = 'Validation error'
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`${errorPrefix}: ${errors}`);
  }
  return result.data;
}

/**
 * Retry wrapper for async operations
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { retries = 3, delay = 1000, backoff = 2, onRetry } = options;

  let lastError: Error;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < retries) {
        const waitTime = delay * Math.pow(backoff, attempt);
        onRetry?.(attempt + 1, lastError);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError!;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Create a progress reporter
 */
export function createProgressReporter(total: number, prefix = 'Progress') {
  let completed = 0;

  return {
    increment() {
      completed++;
      const percentage = Math.round((completed / total) * 100);
      process.stdout.write(
        `\r${chalk.cyan(prefix)}: ${chalk.green('█'.repeat(percentage / 5))}${chalk.gray('░'.repeat(20 - percentage / 5))} ${percentage}%`
      );

      if (completed === total) {
        process.stdout.write('\n');
      }
    },

    complete() {
      completed = total;
      process.stdout.write('\n');
    },
  };
}

/**
 * Chunk array for pagination
 */
export function paginate<T>(
  items: T[],
  pageSize: number,
  page: number
): {
  items: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
} {
  const start = (page - 1) * pageSize;
  const paginatedItems = items.slice(start, start + pageSize);

  return {
    items: paginatedItems,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
    total: items.length,
  };
}
