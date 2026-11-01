import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  template: `
    <header class="page-header">
      @if (back()) {
        <a class="icon-btn" [routerLink]="back()" aria-label="Back"><i class="bi bi-chevron-left"></i></a>
      }
      <h1>{{ title() }}</h1>
      <ng-content />
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  /** Route to go back to; the back button is hidden when empty. */
  readonly back = input<string | any[]>('');
}
