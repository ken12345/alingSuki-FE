import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

/** Everything except the login and register pages needs an unlocked app. */
export const authGuard: CanActivateFn = () => inject(Auth).signedIn() || inject(Router).createUrlTree(['/login']);

/** Login and register are for locked apps only; an unlocked one goes straight home. */
export const guestGuard: CanActivateFn = () => !inject(Auth).signedIn() || inject(Router).createUrlTree(['/']);
