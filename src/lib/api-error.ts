export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function getApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null) {
      const body = data as { message?: unknown; errors?: unknown };

      if (Array.isArray(body.errors) && body.errors.length > 0) {
        return body.errors
          .filter((item): item is string => typeof item === 'string')
          .join(', ');
      }

      if ('message' in body) {
        const message = body.message;
        if (Array.isArray(message)) {
          return message.join(', ');
        }
        if (typeof message === 'string') {
          return message;
        }
      }
    }
  } catch {
    // ignore parse errors
  }
  return fallback;
}

export const INVALID_CREDENTIALS_MESSAGE =
  'Incorrect email or password. Please try again.';
