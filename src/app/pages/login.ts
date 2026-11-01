import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { normalizeMobile } from '../core/format';
import { Ledger } from '../core/ledger';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <img class="auth-logo" src="logo-full.png" alt="Aling Suki">
      <div class="text-center">
        <h1 class="h4 fw-bold text-primary mb-1">Welcome back</h1>
        <p class="text-secondary mb-0">Log in to open your store ledger.</p>
      </div>
      <form class="card" (ngSubmit)="submit()"><div class="card-body d-flex flex-column gap-3">
        <div><label class="form-label fw-bold" for="mobile">Mobile number</label>
          <input id="mobile" name="mobile" class="form-control" type="tel" inputmode="numeric" autocomplete="tel" placeholder="09XX XXX XXXX" [(ngModel)]="mobile"></div>
        <div><label class="form-label fw-bold" for="password">Password</label>
          <input id="password" name="password" class="form-control" type="password" autocomplete="current-password" [(ngModel)]="password"></div>
        @if (error()) { <div class="text-danger small fw-semibold">{{ error() }}</div> }
        <button class="btn btn-primary" type="submit">Log in</button>
      </div></form>
      <p class="text-center mb-0">New here? <a routerLink="/register" class="fw-bold">Create an account</a></p>
    </div>
  `,
})
export class Login {
  private readonly ledger = inject(Ledger);
  private readonly router = inject(Router);
  protected mobile = signal('');
  protected password = signal('');
  protected readonly error = signal('');

  protected submit(): void {
    if (!normalizeMobile(this.mobile())) return this.error.set('Use a mobile number like 09XX XXX XXXX.');
    if (!this.password()) return this.error.set('Enter your password.');
    // Demo: no server yet, so any valid-looking login opens the sample store.
    this.ledger.signIn();
    this.router.navigate(['/']);
  }
}
