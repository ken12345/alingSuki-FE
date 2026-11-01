import { Injectable, inject, signal } from '@angular/core';
import { Secret, checkSecret, makeSecret } from './crypto';
import { AppDb } from './db';
import { normalizeMobile } from './format';
import { Ledger } from './ledger';

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
 * Accounts live on this phone for now (there is no server yet): the mobile number is the username, and the
 * password and optional PIN are stored only as salted hashes. The app opens locked every time it is launched.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly db = inject(AppDb);
  private readonly ledger = inject(Ledger);
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

  loginPassword(mobile: string, password: string): Promise<string | null> {
    return this.attempt('password', 'Wrong mobile number or password.', async (a) => {
      const passwordOk = await checkSecret(password, a.password);
      return passwordOk && normalizeMobile(mobile) === a.mobile;
    });
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
