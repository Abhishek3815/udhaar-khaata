import React, { useState } from 'react';
import { X, MessageCircle, CheckCircle2, Phone } from 'lucide-react';
import { Customer, ShopSettings } from '../types';
import { formatCurrency, generateWhatsAppReminder } from '../utils/speech';
import { useLanguage } from '../context/LanguageContext';

interface BulkReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  settings: ShopSettings;
}

export const BulkReminderModal: React.FC<BulkReminderModalProps> = ({
  isOpen,
  onClose,
  customers,
  settings
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [sentMap, setSentMap] = useState<Record<number, boolean>>({});

  if (!isOpen) return null;

  // Filter customers with pending udhaar (> 0) and phone number
  const debtors = customers
    .filter(c => (c.net_balance || 0) > 0)
    .sort((a, b) => (b.net_balance || 0) - (a.net_balance || 0));

  const totalDue = debtors.reduce((sum, c) => sum + (c.net_balance || 0), 0);

  const handleSendReminder = (customer: Customer) => {
    if (!customer.phone) {
      alert(isEn ? `Customer ${customer.name} has no phone number registered.` : `ग्राहक ${customer.name} का मोबाइल नंबर दर्ज नहीं है।`);
      return;
    }
    const balance = customer.net_balance || 0;
    const daysOverdue = customer.due_date ? Math.ceil((new Date().getTime() - new Date(customer.due_date).getTime()) / (1000 * 3600 * 24)) : undefined;
    const url = generateWhatsAppReminder(customer.name, balance, settings.shop_name, customer.phone, settings.upi_id, customer.due_date, daysOverdue);
    window.open(url, '_blank');
    setSentMap(prev => ({ ...prev, [customer.id]: true }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-lg md:max-w-xl lg:max-w-2xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden border border-slate-100 dark:border-slate-800 my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-700 to-amber-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-2xl">
              <MessageCircle className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                {isEn ? 'WhatsApp Payment Reminders' : 'बकायेदारों को WhatsApp तगादा'}
              </h3>
              <p className="text-xs text-rose-100/90 font-medium">
                {isEn
                  ? `${debtors.length} debtors with total ${formatCurrency(totalDue)} pending`
                  : `${debtors.length} ग्राहकों से कुल ${formatCurrency(totalDue)} लेना बाकी है`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Debtors List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100 dark:divide-slate-800 overscroll-contain">
          {debtors.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {isEn ? 'Awesome! No pending credit.' : 'बधाई! कोई उधारी बाकी नहीं है।'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEn ? 'All customer accounts are clear and settled.' : 'सभी ग्राहकों का हिसाब चुकता है।'}
              </p>
            </div>
          ) : (
            debtors.map(c => {
              const balance = c.net_balance || 0;
              const isSent = Boolean(sentMap[c.id]);

              return (
                <div key={c.id} className="pt-2.5 first:pt-0 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">{c.name}</h4>
                      {c.due_date && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold shrink-0 border ${
                          c.due_date <= new Date().toISOString().split('T')[0]
                            ? 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold animate-pulse dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                            : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                        }`}>
                          {c.due_date <= new Date().toISOString().split('T')[0]
                            ? (isEn ? '⚠️ OVERDUE: ' : '⚠️ समय पूरा: ')
                            : (isEn ? 'Due: ' : 'वादा: ')}
                          {c.due_date}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {c.phone ? (
                        <span className="flex items-center gap-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{c.phone}</span>
                        </span>
                      ) : (
                        <span className="text-rose-500 dark:text-rose-400 font-medium text-[10px]">
                          {isEn ? 'No Phone' : 'नंबर नहीं है'}
                        </span>
                      )}
                      <span>•</span>
                      <strong className="text-rose-700 dark:text-rose-400 font-extrabold text-xs">
                        ₹{balance}
                      </strong>
                    </div>
                  </div>

                  {/* Send Action */}
                  <div className="shrink-0">
                    {c.phone ? (
                      <button
                        onClick={() => handleSendReminder(c)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all ${
                          isSent
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{isSent ? (isEn ? 'Resend' : 'दोबारा भेजें') : (isEn ? 'Send Reminder' : 'तगादा भेजें')}</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">
                        {isEn ? 'Add Phone' : 'नंबर जोड़ें'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs shrink-0">
          <span className="text-slate-500 dark:text-slate-400 font-medium">
            {isEn
              ? `${Object.keys(sentMap).length} / ${debtors.length} reminders sent`
              : `${Object.keys(sentMap).length} / ${debtors.length} को तगादा भेजा गया`}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl active:scale-95 transition-all shadow-sm"
          >
            {isEn ? 'Done' : 'पूर्ण हुआ'}
          </button>
        </div>
      </div>
    </div>
  );
};
