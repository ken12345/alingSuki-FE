import { Component, computed, input, model, output } from '@angular/core';

@Component({
  selector: 'app-pin-pad',
  template: `
    <div class="pin-dots" role="img" [attr.aria-label]="value().length + ' of ' + length() + ' digits entered'">
      @for (i of dots(); track i) { <span class="dot" [class.on]="i < value().length"></span> }
    </div>
    <div class="numpad">
      @for (key of keys; track $index) {
        @if (key === '') {
          <div></div>
        } @else {
          <button type="button" [disabled]="disabled()" (click)="press(key)" [attr.aria-label]="key === 'del' ? 'Delete' : key">
            @if (key === 'del') { <i class="bi bi-backspace"></i> } @else { {{ key }} }
          </button>
        }
      }
    </div>
  `,
})
export class PinPad {
  /** The digits typed so far. The parent can clear it by setting it to ''. */
  readonly value = model('');
  readonly length = input(4);
  readonly disabled = input(false);
  /** Fires once, when the last digit is entered. */
  readonly complete = output<string>();

  protected readonly dots = computed(() => Array.from({ length: this.length() }, (_, i) => i));
  protected readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  protected press(key: string): void {
    const current = this.value();
    if (key === 'del') return this.value.set(current.slice(0, -1));
    if (current.length >= this.length()) return;
    const next = current + key;
    this.value.set(next);
    if (next.length === this.length()) this.complete.emit(next);
  }
}
