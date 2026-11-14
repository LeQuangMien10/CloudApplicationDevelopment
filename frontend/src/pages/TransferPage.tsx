import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "../services/api";
import {
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
} from "lucide-react";

interface Account {
  id: string;
  accountNumber: string;
  balance: number | string;
}

export const TransferPage: React.FC = () => {
  const [fromAccountId, setFromAccountId] = useState("");
  const [senderAccount, setSenderAccount] = useState<Account | null>(null);

  const [toAccountNumber, setToAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  // State cho phần tra cứu tên người thụ hưởng
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [searchingRecipient, setSearchingRecipient] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => uuidv4());
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const initNewKey = () => setIdempotencyKey(uuidv4());

  useEffect(() => {
    const fetchMyAccount = async () => {
      try {
        const res = await api.get("/accounts/me");
        const account = Array.isArray(res.data) ? res.data[0] : res.data;
        if (account?.id) {
          setFromAccountId(account.id);
          setSenderAccount(account);
        }
      } catch {
        // Đổi catch (err: any) thành catch
        setErrorMessage("Không thể tải thông tin tài khoản nguồn");
      }
    };
    fetchMyAccount();
  }, []);

  // Xử lý khi nhập số tài khoản thụ hưởng
  const handleAccountNumberChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value.replace(/[^0-9]/g, ""); // Chỉ cho nhập số
    setToAccountNumber(val);
    setRecipientName(null);
    setRecipientError(null);

    // Khi gõ đủ đúng 12 số thì tự động tra cứu
    if (val.length === 12) {
      if (senderAccount?.accountNumber === val) {
        setRecipientError("Không thể chuyển cho chính tài khoản nguồn");
        return;
      }

      setSearchingRecipient(true);
      try {
        const res = await api.get(`/accounts/lookup/${val}`);
        setRecipientName(res.data.accountHolderName);
      } catch {
        setRecipientError("Không tìm thấy tài khoản thụ hưởng");
      } finally {
        setSearchingRecipient(false);
      }
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (toAccountNumber.length !== 12) {
      setErrorMessage("Số tài khoản thụ hưởng phải gồm đúng 12 chữ số");
      setLoading(false);
      return;
    }

    try {
      const response = await api.post(
        "/transactions/transfer",
        {
          fromAccountId,
          toAccountNumber: toAccountNumber.trim(),
          amount: String(amount).trim(),
          description: description.trim() || undefined,
        },
        {
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );

      setSuccessMessage(
        `Chuyển tiền thành công! Mã giao dịch: ${response.data?.id || "COMPLETED"}`,
      );
      initNewKey();
      setToAccountNumber("");
      setAmount("");
      setDescription("");
      setRecipientName(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      let friendlyError = msg || "Giao dịch chuyển tiền thất bại";
      if (msg.includes("SAME_ACCOUNT"))
        friendlyError = "Không thể tự chuyển tiền cho chính tài khoản nguồn";
      else if (msg.includes("INSUFFICIENT_FUNDS"))
        friendlyError = "Số dư trong tài khoản không đủ để thực hiện giao dịch";
      else if (msg.includes("TARGET_ACCOUNT_NOT_FOUND"))
        friendlyError = "Số tài khoản thụ hưởng không tồn tại";
      else if (msg.includes("TARGET_ACCOUNT_NOT_ACTIVE"))
        friendlyError = "Tài khoản thụ hưởng đang bị khóa hoặc đóng";
      setErrorMessage(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          Chuyển khoản nội bộ
        </h1>
        <span className="text-xs font-mono bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200">
          Key: {idempotencyKey.slice(0, 8)}...
        </span>
      </div>

      {senderAccount && (
        <div className="p-4 bg-slate-100 rounded-xl text-sm text-slate-600 flex justify-between">
          <span>
            Tài khoản nguồn: <strong>{senderAccount.accountNumber}</strong>
          </span>
          <span>
            Số dư:{" "}
            <strong className="text-emerald-600">
              {new Intl.NumberFormat("vi-VN").format(
                Number(senderAccount.balance || 0),
              )}{" "}
              đ
            </strong>
          </span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3">
          <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-3">
          <AlertTriangle
            size={20}
            className="text-rose-600 flex-shrink-0 mt-0.5"
          />
          <div>
            <p className="font-semibold">{errorMessage}</p>
            <p className="text-xs text-rose-600 mt-1">
              * Khóa chống trùng lặp ({idempotencyKey.slice(0, 8)}...) được giữ
              nguyên để thử lại an toàn.
            </p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleTransfer}
        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4"
      >
        {/* Ô nhập số tài khoản + Box hiển thị tên người thụ hưởng */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Số tài khoản thụ hưởng (12 chữ số)
          </label>
          <div className="relative">
            <input
              type="text"
              required
              maxLength={12}
              value={toAccountNumber}
              onChange={handleAccountNumberChange}
              placeholder="Nhập 12 chữ số (ví dụ: 100000000003)"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
            />
            {searchingRecipient && (
              <div className="absolute right-3.5 top-3 text-slate-400 flex items-center gap-1.5 text-xs">
                <RefreshCw size={15} className="animate-spin text-blue-600" />
                <span>Đang kiểm tra...</span>
              </div>
            )}
          </div>

          {/* Hộp hiển thị tên người thụ hưởng sau khi tra cứu thành công */}
          {recipientName && (
            <div className="mt-2.5 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800">
              <CheckCircle
                size={18}
                className="text-emerald-600 flex-shrink-0"
              />
              <div>
                <span className="text-xs text-emerald-600 block">
                  Người thụ hưởng
                </span>
                <span className="font-bold tracking-wide uppercase text-sm">
                  {recipientName}
                </span>
              </div>
            </div>
          )}

          {recipientError && (
            <p className="mt-1.5 text-xs text-rose-600 font-medium">
              {recipientError}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Số tiền (VND)
          </label>
          <input
            type="number"
            required
            min="1000"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ví dụ: 50000"
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nội dung chuyển khoản (Tối đa 140 ký tự)
          </label>
          <input
            type="text"
            maxLength={140}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Trả tiền ăn trưa"
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !fromAccountId || !recipientName}
          className="w-full mt-2 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow transition"
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
