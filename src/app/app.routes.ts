import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.Login) },
  { path: 'register', loadComponent: () => import('./pages/register').then((m) => m.Register) },
  { path: 'sale', canActivate: [authGuard], loadComponent: () => import('./pages/sale').then((m) => m.Sale) },
  {
    path: 'customers/:id/payment',
    canActivate: [authGuard],
    data: { mode: 'payment' },
    loadComponent: () => import('./pages/amount-entry').then((m) => m.AmountEntry),
  },
  {
    path: 'customers/:id/charge',
    canActivate: [authGuard],
    data: { mode: 'charge' },
    loadComponent: () => import('./pages/amount-entry').then((m) => m.AmountEntry),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/home').then((m) => m.Home) },
      { path: 'customers', loadComponent: () => import('./pages/customers').then((m) => m.Customers) },
      { path: 'customers/:id', loadComponent: () => import('./pages/customer-detail').then((m) => m.CustomerDetail) },
      { path: 'summary', loadComponent: () => import('./pages/summary').then((m) => m.Summary) },
      { path: 'items', loadComponent: () => import('./pages/items').then((m) => m.Items) },
      { path: 'more', loadComponent: () => import('./pages/more').then((m) => m.More) },
    ],
  },
  { path: '**', redirectTo: '' },
];
