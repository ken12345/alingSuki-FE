import { Component, input } from '@angular/core';
import { Item } from '../core/models';

/** An item's photo when it has one, otherwise its emoji. */
@Component({
  selector: 'app-item-thumb',
  template: `
    @if (item().photo) {
      <img class="thumb" [src]="item().photo" alt="">
    } @else {
      <span class="emoji">{{ item().emoji }}</span>
    }
  `,
})
export class ItemThumb {
  readonly item = input.required<Pick<Item, 'photo' | 'emoji'>>();
}
