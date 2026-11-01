import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../stores/useAuthStore';

export interface ApiErrorResponse {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export const api = axios.create({
  // Prefix /api theo quy ước của nhóm
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Tự động gắn accessToken vào header
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Xử lý response & lỗi tập trung
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    const errorCode = error.response?.data?.code;

    // Xử lý khi token hết hạn hoặc tài khoản bị khóa (401 USER_LOCKED)
    if (error.response?.status === 401 && !isLoginRequest) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(new Error(errorCode === 'USER_LOCKED' ? 'Tài khoản của bạn đã bị khóa' : 'Phiên đăng nhập đã hết hạn'));
    }

    // Xử lý thông báo khi gọi API chưa làm (501 NOT_IMPLEMENTED từ TV3/TV5)
    if (error.response?.status === 501) {
      return Promise.reject(new Error('Tính năng này đang được phát triển bởi Backend (501 NOT_IMPLEMENTED)'));
    }

    const message = error.response?.data?.message || error.message || 'Lỗi hệ thống';
    return Promise.reject(new Error(message));
  }
);