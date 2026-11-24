export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  getToken: () => Promise<string | null>,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  const headers = new Headers(options.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload && typeof payload.error === 'string') {
        message = payload.error;
      }
    } catch {
      // ignore non-JSON error body
    }
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as T;
}

export async function apiDownloadCsv(
  path: string,
  filename: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  const token = await getToken();
  if (!token) {
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  const res = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new ApiError('Failed to download CSV report.', res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
