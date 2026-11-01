import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface TransactionItem {
  id: string;
  fromAccountNumber: string;
  toAccountNumber: string;
  amount: number;
  memo: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
  createdAt: string;
}

export const HistoryPage: React.FC = () => {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        // GET /api/transactions?page=&limit=10
        const res = await api.get(`/transactions?page=${page}&limit=10`);
        setTransactions(res.data.data || res.data || []);
      } catch (err: any) {
        setNotice('Backend TV3 chưa hoàn thiện endpoint /transactions (501).');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [page]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Lịch sử giao dịch</h1>

      {notice && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm">
          <AlertCircle size={20} className="flex-shrink-0 text-amber-600" />
          <span>{notice}</span>
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
                  <td colSpan={6} className="py-8 text-center text-slate-400">Đang tải lịch sử...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">Chưa có giao dịch nào</td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-mono text-xs">{tx.id.slice(0, 8)}...</td>
                    <td className="py-3.5 px-4 font-mono">{tx.toAccountNumber}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {new Intl.NumberFormat('vi-VN').format(tx.amount)} đ
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{tx.memo}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        tx.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                        tx.status === 'PROCESSING' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-xs">
                      {new Date(tx.createdAt).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft size={16} /> Trang trước
          </button>
          <span className="text-sm text-slate-600">Trang {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={loading || transactions.length < 10}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Trang sau <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};