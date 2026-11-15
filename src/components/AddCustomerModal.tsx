import React, { useState } from 'react';
import { X, UserPlus, Phone, MapPin, Check, AlertTriangle, Sparkles, Calendar, Clock } from 'lucide-react';
import { Customer } from '../types';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCustomer: (customer: { name: string; phone?: string; address?: string; credit_period_days?: number; due_date?: string }) => Promise<Customer | null>;
  existingCustomers?: Customer[];
  lang?: 'hi' | 'en';
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({
  isOpen,
  onClose,
  onAddCustomer,
  existingCustomers,
  lang = 'hi'
}) => {
  const isEn = lang === 'en';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditPeriodDays, setCreditPeriodDays] = useState<number>(15);
  const [customDays, setCustomDays] = useState<string>('15');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Check if someone with same name already exists
  const cleanName = name.trim();
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  const matchedNameDuplicate = existingCustomers?.find(
    c => c.name.trim().toLowerCase() === cleanName.toLowerCase() && cleanName.length > 1
  );

  const matchedPhoneDuplicate = cleanPhone.length >= 10
    ? existingCustomers?.find(c => (c.phone || '').replace(/[^0-9]/g, '') === cleanPhone)
    : null;

  const appendAlias = (alias: string) => {
    const clean = name.replace(/\s*\([^)]*\)/g, '').trim();
    setName(`${clean} (${alias})`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!cleanName) {
      setError(isEn ? 'Please enter customer name' : 'कृपया ग्राहक का नाम लिखें');
      return;
    }

    if (matchedPhoneDuplicate) {
      setError(
        isEn
          ? `Customer with mobile ${cleanPhone} already exists: "${matchedPhoneDuplicate.name}"`
          : `इस मोबाइल नंबर (${cleanPhone}) का खाता पहले से मौजूद है: "${matchedPhoneDuplicate.name}"`
      );
      return;
    }

    if (matchedNameDuplicate) {
      setError(
        isEn
          ? `Customer "${cleanName}" already exists! Please add an alias like "${cleanName} (Market)"`
          : `"${cleanName}" नाम का खाता पहले से मौजूद है! कृपया नाम के आगे उपनाम या पता जोड़ें (उदा. ${cleanName} (मास्टर जी))`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const days = parseInt(customDays, 10) || creditPeriodDays || 15;
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const calculatedDueDate = targetDate.toISOString().split('T')[0];

      const res = await onAddCustomer({
        name: cleanName,
        phone: cleanPhone,
        address: address.trim(),
        credit_period_days: days,
        due_date: calculatedDueDate
      });
      if (res) {
        setName('');
        setPhone('');
        setAddress('');
        setCreditPeriodDays(15);
        setCustomDays('15');
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'ग्राहक जोड़ने में समस्या आई');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto animate-in zoom-in-95 duration-150 border border-slate-100 dark:border-slate-800">
        {/* Pinned Header */}
        <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 bg-white/10 rounded-xl shrink-0">
              <UserPlus className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base leading-tight truncate">
                {isEn ? 'Add New Customer Account' : 'नया ग्राहक जोड़ें'}
              </h3>
              <p className="text-xs text-emerald-200/90 font-medium truncate">
                {isEn ? 'Open digital khata ledger account' : 'डिजिटल बहीखाता खाता खोलें'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
            {error && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold">
                {error}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isEn ? 'Customer Name *' : 'ग्राहक का नाम (Customer Name) *'}
                </label>
                <span className="text-[10px] text-slate-400">
                  {isEn ? 'Full name or shop alias' : 'पूरा नाम या पहचान'}
                </span>
              </div>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder={isEn ? 'e.g. Ramesh Kumar' : 'उदा: रमेश (मास्टर जी), सुरेश...'}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />

              {/* Duplicate Name Helper */}
              {matchedNameDuplicate && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      {isEn ? `Customer "${name}" already exists!` : `"${name}" नाम का खाता पहले से मौजूद है!`}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {isEn ? 'Add an alias tag to prevent confusion:' : 'पहचान के लिए उपनाम जोड़ें:'}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['मास्टर जी', 'वार्ड 2', 'टेलर', 'ड्राइवर', 'दुकानदार', 'बड़ा', 'छोटा'].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => appendAlias(tag)}
                        className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[11px] font-bold hover:bg-amber-100"
                      >
                        + ({tag})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Mobile Phone (WhatsApp)' : 'मोबाइल नंबर (WhatsApp तगादा हेतु)'}
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/[^0-9]/g, ''));
                      setError(null);
                    }}
                    placeholder="9876543210"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                {matchedPhoneDuplicate && (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>इस नंबर से "{matchedPhoneDuplicate.name}" पहले से मौजूद है!</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Address / Colony / Village' : 'पता / मोहल्ला / गांव'}
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={isEn ? 'e.g. Market Road, Ward 4' : 'उदा: मेन मार्केट, वार्ड नं 4...'}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Credit Period / Udhaar Due Days Rule */}
            <div className="p-3.5 bg-amber-500/10 dark:bg-slate-800/80 border border-amber-400/30 dark:border-amber-500/20 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>{isEn ? 'Udhaar Due Period (Days):' : 'उधार चुकाने की मियाद (Payment Terms):'}</span>
                </span>
                <span className="text-xs font-black text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-300/60 dark:border-amber-700/60">
                  {customDays} {isEn ? 'Days' : 'दिन बाद तगादा'}
                </span>
              </div>

              <p className="text-[10px] text-slate-600 dark:text-slate-400">
                {isEn
                  ? 'When days are completed, reminders will be triggered for both shopkeeper and customer.'
                  : 'दिन पूरे होने पर दुकानदार को अलर्ट और ग्राहक को सीधे ऑटो-तगादा (Reminder) जाएगा।'}
              </p>

              <div className="flex items-center gap-1.5 pt-1">
                {[
                  { label: isEn ? '7 Days' : '7 दिन', val: 7 },
                  { label: isEn ? '15 Days' : '15 दिन', val: 15 },
                  { label: isEn ? '30 Days' : '1 महीना (30 दिन)', val: 30 }
                ].map(p => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => {
                      setCreditPeriodDays(p.val);
                      setCustomDays(String(p.val));
                    }}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      parseInt(customDays, 10) === p.val
                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs font-black'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 shrink-0">
                  {isEn ? 'Or Custom Days:' : 'या अपनी पसंद के दिन:'}
                </span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  className="w-20 px-2.5 py-1 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg text-xs font-extrabold text-slate-800 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="10"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{isEn ? 'days' : 'दिन'}</span>
              </div>
            </div>
          </div>

          {/* Pinned Action Buttons Footer */}
          <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              {isEn ? 'Cancel' : 'रद्द करें'}
            </button>
            <button
              type="submit"
              disabled={submitting || !cleanName || Boolean(matchedPhoneDuplicate) || Boolean(matchedNameDuplicate)}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold shadow-sm shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all active:scale-98"
            >
              <Check className="w-4 h-4" />
              <span>{submitting ? (isEn ? 'Adding...' : 'जोड़ा जा रहा है...') : (isEn ? 'Open Account' : 'खाता खोलें')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
