import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page">
      <main class="page-scroll"><router-outlet /></main>
      <nav class="tabbar" aria-label="Main">
        <a class="tab" routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }"><i class="bi bi-house-door"></i>Home</a>
        <a class="tab" routerLink="/customers" routerLinkActive="on"><i class="bi bi-people"></i>Customers</a>
        <a class="tab fab" routerLink="/sale" aria-label="New sale"><i class="bi bi-plus-lg"></i></a>
        <a class="tab" routerLink="/summary" routerLinkActive="on"><i class="bi bi-bar-chart"></i>Summary</a>
        <a class="tab" routerLink="/more" routerLinkActive="on"><i class="bi bi-three-dots"></i>More</a>
      </nav>
    </div>
  `,
})
export class Shell {}
