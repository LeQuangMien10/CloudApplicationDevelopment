import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { AlertCircle, ChevronLeft, ChevronRight, History } from "lucide-react";

interface TransactionItem {
  id: string;
  type?: "transfer" | "deposit";
  fromAccountId?: string;
  toAccountId?: string;
  toAccountNumber?: string;
  amount: string | number;
  description?: string;
  memo?: string;
  status: string;
  createdAt: string;
  toAccount?: {
    accountNumber?: string;
    user?: {
      fullName?: string;
    };
  };
}

export const HistoryPage: React.FC = () => {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);

        // Gọi API theo đúng query của ListTransactionsQuery
        const res = await api.get("/transactions", {
          params: { page, limit },
        });

        // Bóc tách đúng key "transactions" và "total" do backend trả về
        const list = res.data?.transactions || [];
        setTransactions(Array.isArray(list) ? list : []);
        setTotal(res.data?.total || 0);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Không thể tải lịch sử giao dịch";
        setError(message);
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [page]);

  const totalPages = Math.ceil(total / limit) || 1;

  // Helper hiển thị số tài khoản đích an toàn
  const getDestinationDisplay = (tx: TransactionItem) => {
    // 1. Nếu là nạp tiền
    if (tx.type === "deposit") {
      return (
        <span className="text-emerald-600 font-medium">Tài khoản của tôi</span>
      );
    }

    // 2. Nếu có thông tin User của tài khoản đích do Backend trả về
    const recipientName = tx.toAccount?.user?.fullName;
    const recipientAccNum = tx.toAccount?.accountNumber;

    if (recipientName) {
      return (
        <div>
          <p className="font-semibold text-slate-800">{recipientName}</p>
          <p className="text-xs text-slate-400 font-mono">
            {recipientAccNum || tx.toAccountNumber}
          </p>
        </div>
      );
    }

    // 3. Fallback nếu chỉ có số tài khoản hoặc ID
    if (recipientAccNum)
      return <span className="font-mono">{recipientAccNum}</span>;
    if (tx.toAccountId)
      return <span className="font-mono">{tx.toAccountId.slice(0, 8)}...</span>;
    return "---";
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
          <History size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Lịch sử giao dịch
          </h1>
          <p className="text-sm text-slate-500">Tổng số: {total} giao dịch</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm">
          <AlertCircle size={20} className="flex-shrink-0 text-amber-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Mã GD</th>
                <th className="py-3.5 px-4 font-semibold">Tài khoản đích</th>
                <th className="py-3.5 px-4 font-semibold">Số tiền (VND)</th>
                <th className="py-3.5 px-4 font-semibold">Nội dung</th>
                <th className="py-3.5 px-4 font-semibold">Trạng thái</th>
                <th className="py-3.5 px-4 font-semibold">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <span className="inline-block animate-pulse">
                      Đang tải lịch sử giao dịch...
                    </span>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Chưa có giao dịch nào được ghi nhận
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isDeposit = tx.type === "deposit";
                  const statusUpper = tx.status?.toUpperCase();

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                        {tx.id ? `${tx.id.slice(0, 8)}...` : "---"}
                      </td>

                      {/* Cột tài khoản đích */}
                      <td className="py-3.5 px-4 font-mono text-sm text-slate-700">
                        {getDestinationDisplay(tx)}
                      </td>

                      {/* Cột số tiền: Phân biệt Tiền vào (+) xanh lá, Tiền ra (-) đen */}
                      <td
                        className={`py-3.5 px-4 font-bold ${isDeposit ? "text-emerald-600" : "text-slate-900"}`}
                      >
                        {isDeposit ? "+" : "-"}{" "}
                        {new Intl.NumberFormat("vi-VN").format(
                          Number(tx.amount || 0),
                        )}{" "}
                        đ
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                        {tx.description || "Chuyển tiền"}
                      </td>

                      {/* Cột trạng thái: Chữ hoa/thường đều khớp màu xanh */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            statusUpper === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : statusUpper === "PROCESSING"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 text-xs">
                        {tx.createdAt
                          ? new Date(tx.createdAt).toLocaleString("vi-VN")
                          : "---"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="flex items-center gap-1 px-3.5 py-1.5 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft size={16} /> Trang trước
          </button>
          <span className="text-sm font-medium text-slate-600">
            Trang {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1 px-3.5 py-1.5 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Trang sau <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
