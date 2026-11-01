import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { Landmark, ArrowLeftRight, History, LayoutDashboard, LogOut } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-slate-900 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <Landmark className="h-8 w-8 text-blue-400" />
            <span className="font-bold text-xl tracking-wide">DIGITAL BANK</span>
          </div>

          {/* Navigation Links */}
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

          {/* User info & Logout */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-semibold">{user?.email}</p>
              <span className="text-xs text-blue-300 font-mono px-2 py-0.5 bg-blue-900/50 rounded-full">
                {user?.role || 'CUSTOMER'}
              </span>
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