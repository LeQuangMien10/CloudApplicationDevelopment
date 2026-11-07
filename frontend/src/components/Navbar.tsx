import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { Landmark, ArrowLeftRight, History, LayoutDashboard, LogOut, ShieldCheck, UserCheck, User } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Hàm render badge màu riêng theo từng vai trò
  const renderRoleBadge = (role?: string) => {
    const r = role?.toUpperCase();
    if (r === 'ADMIN') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
          <ShieldCheck size={13} /> Quản trị viên
        </span>
      );
    }
    if (r === 'TELLER' || r === 'OPERATOR') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <UserCheck size={13} /> Giao dịch viên
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
        <User size={13} /> Khách hàng
      </span>
    );
  };

  return (
    <nav className="bg-slate-900 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <Landmark className="h-8 w-8 text-blue-400" />
            <span className="font-bold text-xl tracking-wide">DIGITAL BANK</span>
          </div>

          <div className="flex space-x-4">
            <Link to="/" className="flex items-center gap-1.5 px-3 py-2 rounded-md hover:bg-slate-800 text-sm font-medium">
              <LayoutDashboard size={18} /> Tổng quan
            </Link>
            <Link to="/transfer" className="flex items-center gap-1.5 px-3 py-2 rounded-md hover:bg-slate-800 text-sm font-medium">
              <ArrowLeftRight size={18} /> Chuyển khoản
            </Link>
            <Link to="/transactions" className="flex items-center gap-1.5 px-3 py-2 rounded-md hover:bg-slate-800 text-sm font-medium">
              <History size={18} /> Lịch sử
            </Link>
          </div>

          {/* User info: Họ tên + Vai trò */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center gap-2.5 bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-700/60">
              <span className="text-sm font-semibold text-slate-100">
                {user?.fullName || 'Nguyễn Văn An'}
              </span>
              {renderRoleBadge(user?.role)}
            </div>

            <button
              onClick={handleLogout}
              className="p-2 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded-lg transition"
              title="Đăng xuất"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};