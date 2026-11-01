import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { api } from '../services/api';
import { Landmark } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setToken, setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. POST /api/auth/login
      const loginRes = await api.post('/auth/login', { email, password });
      const accessToken = loginRes.data.accessToken;

      if (!accessToken) {
        throw new Error('Không nhận được accessToken từ server');
      }
      setToken(accessToken);

      // 2. GET /api/auth/me (TV2 đã hoàn thành)
      try {
        const meRes = await api.get('/auth/me');
        setUser(meRes.data);
      } catch {
        setUser({ id: 'me', email, role: 'CUSTOMER' });
      }

      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Đăng nhập không thành công');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Landmark size={36} />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Đăng nhập Ngân hàng Số</h2>
        <p className="text-sm text-slate-500 text-center mb-6">Mô phỏng giao dịch ngân hàng số Cloud-native</p>

        {error && (
          <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="an@example.com"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-xl shadow transition"
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="text-blue-600 hover:underline font-medium">
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  );
};