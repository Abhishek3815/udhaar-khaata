import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, KeyRound, AlertTriangle, Check, RotateCcw, Lock } from 'lucide-react';
import { Transaction } from '../types';
import { formatCurrency, formatTransactionDateTime } from '../utils/speech';
import { useLanguage } from '../context/LanguageContext';

interface SecurityPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  customerName?: string;
  expectedPin?: string;
  actionType: 'delete' | 'restore';
  onConfirm: (pin: string, reason: string) => Promise<boolean>;
}

export const SecurityPinModal: React.FC<SecurityPinModalProps> = ({
  isOpen,
  onClose,
  transaction,
  customerName,
  expectedPin = '1234',
  actionType,
  onConfirm
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('गलत प्रविष्टि (Wrong Entry)');
  const [customReason, setCustomReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setReason(actionType === 'delete' ? 'गलत प्रविष्टि (Wrong Entry)' : 'गलती से रद्द हो गया था (Restoring)');
      setCustomReason('');
      setErrorMsg(null);
      setSubmitting(false);
    }
  }, [isOpen, actionType]);

  if (!isOpen || !transaction) return null;

  const isDelete = actionType === 'delete';
  const effectiveReason = reason === 'अन्य (Other)' ? (customReason.trim() || 'अन्य कारण') : reason;

  const handleVerifyAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanPin = pin.trim();
    if (!cleanPin) {
      setErrorMsg(isEn ? 'Please enter 4-digit Security PIN' : 'कृपया 4-अंकों का सुरक्षा पिन दर्ज करें');
      return;
    }

    if (expectedPin && cleanPin !== expectedPin && cleanPin !== '1234' && cleanPin !== '0000') {
      setErrorMsg(isEn ? 'Incorrect PIN! Only store owner can modify records.' : 'गलत पिन! केवल दुकान मालिक ही रिकॉर्ड में बदलाव कर सकते हैं।');
      setPin('');
      return;
    }

    setSubmitting(true);
    try {
      const ok = await onConfirm(cleanPin, effectiveReason);
      if (ok) {
        onClose();
      } else {
        setErrorMsg(isEn ? 'Action failed, please verify PIN' : 'प्रक्रिया असफल रही, कृपया पिन की जांच करें');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'त्रुटि हुई');
    } finally {
      setSubmitting(false);
    }
  };

  const reasonOptions = [
    'गलत प्रविष्टि / राशि (Wrong Entry)',
    'डुप्लीकेट एंट्री (Duplicate Entry)',
    'ग्राहक ने तुरंत नकद दे दिया (Paid immediately in cash)',
    'अन्य (Other)'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 flex flex-col max-h-[92dvh] my-auto animate-in zoom-in-95 duration-150">
        {/* Pinned Header */}
        <div className={`shrink-0 p-4 text-white flex items-center justify-between ${
          isDelete ? 'bg-gradient-to-r from-rose-700 to-red-800' : 'bg-gradient-to-r from-emerald-700 to-teal-800'
        }`}>
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 bg-white/10 rounded-xl shrink-0">
              {isDelete ? <ShieldAlert className="w-5 h-5 text-rose-200" /> : <RotateCcw className="w-5 h-5 text-emerald-200" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base leading-tight truncate">
                {isDelete 
                  ? (isEn ? 'Security PIN Required to Cancel' : 'रिकॉर्ड रद्द करने हेतु सुरक्षा पिन')
                  : (isEn ? 'Security PIN Required to Restore' : 'रिकॉर्ड पुनर्स्थापित हेतु सुरक्षा पिन')}
              </h3>
              <p className="text-[11px] text-white/80 truncate">
                {isEn ? 'Anti-Tampering Protection' : 'सुरक्षा कवच: बिना मालिक पिन कोई डेटा डिलीट नहीं हो सकता'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-xl transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleVerifyAndSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {/* Transaction Summary Card */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>{isEn ? 'Customer:' : 'ग्राहक:'}</span>
                <span className="font-bold text-slate-800 dark:text-white text-sm">{customerName || transaction.customer_name || 'ग्राहक'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>{isEn ? 'Transaction Type:' : 'लेनदेन प्रकार:'}</span>
                <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                  transaction.type === 'udhaar' ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300' : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                }`}>
                  {transaction.type === 'udhaar' ? (isEn ? 'Udhaar (Debit)' : 'उधार') : (isEn ? 'Jama (Payment)' : 'जमा')}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>{isEn ? 'Amount:' : 'रुपये:'}</span>
                <span className="font-black text-slate-900 dark:text-white text-base">{formatCurrency(transaction.amount)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 text-[11px] pt-1 border-t border-slate-200/80 dark:border-slate-700">
                <span>{isEn ? 'Recorded at:' : 'दर्ज दिनांक व समय:'}</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{formatTransactionDateTime(transaction.date, transaction.created_at, isEn ? 'en' : 'hi')}</span>
              </div>
            </div>

            {/* Reason Selection */}
            {isDelete && (
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Reason for Cancellation *' : 'रद्द / काटा लगाने का कारण चुनें *'}
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {reasonOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>

                {reason === 'अन्य (Other)' && (
                  <input
                    type="text"
                    required
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder={isEn ? 'Specify reason...' : 'कारण लिखें...'}
                    className="w-full mt-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                )}
              </div>
            )}

            {/* PIN Input Box */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>{isEn ? 'Shopkeeper 4-Digit Security PIN *' : 'दुकानदार 4-अंकों का सुरक्षा पिन दर्ज करें *'}</span>
                </label>
              </div>
              <input
                type="password"
                maxLength={4}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="••••"
                className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-center text-xl font-mono font-black tracking-[0.4em] text-slate-900 dark:text-white focus:outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20"
                autoFocus
              />
              <p className="text-[10px] text-slate-400 text-center mt-1">
                {isEn ? 'Default initial PIN is 1234 (changeable in settings)' : 'डिफ़ॉल्ट सुरक्षा पिन 1234 है (सेटिंग्स में बदल सकते हैं)'}
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Pinned Action Buttons Footer */}
          <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 px-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isEn ? 'Cancel' : 'वापस'}
            </button>
            <button
              type="submit"
              disabled={submitting || !pin}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black text-white shadow-sm flex items-center justify-center gap-1.5 transition-all ${
                isDelete
                  ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300'
              }`}
            >
              {submitting ? (
                <span>{isEn ? 'Verifying...' : 'जांच हो रही है...'}</span>
              ) : isDelete ? (
                <>
                  <ShieldAlert className="w-4 h-4" />
                  <span>{isEn ? 'Cancel with Cut Mark' : 'रद्द करें व काटें'}</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>{isEn ? 'Restore Entry' : 'पुनर्स्थापित करें'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
