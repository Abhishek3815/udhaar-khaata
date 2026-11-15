import React, { useState, useEffect } from 'react';
import { Store, Phone, MapPin, IndianRupee, QrCode, CheckCircle2, AlertCircle, FileText, Download, Printer, ShieldCheck, ArrowUpRight, ArrowDownLeft, Calendar, Image as ImageIcon, ExternalLink, MessageCircle, Lock, RefreshCw, X } from 'lucide-react';
import { formatCurrency, formatTransactionDate, formatTransactionTime } from '../utils/speech';

interface CustomerPassbookViewProps {
  token: string;
}

interface PassbookData {
  shop: {
    shop_name: string;
    owner_name: string;
    phone: string;
    address: string;
    upi_id: string;
    logo: string | null;
  };
  customer: {
    id: number;
    name: string;
    phone: string;
    address: string;
    due_date?: string;
    credit_limit?: number;
    total_udhaar: number;
    total_jama: number;
    net_balance: number;
  };
  transactions: Array<{
    id: number;
    type: 'udhaar' | 'jama';
    amount: number;
    notes: string;
    bill_image?: string | null;
    date: string;
    is_deleted?: boolean;
    deleted_reason?: string;
    created_at?: string;
    running_balance: number;
  }>;
}

export const CustomerPassbookView: React.FC<CustomerPassbookViewProps> = ({ token }) => {
  const [data, setData] = useState<PassbookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'udhaar' | 'jama'>('all');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    fetchPassbook();
  }, [token]);

  const fetchPassbook = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/passbook?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error || 'अमान्य पासबुक लिंक (Invalid or expired passbook link)');
      }
    } catch (err: any) {
      setError('सर्वर से संपर्क नहीं हो सका: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">आपकी खाता पासबुक लोड हो रही है...</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">कृपया प्रतीक्षा करें</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6 text-center border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="w-14 h-14 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto text-2xl">
            🔒
          </div>
          <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">पासबुक नहीं खुली</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {error || 'यह लिंक गलत या एक्सपायर हो चुका है। कृपया सही पासबुक लिंक के लिए दुकानदार से संपर्क करें।'}
          </p>
          <div className="pt-2">
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
            >
              मुख्य पेज पर जाएं
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { shop, customer, transactions } = data;
  const isDue = customer.net_balance > 0;
  const isCleared = customer.net_balance === 0;
  const isAdvance = customer.net_balance < 0;

  const filteredTxs = transactions.filter(t => {
    if (filterType === 'all') return true;
    return t.type === filterType;
  });

  const upiPayUrl = shop.upi_id && isDue
    ? `upi://pay?pa=${shop.upi_id}&pn=${encodeURIComponent(shop.shop_name)}&am=${customer.net_balance}&cu=INR`
    : '';

  const whatsappCallUrl = shop.phone
    ? `https://wa.me/91${shop.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`नमस्ते ${shop.shop_name}, मैं ${customer.name} बोल रहा हूँ। मुझे अपने खाते के बारे में जानकारी चाहिए।`)}`
    : '';

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans flex justify-center py-0 sm:py-6 selection:bg-teal-200">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 sm:rounded-3xl shadow-2xl flex flex-col min-h-screen sm:min-h-0 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        
        {/* Top Confidential Banner */}
        <div className="bg-slate-900 text-slate-300 px-4 py-1.5 text-[11px] flex items-center justify-between no-print">
          <span className="flex items-center gap-1.5 font-medium">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>व्यक्तिगत डिजिटल पासबुक (Confidential)</span>
          </span>
          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-700/50">
            ✓ सत्यापित खाता
          </span>
        </div>

        {/* Shop Header */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 text-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {shop.logo ? (
                <img
                  src={shop.logo}
                  alt={shop.shop_name}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-white/80 shadow-md shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/30 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
                  {shop.shop_name.slice(0, 1)}
                </div>
              )}
              <div>
                <h1 className="text-xl font-black tracking-tight leading-tight drop-shadow-xs">
                  {shop.shop_name}
                </h1>
                {shop.owner_name && (
                  <p className="text-xs text-teal-100 font-medium mt-0.5">
                    संचालक: {shop.owner_name}
                  </p>
                )}
                {shop.phone && (
                  <p className="text-xs text-teal-100/90 flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" />
                    <span>{shop.phone}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="text-right no-print">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all active:scale-95"
                title="प्रिंट या PDF डाउनलोड करें"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF / प्रिंट</span>
              </button>
            </div>
          </div>

          {shop.address && (
            <p className="text-[11px] text-teal-100/80 flex items-center gap-1 mt-3 pt-2 border-t border-teal-600/40">
              <MapPin className="w-3 h-3 shrink-0" />
              <span>{shop.address}</span>
            </p>
          )}
        </div>

        {/* Customer Info Card */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ग्राहक खाता (Account Holder)</p>
            <h2 className="text-base font-black text-slate-900 dark:text-white mt-0.5">{customer.name}</h2>
            {customer.phone && (
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">मो: {customer.phone}</p>
            )}
          </div>
          <div className="text-right text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <p>पासबुक दिनांक</p>
            <p className="font-bold text-slate-800 dark:text-slate-200">{new Date().toLocaleDateString('hi-IN')}</p>
          </div>
        </div>

        {/* Balance Showcase Card */}
        <div className="p-4 sm:p-5 space-y-3">
          <div className={`p-4 rounded-3xl border shadow-sm transition-all ${
            isDue
              ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-100'
              : isCleared
              ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100'
              : 'bg-teal-50/70 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800 text-teal-950 dark:text-teal-100'
          }`}>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span>
                {isDue ? '🔴 कुल बाकी रकम (Net Due Balance)' : isCleared ? '🟢 हिसाब स्थिति' : '🔵 जमा शेष (Advance)'}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                isDue ? 'bg-rose-600 text-white' : isCleared ? 'bg-emerald-600 text-white' : 'bg-teal-700 text-white'
              }`}>
                {isDue ? 'उधार बाकी' : isCleared ? 'हिसाब चुकता ✓' : 'एडवांस जमा'}
              </span>
            </div>

            <div className="flex items-baseline gap-1 my-1">
              <span className="text-3xl sm:text-4xl font-black tracking-tight">
                ₹{Math.abs(customer.net_balance)}
              </span>
              {isCleared && <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 ml-1">कोई बाकी नहीं</span>}
            </div>

            {customer.due_date && isDue && (
              <div className="mt-2 text-xs font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5 pt-2 border-t border-rose-200/80 dark:border-rose-800/80">
                <Calendar className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>कृपया <strong>{customer.due_date}</strong> तक भुगतान करें।</span>
              </div>
            )}

            {/* Instant UPI Pay Button */}
            {isDue && upiPayUrl && (
              <div className="pt-3 mt-2 border-t border-rose-200/80 dark:border-rose-800/80 no-print">
                <a
                  href={upiPayUrl}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/25 active:scale-98 transition-all"
                >
                  <QrCode className="w-4 h-4" />
                  <span>PhonePe / GPay / Paytm से ₹{customer.net_balance} अभी पे करें →</span>
                </a>
                <p className="text-center text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
                  UPI ID: <strong>{shop.upi_id}</strong>
                </p>
              </div>
            )}
          </div>

          {/* Quick Metrics (Total Udhaar vs Jama) */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">कुल उधार सामान (+)</p>
                <p className="text-base font-black text-rose-700 dark:text-rose-400 mt-0.5">₹{customer.total_udhaar}</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">कुल जमा भुगतान (-)</p>
                <p className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5">₹{customer.total_jama}</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center justify-between pt-2">
            <h3 className="font-black text-xs text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>लेन-देन इतिहास ({transactions.length})</span>
            </h3>

            <div className="flex gap-1 text-[11px] font-bold no-print">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg transition-all font-bold ${
                  filterType === 'all'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                सभी
              </button>
              <button
                type="button"
                onClick={() => setFilterType('udhaar')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterType === 'udhaar'
                    ? 'bg-rose-700 text-white'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40'
                }`}
              >
                उधार (+)
              </button>
              <button
                type="button"
                onClick={() => setFilterType('jama')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterType === 'jama'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                }`}
              >
                जमा (-)
              </button>
            </div>
          </div>

          {/* Transactions List */}
          <div className="space-y-2.5">
            {filteredTxs.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                कोई लेन-देन रिकॉर्ड नहीं मिला
              </div>
            ) : (
              filteredTxs.map((t) => {
                const isUdhaar = t.type === 'udhaar';
                const isDeleted = Boolean(t.is_deleted);

                return (
                  <div
                    key={t.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-start justify-between relative ${
                      isDeleted
                        ? 'bg-slate-100/80 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700 opacity-60'
                        : isUdhaar
                        ? 'bg-white dark:bg-slate-800/90 border-rose-200/90 dark:border-rose-900/60 hover:border-rose-300 shadow-2xs'
                        : 'bg-white dark:bg-slate-800/90 border-emerald-200/90 dark:border-emerald-900/60 hover:border-emerald-300 shadow-2xs'
                    }`}
                  >
                    {isDeleted && (
                      <span className="absolute top-0 right-0 bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-lg">
                        🚫 काटा गया (Cancelled)
                      </span>
                    )}

                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isUdhaar ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {isUdhaar ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                      </div>

                      <div>
                        <p className={`font-bold text-xs ${isDeleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                          {t.notes || (isUdhaar ? 'उधार सामान' : 'जमा भुगतान')}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {formatTransactionDate(t.date, t.created_at, 'hi')} • {formatTransactionTime(t.created_at, t.date, 'hi')}
                        </p>

                        {/* Bill Image View Link */}
                        {t.bill_image && !isDeleted && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(t.bill_image || null)}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:text-teal-900 dark:hover:text-teal-100 bg-teal-50 dark:bg-teal-950/50 px-2 py-0.5 rounded-md border border-teal-200 dark:border-teal-800 no-print"
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span>📸 बिल की फोटो देखें</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className={`text-base font-black ${
                        isDeleted ? 'line-through text-slate-400 dark:text-slate-500' : isUdhaar ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                      }`}>
                        {isUdhaar ? `+ ₹${t.amount}` : `- ₹${t.amount}`}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                        बाकी: ₹{t.running_balance}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-auto p-4 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 text-center space-y-3 no-print">
          <div className="flex gap-2">
            {shop.phone && (
              <a
                href={`tel:${shop.phone}`}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Phone className="w-3.5 h-3.5 text-teal-300" />
                <span>दुकानदार को कॉल करें</span>
              </a>
            )}

            {whatsappCallUrl && (
              <a
                href={whatsappCallUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5 text-white" />
                <span>WhatsApp मैसेज</span>
              </a>
            )}
          </div>

          <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>कंप्यूटरीकृत डिजिटल पासबुक • {shop.shop_name} • Dukaan Khaata App</span>
          </div>
        </div>

      </div>

      {/* Bill Photo Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="relative max-w-lg md:max-w-2xl lg:max-w-3xl w-full bg-slate-900 rounded-2xl sm:rounded-3xl overflow-hidden p-3 sm:p-4 text-white border border-slate-800 my-auto flex flex-col max-h-[92dvh]">
            <div className="flex justify-between items-center px-2 py-1.5 border-b border-slate-800 mb-3 shrink-0">
              <span className="text-xs sm:text-sm font-bold">📸 बिल की मूल फोटो (Original Receipt)</span>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center">
              <img
                src={previewImage}
                alt="Bill Receipt"
                className="max-h-[78vh] w-auto max-w-full object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
