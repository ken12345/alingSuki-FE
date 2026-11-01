import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Ledger } from './ledger';

export const authGuard: CanActivateFn = () => {
  const ledger = inject(Ledger);
  return ledger.loggedIn() || inject(Router).createUrlTree(['/login']);
};
