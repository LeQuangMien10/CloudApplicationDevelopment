import { create } from 'zustand';

export interface User {
  id: string;
  fullName?: string;
  email: string;
  role: 'CUSTOMER' | 'TELLER' | 'ADMIN';
  accountNumber?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('accessToken'),
  user: localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')!) : null,

  setToken: (token: string) => {
    localStorage.setItem('accessToken', token);
    set({ token });
  },

  setUser: (user: User) => {
    localStorage.setItem('userInfo', JSON.stringify(user));
    set({ user });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userInfo');
    set({ token: null, user: null });
  },
}));