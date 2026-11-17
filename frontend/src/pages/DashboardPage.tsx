import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { Wallet, CreditCard, AlertCircle } from "lucide-react";

interface AccountData {
  accountNumber: string;
  balance: number | string;
  status: string;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        setLoading(true);
        // GET /api/accounts/me
        const res = await api.get("/accounts/me");
        const data = Array.isArray(res.data) ? res.data[0] : res.data;
        if (data) {
          setAccount(data);
        } else {
          setError("Không tìm thấy thông tin tài khoản");
        }
      } catch (err: unknown) {
        // BỎ HOÀN TOÀN DỮ LIỆU GIẢ/MOCK THEO YÊU CẦU CỦA LEADER
        const message =
          err instanceof Error
            ? err.message
            : "Không thể tải thông tin tài khoản";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchAccount();
  }, [user]);

  const formatVND = (val: number | string) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(Number(val || 0));
  };

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[40vh]">
        <p className="text-slate-500 animate-pulse">
          Đang tải dữ liệu tài khoản...
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Xin chào, {user?.fullName || user?.email}
        </h1>
        <p className="text-slate-500 text-sm">
          Chào mừng bạn đến với Ngân hàng số
        </p>
      </div>

      {notice && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm">
          <AlertCircle size={20} className="flex-shrink-0 text-amber-600" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-slate-500">
              Số dư khả dụng
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Wallet size={22} />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 tracking-tight">
            {formatVND(account?.balance || 0)}
          </p>
          <div className="mt-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              {account?.status || "ACTIVE"}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-slate-500">
              Số tài khoản thanh toán
            </span>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <CreditCard size={22} />
            </div>
          </div>
          <p className="text-2xl font-mono font-bold text-slate-800 tracking-wider">
            {account?.accountNumber || "---"}
          </p>
          <p className="mt-4 text-xs text-slate-400">
            Đơn vị tiền tệ: VND (Việt Nam Đồng)
          </p>
        </div>
      </div>
    </div>
  );
};
