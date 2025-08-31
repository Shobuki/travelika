import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home.component').then(m => m.HomeComponent) },
  { path: 'login', loadComponent: () => import('./login/login.component').then(m => m.LoginComponent) },
   { path: 'mybookings', loadComponent: () => import('./mybookings/mybookings.component').then(m => m.MyBookingsComponent) },
];
