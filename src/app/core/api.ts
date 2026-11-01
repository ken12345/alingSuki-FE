import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { RecordKind, RemoteChange } from './models';

/** The server answered with an error. `message` is written for the owner to read. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
  }
}

/** No answer at all: offline, the server is down, or the request timed out. */
export class NetworkError extends Error {
  constructor() {
    super("Can't reach the server. Check your internet and try again.");
  }
}

export interface ApiAccount {
  id: string;
  mobile: string;
  shopName: string;
  ownerName: string;
}

export interface ApiSession {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  account: ApiAccount;
}

export interface PushChange {
  kind: RecordKind;
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: unknown;
}

const TIMEOUT_MS = 20_000;

/** Thin wrapper over the backend's JSON API. Knows nothing about tokens: the Sync service passes them in. */
@Injectable({ providedIn: 'root' })
export class Api {
  /** False until environment.apiUrl is set; the app then stays on this phone only. */
  readonly enabled = !!environment.apiUrl;

  register(body: { shopName: string; ownerName: string; mobile: string; password: string }) {
    return this.request<ApiSession>('POST', '/v1/auth/register', body);
  }

  login(body: { mobile: string; password: string }) {
    return this.request<ApiSession>('POST', '/v1/auth/login', body);
  }

  refresh(refreshToken: string) {
    return this.request<ApiSession>('POST', '/v1/auth/refresh', { refreshToken });
  }

  logout(refreshToken: string) {
    return this.request<void>('POST', '/v1/auth/logout', { refreshToken });
  }

  push(token: string, changes: PushChange[]) {
    return this.request<{ applied: number; ignored: number; cursor: number }>('POST', '/v1/sync/push', { changes }, token);
  }

  pull(token: string, since: number, limit = 200) {
    return this.request<{ changes: RemoteChange[]; cursor: number; hasMore: boolean }>('GET', `/v1/sync/pull?since=${since}&limit=${limit}`, undefined, token);
  }

  private async request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(environment.apiUrl + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 204) return undefined as T;
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, json.code, json.error ?? 'Something went wrong. Please try again.');
    return json as T;
  }
}
