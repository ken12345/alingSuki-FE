import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DAY, startOfDay } from '../core/format';
import { Ledger } from '../core/ledger';
import { PageHeader } from '../shared/page-header';

type Period = 'today' | 'week' | 'month';
const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30 };
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

@Component({
  selector: 'app-summary',
  imports: [CurrencyPipe, PageHeader],
  template: `
    <app-page-header title="Summary" />
    <div class="page-body">
      <div class="chips">
        <button type="button" class="chip" [class.on]="period() === 'today'" (click)="period.set('today')">Today</button>
        <button type="button" class="chip" [class.on]="period() === 'week'" (click)="period.set('week')">Week</button>
        <button type="button" class="chip" [class.on]="period() === 'month'" (click)="period.set('month')">Month</button>
      </div>

      <div class="card"><div class="card-body">
        <div class="label">Sales {{ period() === 'today' ? 'today' : period() === 'week' ? 'this week' : 'this month' }}</div>
        <div class="amount-lg">{{ totals().sales | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div>
        <div class="bars mt-3" aria-label="Sales for the last 7 days">
          @for (d of week(); track d.day) { <div class="bar" [class.on]="d.today" [style.height.%]="d.height"></div> }
        </div>
        <div class="bar-days mt-1">@for (d of week(); track d.day) { <span>{{ d.label }}</span> }</div>
      </div></div>

      <div class="row g-2">
        <div class="col-6"><div class="card"><div class="card-body">
          <div class="label">Profit</div><div class="fs-4 fw-bold text-success">{{ totals().profit | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div>
        </div></div></div>
        <div class="col-6"><div class="card"><div class="card-body">
          <div class="label">Collected</div><div class="fs-4 fw-bold">{{ totals().collected | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div>
        </div></div></div>
      </div>

      <h2 class="h6 fw-bold mb-0 mt-1">Best sellers</h2>
      <div class="d-flex flex-column gap-2">
        @for (b of best(); track b.name) {
          <div class="row-card"><div class="grow"><div class="fw-bold">{{ b.name }}</div><div class="sub">{{ b.qty }} sold</div></div>
            <div class="fw-bold">{{ b.amount | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div></div>
        } @empty { <div class="text-secondary small">No sales in this period yet.</div> }
      </div>

      <h2 class="h6 fw-bold mb-0 mt-1">Who owes the most</h2>
      <div class="d-flex flex-column gap-2">
        @for (c of ledger.due().slice(0, 3); track c.id) {
          <div class="row-card"><div class="grow fw-bold">{{ c.name }}</div>
            <div class="fw-bold text-danger">{{ ledger.balanceOf(c.id) | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div></div>
        }
      </div>
    </div>
  `,
})
export class Summary {
  protected readonly ledger = inject(Ledger);
  protected readonly period = signal<Period>('week');

  private readonly from = computed(() => startOfDay() - (PERIOD_DAYS[this.period()] - 1) * DAY);
  protected readonly totals = computed(() => this.ledger.totals(this.from()));

  protected readonly week = computed(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const start = startOfDay() - (6 - i) * DAY;
      return { day: start, today: i === 6, label: WEEKDAY[new Date(start).getDay()], sales: this.ledger.totals(start, start + DAY).sales };
    });
    const max = Math.max(1, ...days.map((d) => d.sales));
    return days.map((d) => ({ ...d, height: Math.max(4, Math.round((d.sales / max) * 100)) }));
  });

  protected readonly best = computed(() => {
    const sold = new Map<string, { qty: number; amount: number }>();
    for (const e of this.ledger.entries()) {
      if (e.date < this.from()) continue;
      for (const l of e.lines) {
        const row = sold.get(l.name) ?? { qty: 0, amount: 0 };
        sold.set(l.name, { qty: row.qty + l.qty, amount: row.amount + l.amount });
      }
    }
    return [...sold].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount).slice(0, 3);
  });
}
