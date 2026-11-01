import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { Auth } from './core/auth';
import { Ledger } from './core/ledger';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Load the device database and the account before the first route so the guards know who is signed in.
    provideAppInitializer(() => {
      const ledger = inject(Ledger);
      const auth = inject(Auth);
      return ledger.init().then(() => auth.init());
    }),
    provideRouter(routes, withComponentInputBinding()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ]
};
