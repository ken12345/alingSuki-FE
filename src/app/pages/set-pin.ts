import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';
import { Ledger } from '../core/ledger';
import { PinPad } from '../shared/pin-pad';

const WEAK = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321'];

@Component({
  selector: 'app-set-pin',
  imports: [PinPad],
  template: `
    <div class="auth-wrap">
      <div class="text-center">
        <h1 class="h4 fw-bold text-primary mb-1">{{ step() === 'new' ? (auth.hasPin() ? 'Choose a new PIN' : 'Set a PIN') : 'Enter it again' }}</h1>
        <p class="text-secondary mb-0">
          {{ step() === 'new' ? 'Log in faster next time with 4 digits. You can still use your mobile number and password.' : 'Type the same 4 digits to confirm.' }}
        </p>
      </div>
      <app-pin-pad [(value)]="pin" [disabled]="busy()" (complete)="entered($event)" />
      @if (error()) { <div class="text-danger small fw-semibold text-center" role="alert">{{ error() }}</div> }
      <button type="button" class="btn btn-link text-secondary" (click)="skip()">{{ auth.hasPin() ? 'Cancel' : 'Maybe later' }}</button>
    </div>
  `,
})
export class SetPin {
  protected readonly auth = inject(Auth);
  private readonly ledger = inject(Ledger);
  private readonly router = inject(Router);

  protected readonly step = signal<'new' | 'confirm'>('new');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected pin = signal('');
  private first = '';

  protected async entered(pin: string): Promise<void> {
    if (this.step() === 'new') {
      if (WEAK.includes(pin)) {
        this.pin.set('');
        return this.error.set('That PIN is too easy to guess. Pick another.');
      }
      this.first = pin;
      this.error.set('');
      this.pin.set('');
      return this.step.set('confirm');
    }
    if (pin !== this.first) {
      this.first = '';
      this.pin.set('');
      this.step.set('new');
      return this.error.set('The PINs did not match. Start again.');
    }
    this.busy.set(true);
    try {
      await this.auth.setPin(pin);
    } catch {
      this.busy.set(false);
      return this.error.set("Couldn't save the PIN on this phone.");
    }
    this.ledger.showToast('PIN saved');
    this.router.navigate(['/']);
  }

  protected async skip(): Promise<void> {
    if (!this.auth.hasPin()) await this.auth.declinePin();
    this.router.navigate(['/']);
  }
}
