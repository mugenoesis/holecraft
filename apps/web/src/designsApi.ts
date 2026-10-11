import { DesignValidationError, parseDesign, type Design, type DesignSummary } from '@holecraft/core';

/** A failed call to the server. `status` is 0 when the server could not be reached at all. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Worth trying again: the server was unreachable or had a problem, as opposed to refusing the request. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

export async function request(url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Could not reach the server');
  }
  if (response.ok) return response;

  let message = `The server returned an error (${response.status})`;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') message = body.error;
  } catch {
    // Not JSON (a proxy's error page, say): keep the generic message.
  }
  throw new ApiError(response.status, message);
}

const jsonInit = (method: string, body: unknown, extra: RequestInit = {}): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
  ...extra,
});

/** Designs come back through the same validation as files on disk, so nothing odd gets into the editor. */
async function readDesign(response: Response): Promise<Design> {
  try {
    return parseDesign(await response.json());
  } catch (error) {
    const detail = error instanceof DesignValidationError ? error.message : 'it is not a design';
    throw new ApiError(500, `This design could not be read: ${detail}`);
  }
}

export async function listDesigns(): Promise<DesignSummary[]> {
  return (await (await request('/api/designs')).json()) as DesignSummary[];
}

export async function createDesign(name?: string): Promise<Design> {
  return readDesign(await request('/api/designs', jsonInit('POST', name === undefined ? {} : { name })));
}

export async function getDesign(id: string): Promise<Design> {
  return readDesign(await request(`/api/designs/${id}`));
}

/** `keepalive` lets the request finish even as the page is being closed. */
export async function saveDesign(design: Design, opts: { keepalive?: boolean } = {}): Promise<Design> {
  return readDesign(await request(`/api/designs/${design.id}`, jsonInit('PUT', design, opts.keepalive ? { keepalive: true } : {})));
}

export async function renameDesignOnServer(id: string, name: string): Promise<Design> {
  return readDesign(await request(`/api/designs/${id}`, jsonInit('PATCH', { name })));
}

export async function duplicateDesign(id: string): Promise<Design> {
  return readDesign(await request(`/api/designs/${id}/duplicate`, { method: 'POST' }));
}

export async function deleteDesign(id: string): Promise<void> {
  await request(`/api/designs/${id}`, { method: 'DELETE' });
}
