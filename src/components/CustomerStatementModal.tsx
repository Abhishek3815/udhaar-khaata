import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Share2, IndianRupee, QrCode, FileText, CheckCircle2 } from 'lucide-react';
import { Customer, Transaction, ShopSettings } from '../types';
import { formatCurrency, formatTransactionDate, formatTransactionTime, formatTransactionDateTime } from '../utils/speech';
import { useLanguage } from '../context/LanguageContext';

interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  transactions: Transaction[];
  settings: ShopSettings;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  isOpen,
  onClose,
  customer,
  transactions,
  settings
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const printRef = useRef<HTMLDivElement>(null);
  const [printLayout, setPrintLayout] = useState<'standard' | 'thermal'>('standard');

  // Keep body synchronized with modal state and printer paper mode
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('statement-modal-open');
      if (printLayout === 'thermal') {
        document.body.classList.add('thermal-mode');
      } else {
        document.body.classList.remove('thermal-mode');
      }
    } else {
      document.body.classList.remove('statement-modal-open');
      document.body.classList.remove('thermal-mode');
    }

    return () => {
      document.body.classList.remove('statement-modal-open');
      document.body.classList.remove('thermal-mode');
    };
  }, [isOpen, printLayout]);

  if (!isOpen || !customer) return null;

  // Sort chronological for statement
  const sortedTxs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Running balance calculation (excluding soft-deleted/cancelled transactions)
  let running = 0;
  const rows = sortedTxs.map(t => {
    if (!t.is_deleted) {
      if (t.type === 'udhaar') {
        running += t.amount;
      } else {
        running -= t.amount;
      }
    }
    return {
      ...t,
      runningBalance: running
    };
  });

  const netBalance = customer.net_balance ?? (customer.total_udhaar || 0) - (customer.total_jama || 0);

  const handlePrint = () => {
    // Standard native print with isolated CSS portal rendering
    window.print();
  };

  const handleShareWhatsApp = () => {
    const shopName = settings.shop_name || 'दुकान खाता';
    let text = `*खाता विवरण (Account Statement)*\n`;
    text += `🏬 *${shopName}*\n`;
    text += `👤 ग्राहक: ${customer.name}\n`;
    text += `📅 दिनांक: ${new Date().toLocaleDateString('hi-IN')}\n`;
    text += `--------------------------------\n`;

    // Last 5 txs
    const recent = sortedTxs.slice(-5);
    recent.forEach(t => {
      if (t.is_deleted) {
        text += `🚫 ${formatTransactionDateTime(t.date, t.created_at, 'hi')}: [रद्द / काटा गया] ₹${t.amount} (${t.notes || ''})\n`;
      } else {
        const typeLabel = t.type === 'udhaar' ? 'उधार (+)' : 'जमा (-)';
        text += `${formatTransactionDateTime(t.date, t.created_at, 'hi')}: ${typeLabel} ₹${t.amount} (${t.notes || ''})\n`;
      }
    });

    if (sortedTxs.length > 5) {
      text += `... (कुल ${sortedTxs.length} लेनदेन)\n`;
    }

    text += `--------------------------------\n`;
    text += `*कुल बकाया (Net Balance): ₹${netBalance}*\n`;

    if (customer.passbook_token) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      text += `\n📖 *लाइव खाता पासबुक लिंक (पूरा ब्योरा देखें):*\n${origin}/?passbook=${customer.passbook_token}\n`;
    }

    if (netBalance > 0 && settings.upi_id) {
      text += `\n📲 UPI भुगतान लिंक:\nupi://pay?pa=${settings.upi_id}&pn=${encodeURIComponent(shopName)}&am=${netBalance}&cu=INR\n`;
    }

    text += `\nधन्यवाद! 🙏`;

    const encoded = encodeURIComponent(text);
    const phone = customer.phone ? customer.phone.replace(/[^0-9]/g, '') : '';
    const cleanPhone = phone.length === 10 ? `91${phone}` : phone;

    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const modalContent = (
    <div id="statement-slip-portal" className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150 statement-modal-backdrop">
      <div className="w-full max-w-lg md:max-w-xl lg:max-w-2xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto border border-slate-100 dark:border-slate-800 statement-modal-card">
        {/* Dynamic @page media rule */}
        <style>{`
          @media print {
            @page {
              size: ${printLayout === 'thermal' ? '80mm auto' : 'A4 portrait'};
              margin: ${printLayout === 'thermal' ? '2mm 4mm' : '8mm 10mm'};
            }
          }
        `}</style>

        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-teal-800 to-emerald-800 text-white flex items-center justify-between no-print">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-white/10 rounded-xl">
              <FileText className="w-4 h-4 text-teal-200" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm leading-tight">
                {isEn ? 'Statement Slip' : 'खाता पर्ची / स्टेटमेंट'}
              </h3>
              <p className="text-[11px] text-teal-200 font-medium">{customer.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/15 text-white/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Print Layout Selector (no-print) */}
        <div className="px-5 py-2 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between no-print text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
            <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            <span>{isEn ? 'Paper Size:' : 'प्रिंटर साइज:'}</span>
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPrintLayout('standard')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                printLayout === 'standard'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              📄 {isEn ? 'A4 / Full Sheet' : 'A4 / सामान्य रसीद'}
            </button>
            <button
              type="button"
              onClick={() => setPrintLayout('thermal')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                printLayout === 'thermal'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              🧾 {isEn ? 'Thermal POS (80/58mm)' : 'थर्मल रोल पर्ची (POS)'}
            </button>
          </div>
        </div>

        {/* Printable Statement Area */}
        <div
          ref={printRef}
          id="statement-slip-printable-area"
          className={`p-5 overflow-y-auto space-y-4 print:p-0 print:m-0 text-slate-800 ${
            printLayout === 'thermal' ? 'thermal-receipt-mode max-w-sm mx-auto' : ''
          }`}
        >
          {/* Shop & Customer Letterhead */}
          <div className="border-b-2 border-slate-800 pb-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                {settings.logo && (
                  <img
                    src={settings.logo}
                    alt="Shop Logo"
                    className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-2xs shrink-0"
                  />
                )}
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                    {settings.shop_name || 'Mohit Kirana Store'}
                  </h2>
                  {settings.owner_name && (
                    <p className="text-xs text-slate-600 font-medium">
                      {isEn ? 'Proprietor: ' : 'संचालक: '}{settings.owner_name}
                    </p>
                  )}
                  {settings.phone && (
                    <p className="text-xs text-slate-600 font-medium">
                      {isEn ? 'Mob: ' : 'मो: '}{settings.phone}
                    </p>
                  )}
                  {settings.address && (
                    <p className="text-[11px] text-slate-500">{settings.address}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider inline-block">
                  {isEn ? 'Account Slip' : 'खाता पर्ची'}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  {isEn ? 'Date: ' : 'तारीख: '}{new Date().toLocaleDateString(isEn ? 'en-IN' : 'hi-IN')}
                </p>
              </div>
            </div>

            {/* Customer Box */}
            <div className="mt-3 bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 font-medium">{isEn ? 'Customer:' : 'ग्राहक:'}</span>
                <strong className="text-slate-900 dark:text-white ml-1 font-bold text-sm">{customer.name}</strong>
                {customer.phone && <span className="text-slate-600 dark:text-slate-300 ml-2">({customer.phone})</span>}
              </div>
              {customer.address && (
                <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-[150px]">
                  {customer.address}
                </span>
              )}
            </div>
          </div>

          {/* Transactions Table */}
          <div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold text-[11px] uppercase bg-slate-50 dark:bg-slate-800/60">
                  <th className="py-2 px-2">{isEn ? 'Date & Time' : 'दिनांक व समय'}</th>
                  <th className="py-2 px-2">{isEn ? 'Particulars' : 'विवरण'}</th>
                  <th className="py-2 px-2 text-right text-rose-700 dark:text-rose-400">{isEn ? 'Debit (+)' : 'उधार (+)'}</th>
                  <th className="py-2 px-2 text-right text-emerald-700 dark:text-emerald-400">{isEn ? 'Credit (-)' : 'जमा (-)'}</th>
                  <th className="py-2 px-2 text-right">{isEn ? 'Balance (₹)' : 'बाकी (₹)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                      {isEn ? 'No transactions found' : 'कोई लेनदेन नहीं मिला'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => {
                    const isDeleted = Boolean(r.is_deleted);
                    return (
                      <tr key={r.id || i} className={isDeleted ? 'bg-rose-50/50 text-slate-400' : 'hover:bg-slate-50/80'}>
                        <td className="py-2 px-2 text-[11px] whitespace-nowrap">
                          <div className={`font-semibold ${isDeleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {formatTransactionDate(r.date, r.created_at, isEn ? 'en' : 'hi')}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {formatTransactionTime(r.created_at, r.date, isEn ? 'en' : 'hi')}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-[11px] font-medium">
                          <span className={isDeleted ? 'line-through text-slate-400' : 'text-slate-800'}>
                            {r.notes || '-'}
                          </span>
                          {isDeleted && (
                            <span className="text-[9px] font-black text-rose-700 bg-rose-100 border border-rose-300 px-1 py-0.2 rounded ml-1 whitespace-nowrap">
                              🚫 {isEn ? 'Cut / Cancelled' : 'रद्द / काटा गया'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-rose-700">
                          {r.type === 'udhaar' ? (
                            isDeleted ? (
                              <span className="line-through decoration-rose-600 decoration-1 text-slate-400">₹{r.amount}</span>
                            ) : (
                              `₹${r.amount}`
                            )
                          ) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-emerald-700">
                          {r.type === 'jama' ? (
                            isDeleted ? (
                              <span className="line-through decoration-emerald-600 decoration-1 text-slate-400">₹{r.amount}</span>
                            ) : (
                              `₹${r.amount}`
                            )
                          ) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-black text-slate-900">
                          ₹{r.runningBalance}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Summary Box */}
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>{isEn ? 'Total Udhaar (Debit):' : 'कुल उधार (Total Udhaar):'}</span>
              <strong className="text-rose-700 dark:text-rose-400 font-bold">₹{customer.total_udhaar || 0}</strong>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>{isEn ? 'Total Jama (Credit):' : 'कुल जमा (Total Jama):'}</span>
              <strong className="text-emerald-700 dark:text-emerald-400 font-bold">₹{customer.total_jama || 0}</strong>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white border-t border-slate-300 dark:border-slate-700 pt-2 mt-1">
              <span>{isEn ? 'Net Due Balance:' : 'कुल बाकी रकम (Net Due Balance):'}</span>
              <span className={netBalance > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>
                ₹{netBalance}
              </span>
            </div>
          </div>

          {/* Payment QR / Footer note */}
          {settings.upi_id && netBalance > 0 && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-center space-y-1">
              <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                {isEn ? 'Online UPI ID: ' : 'ऑनलाइन भुगतान के लिए UPI ID: '}<strong className="underline">{settings.upi_id}</strong>
              </p>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                {isEn ? 'Pay via PhonePe, Google Pay, Paytm or any UPI App' : 'PhonePe, Google Pay, Paytm या किसी भी UPI ऐप से स्कैन करके भुगतान करें'}
              </p>
            </div>
          )}

          <div className="text-center text-[10px] text-slate-400 pt-1">
            {isEn ? 'Computerized Digital Slip • Generated by Dukaan Khaata App' : 'कंप्यूटरीकृत डिजिटल पर्ची • Dukaan Khaata App द्वारा जनरेट की गई'}
          </div>
        </div>

        {/* Action Buttons (Excluded from print) */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex gap-2 no-print">
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>{isEn ? '🖨️ Print / PDF' : '🖨️ प्रिंट / PDF'}</span>
          </button>

          <button
            onClick={handleShareWhatsApp}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <Share2 className="w-4 h-4" />
            <span>{isEn ? '📲 Send WhatsApp' : '📲 WhatsApp पर भेजें'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-white dark:hover:bg-slate-700 transition-all"
          >
            {isEn ? 'Close' : 'बंद करें'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
