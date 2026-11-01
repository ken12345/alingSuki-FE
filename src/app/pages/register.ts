import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { normalizeMobile } from '../core/format';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <img class="auth-logo" src="logo-full.png" alt="Aling Suki">

      @if (auth.account()) {
        <div class="text-center">
          <h1 class="h4 fw-bold text-primary mb-1">This phone already has an account</h1>
          <p class="text-secondary mb-0">Log in with your mobile number and password, or your PIN.</p>
        </div>
        <a class="btn btn-primary" routerLink="/login">Go to log in</a>
      } @else {
        <div class="text-center">
          <h1 class="h4 fw-bold text-primary mb-1">Create your account</h1>
          <p class="text-secondary mb-0">Free to start. Your records stay on this phone.</p>
        </div>
        <form class="card" (ngSubmit)="submit()"><div class="card-body d-flex flex-column gap-3">
          <div><label class="form-label fw-bold" for="shop">Store name</label>
            <input id="shop" name="shop" class="form-control" autocomplete="organization" placeholder="e.g. Aling Nena's Store" [(ngModel)]="shop"></div>
          <div><label class="form-label fw-bold" for="owner">Your name</label>
            <input id="owner" name="owner" class="form-control" autocomplete="name" [(ngModel)]="owner"></div>
          <div><label class="form-label fw-bold" for="mobile">Mobile number <small class="fw-normal text-secondary">(this is your username)</small></label>
            <input id="mobile" name="mobile" class="form-control" type="tel" inputmode="numeric" autocomplete="username" placeholder="09XX XXX XXXX" [(ngModel)]="mobile"></div>
          <div><label class="form-label fw-bold" for="password">Password <small class="fw-normal text-secondary">(at least 8 characters)</small></label>
            <input id="password" name="password" class="form-control" type="password" autocomplete="new-password" [(ngModel)]="password"></div>
          <div><label class="form-label fw-bold" for="confirm">Confirm password</label>
            <input id="confirm" name="confirm" class="form-control" type="password" autocomplete="new-password" [(ngModel)]="confirm"></div>
          <div class="form-check">
            <input id="consent" name="consent" class="form-check-input" type="checkbox" [(ngModel)]="consent">
            <label class="form-check-label small text-secondary" for="consent">I agree that my information is used for my account, as described in the Data Privacy notice.</label>
          </div>
          <div class="small text-secondary">There is no password reset yet, so remember this password.</div>
          @if (error()) { <div class="text-danger small fw-semibold" role="alert">{{ error() }}</div> }
          <button class="btn btn-primary" type="submit" [disabled]="busy()">{{ busy() ? 'Creating...' : 'Create account' }}</button>
        </div></form>
        <p class="text-center mb-0">Already have an account? <a routerLink="/login" class="fw-bold">Log in</a></p>
      }
    </div>
  `,
})
export class Register {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected shop = signal('');
  protected owner = signal('');
  protected mobile = signal('');
  protected password = signal('');
  protected confirm = signal('');
  protected consent = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    const mobile = normalizeMobile(this.mobile());
    if (!this.shop().trim() || !this.owner().trim()) return this.error.set('Enter your store name and your name.');
    if (!mobile) return this.error.set('Use a mobile number like 09XX XXX XXXX.');
    if (this.password().length < 8) return this.error.set('Your password needs at least 8 characters.');
    if (this.password() !== this.confirm()) return this.error.set('The two passwords do not match.');
    if (!this.consent()) return this.error.set('Please agree to continue.');

    this.busy.set(true);
    const problem = await this.auth.register(this.shop().trim(), this.owner().trim(), mobile, this.password());
    this.busy.set(false);
    if (problem) return this.error.set(problem);
    // Right after registering, offer a PIN for faster logins.
    this.router.navigate(['/set-pin']);
  }
}
