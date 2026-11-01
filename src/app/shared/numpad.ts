import { Component, model } from '@angular/core';

@Component({
  selector: 'app-numpad',
  template: `
    <div class="numpad">
      @for (key of keys; track key) {
        <button type="button" (click)="press(key)" [attr.aria-label]="key === 'del' ? 'Delete' : key">
          @if (key === 'del') { <i class="bi bi-backspace"></i> } @else { {{ key }} }
        </button>
      }
    </div>
  `,
})
export class Numpad {
  /** The typed amount as digits, e.g. "500". */
  readonly value = model('');
  protected readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];

  protected press(key: string): void {
    const current = this.value();
    if (key === 'del') return this.value.set(current.slice(0, -1));
    const next = (current + key).replace(/^0+/, '');
    if (next.length <= 7) this.value.set(next);
  }
}
