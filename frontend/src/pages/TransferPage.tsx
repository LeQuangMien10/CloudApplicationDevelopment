import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../services/api';
import { Send, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export const TransferPage: React.FC = () => {
  const [toAccountNumber, setToAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Sinh key duy nhất ngay khi mở form
  const initNewKey = () => {
    setIdempotencyKey(uuidv4());
  };

  useEffect(() => {
    initNewKey();
  }, []);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // POST /api/transactions/transfer kèm header Idempotency-Key
      const response = await api.post(
        '/transactions/transfer',
        {
          toAccountNumber,
          amount: Number(amount),
          memo: memo || 'Chuyen tien noi bo',
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      setSuccessMessage(`Giao dịch thành công! Mã tham chiếu: ${response.data?.id || 'COMPLETED'}`);
      // Thành công mới đổi key và xóa form
      initNewKey();
      setToAccountNumber('');
      setAmount('');
      setMemo('');
    } catch (err: any) {
      // Thất bại giữ nguyên key để retry
      setErrorMessage(err.message || 'Chuyển tiền thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Chuyển khoản nội bộ</h1>
        <span className="text-xs font-mono bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200">
          Key: {idempotencyKey.slice(0, 8)}...
        </span>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3">
          <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{errorMessage}</p>
            <p className="text-xs text-rose-600 mt-1">
              * Khóa chống trùng lặp ({idempotencyKey.slice(0, 8)}...) vẫn được giữ nguyên để thử lại an toàn.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleTransfer} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Số tài khoản đích (12 số)</label>
          <input
            type="text"
            required
            value={toAccountNumber}
            onChange={(e) => setToAccountNumber(e.target.value)}
            placeholder="Ví dụ: 123456789012"
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền (VND)</label>
          <input
            type="number"
            required
            min="1000"
            step="1000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Tối thiểu 1.000 VND"
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nội dung (tối đa 140 ký tự)</label>
          <input
            type="text"
            maxLength={140}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Chuyen tien"
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-xl shadow transition"
        >
          {loading ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              <span>Đang thực hiện giao dịch...</span>
            </>
          ) : (
            <>
              <Send size={18} />
              <span>Xác nhận chuyển tiền</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};