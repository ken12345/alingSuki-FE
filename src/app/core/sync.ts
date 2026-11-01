import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Api, ApiError, ApiSession, NetworkError, PushChange } from './api';
import { AppDb } from './db';
import { Ledger } from './ledger';
import { OutboxRow } from './models';

/** Everything the phone needs to keep talking to the server. Stored on this phone only. */
interface LinkRow {
  accountId: string;
  mobile: string;
  accessToken: string;
  /** When the access token stops working (ms). */
  accessExpiresAt: number;
  refreshToken: string;
  /** The highest server change number this phone has applied. */
  cursor: number;
  /** True once everything that was on the phone before linking has been queued for upload. */
  bootstrapped: boolean;
  lastSyncAt: number | null;
  /** Changes the server refused as invalid (they were dropped so they cannot block the rest). */
  rejected: number;
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'needs-login';

export type AccountResult = { session: ApiSession } | { error: string; code?: string };

const LINK_KEY = 'link';
const BATCH = 200;
const SOON_MS = 3_000;
const POLL_MS = 120_000;
/** Refresh the access token a little before it runs out. */
const TOKEN_MARGIN_MS = 60_000;

/**
 * Keeps this phone and the online account in step. The screens never wait on it: every change is saved on the phone
 * first and queued in the outbox, and this service sends the outbox and pulls other phones' changes whenever it can.
 */
@Injectable({ providedIn: 'root' })
export class Sync {
  private readonly db = inject(AppDb);
  private readonly ledger = inject(Ledger);
  private readonly api = inject(Api);

  /** False when no API is configured: the app then works on this phone only. */
  readonly enabled = this.api.enabled;
  readonly linked = signal(false);
  readonly state = signal<SyncState>('off');
  /** How many changes are waiting to be sent. */
  readonly pending = signal(0);
  readonly lastSyncAt = signal<number | null>(null);
  readonly lastError = signal('');

  private link: LinkRow | null = null;
  private running = false;
  private again = false;
  private soon: ReturnType<typeof setTimeout> | undefined;
  private refreshing: Promise<string> | null = null;

  constructor() {
    // A queued change is the cue to send it (after a short pause, so a burst of taps goes in one request).
    effect(() => {
      this.ledger.revision();
      untracked(() => {
        void this.refreshPending();
        this.syncSoon();
      });
    });
  }

  async init(): Promise<void> {
    if (!this.enabled) return;
    try {
      const saved = await this.db.meta.get(LINK_KEY);
      this.link = (saved?.value as LinkRow | undefined) ?? null;
    } catch {
      this.link = null;
    }
    if (this.link) {
      this.linked.set(true);
      this.ledger.syncLinked.set(true);
      this.lastSyncAt.set(this.link.lastSyncAt);
      this.state.set('idle');
      await this.refreshPending();
    }
    window.addEventListener('online', () => void this.syncNow());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.syncNow(); });
    setInterval(() => { if (document.visibilityState === 'visible') void this.syncNow(); }, POLL_MS);
    void this.syncNow();
  }

  // ---- account calls (used by the login and register screens) ------------------------------------------------------

  async registerAccount(input: { shopName: string; ownerName: string; mobile: string; password: string }): Promise<AccountResult> {
    try {
      return { session: await this.api.register(input) };
    } catch (error) {
      return { error: this.explain(error), code: error instanceof ApiError ? error.code : undefined };
    }
  }

  async loginAccount(mobile: string, password: string): Promise<AccountResult> {
    try {
      return { session: await this.api.login({ mobile, password }) };
    } catch (error) {
      return { error: this.explain(error), code: error instanceof ApiError ? error.code : undefined };
    }
  }

  /** Checks a password with the server for an already-linked phone. Returns the session, or null when it is wrong. Throws NetworkError offline. */
  async verifyPassword(mobile: string, password: string): Promise<ApiSession | null> {
    try {
      const session = await this.api.login({ mobile, password });
      await this.updateTokens(session);
      return session;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 429)) return null;
      throw error;
    }
  }

  // ---- linking ---------------------------------------------------------------------------------------------------

  /** Connects this phone to an online account and runs the first sync (uploads what is here, downloads what is there). */
  async linkTo(session: ApiSession): Promise<void> {
    this.link = {
      accountId: session.account.id,
      mobile: session.account.mobile,
      accessToken: session.accessToken,
      accessExpiresAt: Date.now() + session.expiresIn * 1000,
      refreshToken: session.refreshToken,
      cursor: 0,
      bootstrapped: false,
      lastSyncAt: null,
      rejected: 0,
    };
    await this.persist();
    this.linked.set(true);
    this.ledger.syncLinked.set(true);
    this.lastError.set('');
    await this.syncNow();
  }

  /** Stores fresh tokens after a login (for example when the password was changed on another phone). */
  async updateTokens(session: ApiSession): Promise<void> {
    if (!this.link) return;
    this.link = { ...this.link, accessToken: session.accessToken, accessExpiresAt: Date.now() + session.expiresIn * 1000, refreshToken: session.refreshToken };
    await this.persist();
    if (this.state() === 'needs-login') this.state.set('idle');
  }

  /** The login expired (for example the password changed elsewhere): ask for the password again, keep all local data. */
  async relogin(password: string): Promise<string | null> {
    if (!this.link) return 'This phone is not linked to an online account.';
    const result = await this.loginAccount(this.link.mobile, password);
    if ('error' in result) return result.error;
    await this.updateTokens(result.session);
    void this.syncNow();
    return null;
  }

  /** Whether it is safe to remove this phone's copy: everything must have reached the server. */
  async safeToLeave(): Promise<string | null> {
    if (!this.link) return null;
    await this.refreshPending();
    if (!this.link.bootstrapped) return 'Your data has not been backed up yet. Connect to the internet and wait for it to finish.';
    if (this.pending() > 0) return `${this.pending()} ${this.pending() === 1 ? 'change is' : 'changes are'} not backed up yet. Connect to the internet and sync first.`;
    return null;
  }

  /** Disconnects this phone. The online copy stays; the caller decides what happens to the local data. */
  async unlink(): Promise<void> {
    const link = this.link;
    this.link = null;
    clearTimeout(this.soon);
    this.linked.set(false);
    this.ledger.syncLinked.set(false);
    this.state.set('idle');
    this.pending.set(0);
    this.lastSyncAt.set(null);
    if (link) await this.api.logout(link.refreshToken).catch(() => undefined);
    await this.db.outbox.clear();
    await this.db.meta.delete(LINK_KEY);
  }

  // ---- the sync loop -----------------------------------------------------------------------------------------------

  syncSoon(): void {
    if (!this.link) return;
    clearTimeout(this.soon);
    this.soon = setTimeout(() => void this.syncNow(), SOON_MS);
  }

  async syncNow(): Promise<void> {
    if (!this.link) return;
    if (this.running) { this.again = true; return; }
    if (!navigator.onLine) { this.state.set('offline'); return; }

    this.running = true;
    this.state.set('syncing');
    try {
      if (!this.link.bootstrapped) {
        await this.ledger.enqueueEverything();
        this.link = { ...this.link, bootstrapped: true };
        await this.persist();
      }
      await this.pushAll();
      await this.pullAll();
      this.link = { ...this.link, lastSyncAt: Date.now() };
      await this.persist();
      this.lastSyncAt.set(this.link.lastSyncAt);
      this.lastError.set(this.link.rejected ? `${this.link.rejected} ${this.link.rejected === 1 ? 'change was' : 'changes were'} refused by the server and skipped.` : '');
      this.state.set('idle');
    } catch (error) {
      if (!this.link) return; // unlinked while syncing: nothing to report
      if (error instanceof NetworkError) this.state.set('offline');
      else if (error instanceof ApiError && error.status === 401) this.state.set('needs-login');
      else { this.state.set('error'); this.lastError.set(this.explain(error)); }
    } finally {
      this.running = false;
      await this.refreshPending();
      if (this.again) { this.again = false; void this.syncNow(); }
    }
  }

  private async pushAll(): Promise<void> {
    for (;;) {
      const rows = await this.db.outbox.orderBy('seq').limit(BATCH).toArray();
      if (!rows.length) return;
      try {
        await this.api.push(await this.accessToken(), rows.map(toChange));
      } catch (error) {
        // One bad change must not block everything behind it: find it by sending them one at a time.
        if (error instanceof ApiError && error.status === 400) { await this.pushOneByOne(rows); continue; }
        throw error;
      }
      await this.db.outbox.bulkDelete(rows.map((r) => r.seq as number));
    }
  }

  private async pushOneByOne(rows: OutboxRow[]): Promise<void> {
    for (const row of rows) {
      try {
        await this.api.push(await this.accessToken(), [toChange(row)]);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 400)) throw error;
        this.link = { ...(this.link as LinkRow), rejected: (this.link as LinkRow).rejected + 1 };
      }
      await this.db.outbox.delete(row.seq as number);
    }
    await this.persist();
  }

  private async pullAll(): Promise<void> {
    for (;;) {
      const link = this.link as LinkRow;
      const page = await this.api.pull(await this.accessToken(), link.cursor);
      await this.ledger.applyRemote(page.changes);
      this.link = { ...link, cursor: page.cursor };
      await this.persist();
      if (!page.hasMore) return;
    }
  }

  /** A valid access token, refreshed first if it is about to expire. Two callers at once share one refresh. */
  private accessToken(): Promise<string> {
    const link = this.link as LinkRow;
    if (link.accessExpiresAt - TOKEN_MARGIN_MS > Date.now()) return Promise.resolve(link.accessToken);
    return (this.refreshing ??= this.refreshToken(link).finally(() => (this.refreshing = null)));
  }

  private async refreshToken(link: LinkRow): Promise<string> {
    const session = await this.api.refresh(link.refreshToken);
    this.link = { ...(this.link as LinkRow), accessToken: session.accessToken, accessExpiresAt: Date.now() + session.expiresIn * 1000, refreshToken: session.refreshToken };
    await this.persist();
    return session.accessToken;
  }

  private persist(): Promise<unknown> {
    return this.link ? this.db.meta.put({ key: LINK_KEY, value: this.link }) : Promise.resolve();
  }

  async refreshPending(): Promise<void> {
    try { this.pending.set(await this.db.outbox.count()); } catch { /* the count is only a display */ }
  }

  private explain(error: unknown): string {
    if (error instanceof ApiError || error instanceof NetworkError) return error.message;
    return 'Something went wrong. Please try again.';
  }
}

const toChange = (row: OutboxRow): PushChange => ({ kind: row.kind, id: row.id, updatedAt: row.updatedAt, deleted: row.deleted, data: row.data });
