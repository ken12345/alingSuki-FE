import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { normalizeMobile } from '../core/format';
import { Ledger } from '../core/ledger';
import { Sync } from '../core/sync';
import { PinPad } from '../shared/pin-pad';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, PinPad],
  template: `
    <div class="auth-wrap">
      <img class="auth-logo" src="logo-full.png" alt="Aling Suki">

      @if (!auth.account()) {
        @if (sync.enabled) {
          <div class="text-center">
            <h1 class="h4 fw-bold text-primary mb-1">Welcome to Aling Suki</h1>
            <p class="text-secondary mb-0">Log in to your account to bring your records to this phone, or create a new account.</p>
          </div>
          <form class="card" (ngSubmit)="submitExisting()"><div class="card-body d-flex flex-column gap-3">
            <div><label class="form-label fw-bold" for="mobile">Mobile number <small class="fw-normal text-secondary">(your username)</small></label>
              <input id="mobile" name="mobile" class="form-control" type="tel" inputmode="numeric" autocomplete="username" placeholder="09XX XXX XXXX" [(ngModel)]="mobile"></div>
            <div><label class="form-label fw-bold" for="password">Password</label>
              <input id="password" name="password" class="form-control" type="password" autocomplete="current-password" [(ngModel)]="password"></div>
            @if (error()) { <div class="text-danger small fw-semibold" role="alert">{{ error() }}</div> }
            <button class="btn btn-primary" type="submit" [disabled]="busy()">{{ busy() ? 'Logging in and loading your records...' : 'Log in' }}</button>
          </div></form>
          <a class="btn btn-outline-primary" routerLink="/register">Create an account</a>
        } @else {
          <div class="text-center">
            <h1 class="h4 fw-bold text-primary mb-1">Welcome to Aling Suki</h1>
            <p class="text-secondary mb-0">There is no account on this phone yet. Create one to start your store ledger.</p>
          </div>
          <a class="btn btn-primary" routerLink="/register">Create an account</a>
        }
      } @else if (showPin()) {
        <div class="text-center">
          <h1 class="h4 fw-bold text-primary mb-1">Welcome back, {{ auth.account()?.ownerName }}</h1>
          <p class="text-secondary mb-0">Enter your PIN</p>
        </div>
        <app-pin-pad [(value)]="pin" [disabled]="busy()" (complete)="submitPin($event)" />
        @if (error()) { <div class="text-danger small fw-semibold text-center" role="alert">{{ error() }}</div> }
        <button type="button" class="btn btn-link" (click)="switchTo(true)">Use mobile number and password</button>
      } @else {
        <div class="text-center">
          <h1 class="h4 fw-bold text-primary mb-1">Welcome back</h1>
          <p class="text-secondary mb-0">Log in with your mobile number and password.</p>
        </div>
        <form class="card" (ngSubmit)="submitPassword()"><div class="card-body d-flex flex-column gap-3">
          <div><label class="form-label fw-bold" for="mobile">Mobile number <small class="fw-normal text-secondary">(your username)</small></label>
            <input id="mobile" name="mobile" class="form-control" type="tel" inputmode="numeric" autocomplete="username" placeholder="09XX XXX XXXX" [(ngModel)]="mobile"></div>
          <div><label class="form-label fw-bold" for="password">Password</label>
            <input id="password" name="password" class="form-control" type="password" autocomplete="current-password" [(ngModel)]="password"></div>
          @if (error()) { <div class="text-danger small fw-semibold" role="alert">{{ error() }}</div> }
          <button class="btn btn-primary" type="submit" [disabled]="busy()">{{ busy() ? 'Checking...' : 'Log in' }}</button>
        </div></form>
        @if (auth.hasPin() && !auth.pinLocked()) {
          <button type="button" class="btn btn-link" (click)="switchTo(false)">Use my PIN instead</button>
        }
      }

      @if (auth.account()) {
        <button type="button" class="btn btn-link text-secondary btn-sm" (click)="confirmReset.set(true)">Forgot your password?</button>
      }
    </div>

    @if (confirmReset()) {
      <div class="sheet-dim" (click)="confirmReset.set(false)"></div>
      <div class="sheet d-flex flex-column gap-2">
        <h2 class="h5 fw-bold mb-0">Forgot your password?</h2>
        <p class="small text-secondary mb-1">
          @if (sync.linked()) {
            There is no password reset yet. Your records are safe online, but without your password this account cannot be opened.
            Erasing this phone removes the account from this phone only{{ sync.pending() ? ', and the ' + sync.pending() + ' change(s) not yet backed up are lost' : '' }}.
            If you remember the password later, you can log in again and everything comes back.
          } @else {
            Accounts are kept only on this phone, so there is no way to email or text you a reset.
            The only way back in is to erase this phone and start again, which deletes the account and every customer, item and record on it.
            If you have a backup file you can restore it after creating a new account.
          }
        </p>
        <button type="button" class="btn btn-danger" (click)="reset()">Erase this phone and start over</button>
        <button type="button" class="btn btn-link text-secondary" (click)="confirmReset.set(false)">Cancel</button>
      </div>
    }
  `,
})
export class Login {
  protected readonly auth = inject(Auth);
  protected readonly sync = inject(Sync);
  private readonly ledger = inject(Ledger);
  private readonly router = inject(Router);

  private readonly usePassword = signal(false);
  protected readonly showPin = computed(() => this.auth.hasPin() && !this.auth.pinLocked() && !this.usePassword());
  protected readonly confirmReset = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected pin = signal('');
  protected mobile = signal(this.auth.account()?.mobile ?? '');
  protected password = signal('');

  protected switchTo(password: boolean): void {
    this.usePassword.set(password);
    this.error.set('');
    this.pin.set('');
  }

  protected async submitPin(pin: string): Promise<void> {
    this.busy.set(true);
    const problem = await this.auth.loginPin(pin);
    this.busy.set(false);
    this.pin.set('');
    if (problem) return this.error.set(problem);
    this.enter();
  }

  protected async submitExisting(): Promise<void> {
    if (!normalizeMobile(this.mobile())) return this.error.set('Use a mobile number like 09XX XXX XXXX.');
    if (!this.password()) return this.error.set('Enter your password.');
    this.busy.set(true);
    const problem = await this.auth.loginExisting(this.mobile(), this.password());
    this.busy.set(false);
    this.password.set('');
    if (problem) return this.error.set(problem);
    this.enter();
  }

  protected async submitPassword(): Promise<void> {
    if (!normalizeMobile(this.mobile())) return this.error.set('Use a mobile number like 09XX XXX XXXX.');
    if (!this.password()) return this.error.set('Enter your password.');
    this.busy.set(true);
    const problem = await this.auth.loginPassword(this.mobile(), this.password());
    this.busy.set(false);
    this.password.set('');
    if (problem) return this.error.set(problem);
    this.enter();
  }

  protected async reset(): Promise<void> {
    await this.auth.resetDevice();
    this.confirmReset.set(false);
    this.usePassword.set(false);
    this.mobile.set('');
    this.error.set('');
    this.ledger.showToast('This phone was erased. Create a new account.');
  }

  /** After a password login, offer to set a PIN (once) so the next login is faster. */
  private enter(): void {
    this.router.navigate([this.auth.shouldOfferPin() ? '/set-pin' : '/']);
  }
}
