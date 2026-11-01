import { Injectable, inject, signal } from '@angular/core';
import { NetworkError } from './api';
import { Secret, checkSecret, makeSecret } from './crypto';
import { AppDb } from './db';
import { normalizeMobile } from './format';
import { Ledger } from './ledger';
import { Sync } from './sync';

interface AccountRow {
  mobile: string;
  ownerName: string;
  shopName: string;
  password: Secret;
  pin?: Secret;
  /** The owner chose "Maybe later" on the set-a-PIN screen, so we stop asking after logins. */
  pinDeclined: boolean;
  /** Wrong passwords in a row; five in a row start a timed lock. */
  attempts: number;
  lockedUntil: number;
  /** Wrong PINs in a row; five in a row switch PIN login off until the password is used. */
  pinAttempts: number;
}

const ACCOUNT_KEY = 'account';
const SESSION_KEY = 'aling-suki-unlocked';
const FREE_TRIES = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;
const PIN_LOCKED_MESSAGE = 'Too many wrong PINs. Log in with your mobile number and password instead.';

/**
 * The mobile number is the username. This phone keeps its own copy of the account: the password and the optional PIN are
 * stored only as salted hashes, so the phone can be unlocked with no signal. When an online account is linked (see Sync),
 * the server decides whether a password is right whenever the phone is online. The app opens locked every time it is launched.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly db = inject(AppDb);
  private readonly ledger = inject(Ledger);
  private readonly sync = inject(Sync);
  private row: AccountRow | null = null;

  readonly account = signal<{ mobile: string; ownerName: string } | null>(null);
  readonly hasPin = signal(false);
  /** Too many wrong PINs: only the password works until the next password login. */
  readonly pinLocked = signal(false);
  readonly signedIn = signal(false);

  async init(): Promise<void> {
    try {
      const saved = await this.db.meta.get(ACCOUNT_KEY);
      this.row = (saved?.value as AccountRow | undefined) ?? null;
      this.publish();
      // A reload inside the same app session stays unlocked; closing and reopening the app locks it again.
      this.signedIn.set(!!this.row && this.sessionUnlocked());
    } catch {
      this.row = null;
    }
  }

  shouldOfferPin(): boolean {
    return !!this.row && !this.row.pin && !this.row.pinDeclined;
  }

  async register(shopName: string, ownerName: string, mobile: string, password: string): Promise<string | null> {
    if (this.row) return 'This phone already has an account. Log in instead.';
    try {
      await this.persist({ mobile, ownerName, shopName, password: await makeSecret(password), pinDeclined: false, attempts: 0, lockedUntil: 0, pinAttempts: 0 });
    } catch {
      return "Couldn't save the account on this phone. Open the app over HTTPS and don't use private mode.";
    }
    this.ledger.setProfile(shopName, ownerName);
    this.unlock();
    return null;
  }

  async loginPassword(mobile: string, password: string): Promise<string | null> {
    let freshSecret: Secret | undefined;
    const problem = await this.attempt('password', 'Wrong mobile number or password.', async (account) => {
      if (normalizeMobile(mobile) !== account.mobile) return false;
      const localOk = await checkSecret(password, account.password);
      if (!this.sync.linked() || !navigator.onLine) return localOk;
      // Online and linked: the server decides, because the password may have been changed on another phone.
      try {
        const session = await this.sync.verifyPassword(account.mobile, password);
        if (!session) return false;
        if (!localOk) freshSecret = await makeSecret(password);
        return true;
      } catch (error) {
        if (error instanceof NetworkError) return localOk; // the server could not be reached: trust this phone's copy
        throw error;
      }
    });
    if (!problem && freshSecret && this.row) await this.persist({ ...this.row, password: freshSecret });
    return problem;
  }

  /** Creates the account online first (so the number is really free), then keeps a copy on this phone and starts backing up. */
  async registerOnline(shopName: string, ownerName: string, mobile: string, password: string): Promise<string | null> {
    if (this.row) return 'This phone already has an account. Log in instead.';
    const result = await this.sync.registerAccount({ shopName, ownerName, mobile, password });
    if ('error' in result) return result.error;
    const problem = await this.register(shopName, ownerName, mobile, password);
    if (problem) return problem;
    await this.sync.linkTo(result.session);
    return null;
  }

  /** For a new phone: log in to an account made elsewhere, then download its data. */
  async loginExisting(mobile: string, password: string): Promise<string | null> {
    if (this.row) return 'This phone already has an account. Log in instead.';
    const result = await this.sync.loginAccount(mobile, password);
    if ('error' in result) return result.error;
    const { shopName, ownerName, mobile: normalized } = result.session.account;
    const problem = await this.register(shopName, ownerName, normalized, password);
    if (problem) return problem;
    await this.sync.linkTo(result.session);
    return null;
  }

  /** For a phone that has been working offline: back everything up to an online account (new, or the same number's existing one). */
  async linkOnline(password: string): Promise<string | null> {
    const account = this.row;
    if (!account) return 'Create an account first.';
    if (!(await checkSecret(password, account.password))) return 'That is not your password.';

    const created = await this.sync.registerAccount({ shopName: account.shopName, ownerName: account.ownerName, mobile: account.mobile, password });
    let session;
    if ('session' in created) {
      session = created.session;
    } else if (created.code === 'mobile_taken') {
      // The number already has an online account (made on another phone): join it, and merge this phone's records into it.
      const login = await this.sync.loginAccount(account.mobile, password);
      if ('error' in login) return 'This mobile number already has an online account with a different password. Use that password.';
      session = login.session;
    } else {
      return created.error;
    }
    await this.sync.linkTo(session);
    return null;
  }

  /** Removes this phone's copy of an online account. Refused while anything is still waiting to be backed up. */
  async signOutAndRemoveData(): Promise<string | null> {
    const problem = await this.sync.safeToLeave();
    if (problem) return problem;
    await this.resetDevice();
    return null;
  }

  loginPin(pin: string): Promise<string | null> {
    return this.attempt('pin', 'Wrong PIN.', async (a) => (a.pin ? checkSecret(pin, a.pin) : false));
  }

  async setPin(pin: string): Promise<void> {
    if (!this.row) return;
    await this.persist({ ...this.row, pin: await makeSecret(pin), pinDeclined: false });
  }

  async removePin(): Promise<void> {
    if (!this.row) return;
    const { pin: _removed, ...rest } = this.row;
    await this.persist({ ...rest, pinDeclined: true });
  }

  async declinePin(): Promise<void> {
    if (this.row) await this.persist({ ...this.row, pinDeclined: true });
  }

  signOut(): void {
    this.signedIn.set(false);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing to clear */ }
  }

  /** For a forgotten password: erases the account and every record on this phone. */
  async resetDevice(): Promise<void> {
    if (this.sync.linked()) await this.sync.unlink();
    await this.ledger.wipeDevice();
    this.row = null;
    this.publish();
    this.signOut();
  }

  private async attempt(kind: 'password' | 'pin', wrongMessage: string, check: (account: AccountRow) => Promise<boolean>): Promise<string | null> {
    const account = this.row;
    if (!account) return 'No account on this phone yet.';
    const now = Date.now();
    if (kind === 'pin' && account.pinAttempts >= FREE_TRIES) return PIN_LOCKED_MESSAGE;
    if (kind === 'password' && account.lockedUntil > now) return this.lockMessage(account.lockedUntil - now);

    let ok = false;
    try { ok = await check(account); } catch { return "This browser can't check passwords here. Open the app over HTTPS."; }

    if (ok) {
      // A correct password clears everything; a correct PIN only clears the PIN counter.
      await this.persist(kind === 'password' ? { ...account, attempts: 0, lockedUntil: 0, pinAttempts: 0 } : { ...account, pinAttempts: 0 });
      this.unlock();
      return null;
    }
    if (kind === 'pin') {
      const pinAttempts = account.pinAttempts + 1;
      await this.persist({ ...account, pinAttempts });
      return pinAttempts >= FREE_TRIES ? PIN_LOCKED_MESSAGE : this.triesLeft(wrongMessage, pinAttempts);
    }
    const attempts = account.attempts + 1;
    if (attempts >= FREE_TRIES) {
      const wait = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (attempts - FREE_TRIES));
      await this.persist({ ...account, attempts, lockedUntil: now + wait });
      return this.lockMessage(wait);
    }
    await this.persist({ ...account, attempts });
    return this.triesLeft(wrongMessage, attempts);
  }

  private triesLeft(message: string, attempts: number): string {
    const left = FREE_TRIES - attempts;
    return `${message} ${left} ${left === 1 ? 'try' : 'tries'} left.`;
  }

  private lockMessage(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    return `Too many wrong tries. Wait ${seconds >= 60 ? Math.ceil(seconds / 60) + ' minutes' : seconds + ' seconds'} and try again.`;
  }

  private async persist(row: AccountRow): Promise<void> {
    await this.db.meta.put({ key: ACCOUNT_KEY, value: row });
    this.row = row;
    this.publish();
  }

  private publish(): void {
    this.account.set(this.row ? { mobile: this.row.mobile, ownerName: this.row.ownerName } : null);
    this.hasPin.set(!!this.row?.pin);
    this.pinLocked.set((this.row?.pinAttempts ?? 0) >= FREE_TRIES);
  }

  private unlock(): void {
    this.signedIn.set(true);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* the session just will not survive a reload */ }
  }

  private sessionUnlocked(): boolean {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  }
}
