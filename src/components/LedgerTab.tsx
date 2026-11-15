import React, { useState, useMemo } from 'react';
import {
  Search,
  UserPlus,
  Phone,
  MapPin,
  ArrowDownLeft,
  ArrowUpRight,
  MessageCircle,
  ChevronRight,
  UserCheck,
  AlertTriangle,
  QrCode,
  Calendar,
  Clock,
  Printer,
  TrendingDown,
  TrendingUp,
  X,
  Users,
  CheckCircle2,
  PhoneCall,
  Edit3
} from 'lucide-react';
import { Customer, ShopSettings } from '../types';
import { formatCurrency, generateWhatsAppReminder } from '../utils/speech';
import { UpiQrModal } from './UpiQrModal';
import { BulkReminderModal } from './BulkReminderModal';

interface LedgerTabProps {
  customers: Customer[];
  settings: ShopSettings;
  onSelectCustomer: (customer: Customer) => void;
  onOpenAddCustomer: () => void;
  onOpenQuickTx: (customer: Customer, type: 'udhaar' | 'jama') => void;
  onEditCustomer?: (customer: Customer) => void;
  lang?: 'hi' | 'en';
}

export const LedgerTab: React.FC<LedgerTabProps> = ({
  customers,
  settings,
  onSelectCustomer,
  onOpenAddCustomer,
  onOpenQuickTx,
  onEditCustomer,
  lang = 'hi'
}) => {
  const isEn = lang === 'en';
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'udhaar' | 'settled' | 'due'>('all');
  const [qrCustomer, setQrCustomer] = useState<Customer | null>(null);
  const [isBulkReminderOpen, setIsBulkReminderOpen] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Stats calculation
  const totalUdhaar = useMemo(() => {
    return customers.reduce(
      (sum, c) => sum + (c.net_balance && c.net_balance > 0 ? c.net_balance : 0),
      0
    );
  }, [customers]);

  const totalJamaAdvance = useMemo(() => {
    return customers.reduce(
      (sum, c) => sum + (c.net_balance && c.net_balance < 0 ? Math.abs(c.net_balance) : 0),
      0
    );
  }, [customers]);

  const pendingUdhaarCount = useMemo(() => {
    return customers.filter(c => (c.net_balance || 0) > 0).length;
  }, [customers]);

  const settledCount = useMemo(() => {
    return customers.filter(c => (c.net_balance || 0) <= 0).length;
  }, [customers]);

  const dueCustomersCount = useMemo(() => {
    return customers.filter(
      c => (c.net_balance || 0) > 0 && c.due_date && c.due_date <= todayStr
    ).length;
  }, [customers, todayStr]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        (c.address && c.address.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (filterType === 'due') {
        return (c.net_balance || 0) > 0 && Boolean(c.due_date && c.due_date <= todayStr);
      }
      if (filterType === 'udhaar') return (c.net_balance || 0) > 0;
      if (filterType === 'settled') return (c.net_balance || 0) <= 0;
      return true;
    });
  }, [customers, searchQuery, filterType, todayStr]);

  return (
    <>
      <div className="space-y-4 pb-24 lg:pb-12 no-print max-w-7xl mx-auto px-3 sm:px-6 py-4">
        {/* --- 1. MODERN FINTECH SUMMARY METRICS CARDS --- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Market Udhaar (Due) */}
          <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-rose-500 via-rose-600 to-red-700 text-white shadow-md shadow-rose-500/20 fintech-metric-card">
            <div className="flex items-center justify-between text-rose-100 text-xs font-semibold mb-1.5">
              <span>{isEn ? 'Market Udhaar (Due)' : 'बाजार बाकी (उधार)'}</span>
              <div className="p-1 rounded-lg bg-white/20 backdrop-blur-xs">
                <TrendingDown className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-black tracking-tight">
              {formatCurrency(totalUdhaar)}
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] sm:text-[11px] font-bold text-white">
                {pendingUdhaarCount} {isEn ? 'to collect' : 'ग्राहकों से लेना है'}
              </span>
            </div>
          </div>

          {/* Card 2: Advance / Settled */}
          <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 text-white shadow-md shadow-emerald-500/20 fintech-metric-card">
            <div className="flex items-center justify-between text-emerald-100 text-xs font-semibold mb-1.5">
              <span>{isEn ? 'Advance / Settled' : 'एडवांस / चुकता'}</span>
              <div className="p-1 rounded-lg bg-white/20 backdrop-blur-xs">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-black tracking-tight">
              {formatCurrency(totalJamaAdvance)}
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] sm:text-[11px] font-bold text-white">
                {settledCount} {isEn ? 'accounts settled' : 'खाते चुकता / एडवांस'}
              </span>
            </div>
          </div>

          {/* Card 3: Today's Due Reminder Alert */}
          <div
            onClick={() => setFilterType(prev => (prev === 'due' ? 'all' : 'due'))}
            className={`cursor-pointer p-4 rounded-2xl border transition-all ${
              dueCustomersCount > 0
                ? 'bg-amber-500/10 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700/60 hover:bg-amber-500/20'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className={dueCustomersCount > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-slate-500'}>
                {isEn ? "Today's Payment Due" : 'आज के तगादे'}
              </span>
              <div className={`p-1 rounded-lg ${dueCustomersCount > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className={`text-xl sm:text-2xl font-black tracking-tight ${dueCustomersCount > 0 ? 'text-amber-900 dark:text-amber-200' : 'text-slate-800 dark:text-slate-200'}`}>
              {dueCustomersCount} {isEn ? 'Customers' : 'ग्राहक'}
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
              {dueCustomersCount > 0
                ? (isEn ? 'Click to filter due accounts' : 'क्लिक करके तुरंत लिस्ट देखें')
                : (isEn ? 'No overdue payments today' : 'आज किसी का वादा नहीं है')}
            </p>
          </div>

          {/* Card 4: Total Customers Count */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">
              <span>{isEn ? 'Total Customers' : 'कुल सक्रिय खाते'}</span>
              <div className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {customers.length}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                100% {isEn ? 'Cloud Ready' : 'सुरक्षित'}
              </span>
              <button
                onClick={onOpenAddCustomer}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-extrabold hover:underline flex items-center gap-0.5"
              >
                <span>+ {isEn ? 'Add' : 'नया'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* --- 2. SEARCH, ACTION & FILTER TOOLBAR --- */}
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isEn ? 'Search by name, phone or address...' : 'ग्राहक का नाम, मोबाइल या पता खोजें...'}
                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Action Toolbar Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {/* Print Ledger Report */}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
                title={isEn ? 'Print customer ledger statement' : 'बकाया खाता रिपोर्ट प्रिंट करें'}
              >
                <Printer className="w-4 h-4 text-slate-500" />
                <span className="hidden sm:inline">{isEn ? 'Print Statement' : 'प्रिंट खाता'}</span>
                <span className="sm:hidden">{isEn ? 'Print' : 'प्रिंट'}</span>
              </button>

              {/* Bulk WhatsApp Reminder */}
              <button
                onClick={() => setIsBulkReminderOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs font-bold shadow-2xs active:scale-95 transition-all shrink-0"
                title={isEn ? 'Send bulk WhatsApp reminders' : 'सभी बकायेदारों को WhatsApp तगादा भेजें'}
              >
                <MessageCircle className="w-4 h-4 text-rose-600" />
                <span>{isEn ? 'Remind All' : 'तगादा लिस्ट'}</span>
                {pendingUdhaarCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-rose-600 text-white text-[10px] font-black">
                    {pendingUdhaarCount}
                  </span>
                )}
              </button>

              {/* Add New Customer */}
              <button
                onClick={onOpenAddCustomer}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm shadow-emerald-600/30 active:scale-95 transition-all shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isEn ? 'New Customer' : '+ नया ग्राहक'}</span>
              </button>
            </div>
          </div>

          {/* Segmented Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterType === 'all'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-black'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {isEn ? 'All' : 'सभी ग्राहक'} ({customers.length})
            </button>

            {/* Overdue Alert Filter */}
            {dueCustomersCount > 0 && (
              <button
                onClick={() => setFilterType('due')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap flex items-center gap-1.5 transition-all ${
                  filterType === 'due'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>{isEn ? 'Due Today' : 'आज के तगादे'} ({dueCustomersCount})</span>
              </button>
            )}

            <button
              onClick={() => setFilterType('udhaar')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterType === 'udhaar'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300'
              }`}
            >
              {isEn ? 'Pending Udhaar' : '🔴 सिर्फ बाकी (उधार)'} ({pendingUdhaarCount})
            </button>

            <button
              onClick={() => setFilterType('settled')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterType === 'settled'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}
            >
              {isEn ? 'Settled Accounts' : '🟢 चुकता / एडवांस'} ({settledCount})
            </button>
          </div>
        </div>

        {/* --- 3. CUSTOMER CARDS RESPONSIVE GRID (1 col mobile, 2 col tablet, 3 col desktop) --- */}
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto shadow-inner">
              <UserCheck className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
              {isEn ? 'No customer found' : 'कोई खाता नहीं मिला'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? (isEn ? `No account matches "${searchQuery}". Check spelling or create new.` : `"${searchQuery}" नाम या मोबाइल नंबर से कोई खाता दर्ज नहीं है।`)
                : (isEn ? 'No customers under this filter.' : 'इस फ़िल्टर में कोई ग्राहक उपलब्ध नहीं है।')}
            </p>
            <button
              onClick={onOpenAddCustomer}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isEn ? 'Add New Customer' : 'नया ग्राहक खाता जोड़ें'}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredCustomers.map(customer => {
              const balance = customer.net_balance || 0;
              const isPendingUdhaar = balance > 0;
              const isAdvance = balance < 0;

              return (
                <div
                  key={customer.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all flex flex-col justify-between group"
                >
                  {/* Top Customer Info & Balance */}
                  <div
                    onClick={() => onSelectCustomer(customer)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start space-x-3 min-w-0">
                        {/* Avatar */}
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base shadow-xs shrink-0 text-white ${
                            isPendingUdhaar
                              ? 'bg-gradient-to-tr from-rose-600 to-amber-500'
                              : isAdvance
                              ? 'bg-gradient-to-tr from-emerald-600 to-teal-500'
                              : 'bg-gradient-to-tr from-slate-600 to-slate-500'
                          }`}
                        >
                          {customer.name.slice(0, 1).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                            {customer.name}
                          </h4>

                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {customer.phone ? (
                              <span className="flex items-center gap-1 font-mono">
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{customer.phone}</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                {isEn ? 'No phone' : 'नंबर नहीं है'}
                              </span>
                            )}
                          </div>

                          {customer.address && (
                            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{customer.address}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Balance Box */}
                      <div className="text-right shrink-0">
                        <div
                          className={`text-base font-black tracking-tight ${
                            isPendingUdhaar
                              ? 'text-rose-600 dark:text-rose-400'
                              : isAdvance
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {formatCurrency(Math.abs(balance))}
                        </div>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                            isPendingUdhaar
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                              : isAdvance
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {isPendingUdhaar
                            ? (isEn ? 'To Collect' : 'बाकी लेना है')
                            : isAdvance
                            ? (isEn ? 'Advance' : 'एडवांस जमा')
                            : (isEn ? 'Settled' : 'हिसाब चुकता')}
                        </span>
                      </div>
                    </div>

                    {/* Due Date & Limit Alert Pill */}
                    {(customer.due_date || (customer.credit_limit && balance > customer.credit_limit)) && (
                      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                        {customer.due_date && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1 ${
                              customer.due_date <= todayStr
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>
                              {customer.due_date <= todayStr
                                ? (isEn ? '⚠️ OVERDUE:' : '⚠️ तारीख निकली:')
                                : (isEn ? 'Due:' : 'वादा:')}{' '}
                              {customer.due_date}
                              {customer.credit_period_days ? ` (${customer.credit_period_days}d)` : ''}
                            </span>
                          </span>
                        )}

                        {customer.credit_limit && balance > customer.credit_limit && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 px-1.5 py-0.5 rounded font-black">
                            ⚠️ {isEn ? 'Over Limit!' : 'लिमिट पार!'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Bar */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
                    <div className="flex items-center space-x-1.5">
                      {/* Quick Udhaar (-) Button */}
                      <button
                        onClick={() => onOpenQuickTx(customer, 'udhaar')}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-extrabold flex items-center gap-1 border border-rose-200 dark:border-rose-900/60 active:scale-95 transition-all"
                      >
                        <span className="text-sm font-black">-</span>
                        <span>{isEn ? 'Udhaar' : 'उधार'}</span>
                      </button>

                      {/* Quick Jama (+) Button */}
                      <button
                        onClick={() => onOpenQuickTx(customer, 'jama')}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1 border border-emerald-200 dark:border-emerald-900/60 active:scale-95 transition-all"
                      >
                        <span className="text-sm font-black">+</span>
                        <span>{isEn ? 'Jama' : 'जमा'}</span>
                      </button>

                      {/* QR Payment Code (if balance > 0) */}
                      {isPendingUdhaar && (
                        <button
                          onClick={() => setQrCustomer(customer)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 active:scale-95 transition-all"
                          title={isEn ? 'Generate UPI QR Payment' : 'UPI QR कोड दिखाएं'}
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Direct Phone Call Button */}
                      {customer.phone && (
                        <a
                          href={`tel:${customer.phone}`}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 active:scale-95 transition-all"
                          title={isEn ? 'Call customer' : 'कॉल करें'}
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                        </a>
                      )}

                      {/* WhatsApp Reminder (if balance > 0 and phone exists) */}
                      {isPendingUdhaar && customer.phone && (
                        <a
                          href={generateWhatsAppReminder(
                            customer.name,
                            balance,
                            settings.shop_name,
                            customer.phone,
                            settings.upi_id
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 active:scale-95 transition-all"
                          title={isEn ? 'Send WhatsApp Reminder' : 'व्हाट्सएप पर तगादा भेजें'}
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* ✏️ Direct Edit Customer Button */}
                      {onEditCustomer && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditCustomer(customer);
                          }}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title={isEn ? 'Edit customer details' : 'ग्राहक का नाम, मोबाइल नंबर, पता बदलें'}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* View Full Statement Link */}
                      <button
                        onClick={() => onSelectCustomer(customer)}
                        className="text-xs font-bold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-0.5 transition-colors"
                      >
                        <span>{isEn ? 'View' : 'खाता'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- MODALS --- */}
      {/* 1. UPI QR Modal */}
      <UpiQrModal
        isOpen={Boolean(qrCustomer)}
        onClose={() => setQrCustomer(null)}
        customer={qrCustomer}
        settings={settings}
      />

      {/* 2. Bulk WhatsApp Reminders Modal */}
      <BulkReminderModal
        isOpen={isBulkReminderOpen}
        onClose={() => setIsBulkReminderOpen(false)}
        customers={customers}
        settings={settings}
      />

      {/* --- PRINTABLE LEDGER DUES SHEET --- */}
      <div className="hidden print:block p-6 text-slate-900 bg-white printable-ledger-sheet">
        <div className="text-center border-b-2 border-slate-900 pb-3 mb-4">
          <h1 className="text-2xl font-black text-slate-900">
            {settings.shop_name || 'दुकान खाता'}
          </h1>
          <p className="text-xs text-slate-600 font-bold">
            {isEn ? 'Customer Ledger & Udhaar Due Statement' : 'ग्राहक खाता एवं बकाया उधार रिपोर्ट'}
          </p>
          <div className="flex justify-between items-center text-xs mt-2 pt-1 border-t border-slate-200">
            <span>{isEn ? 'Contact: ' : 'संपर्क: '}{settings.phone || '-'}</span>
            <span>{isEn ? 'Total Customers: ' : 'कुल ग्राहक: '}{customers.length}</span>
            <span>{isEn ? 'Date: ' : 'दिनांक: '}{new Date().toLocaleDateString('hi-IN')}</span>
          </div>
        </div>

        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-800 bg-slate-100 text-[11px] font-bold">
              <th className="py-1.5 px-2 text-left">क्र.सं.</th>
              <th className="py-1.5 px-2 text-left">ग्राहक का नाम</th>
              <th className="py-1.5 px-2 text-left">मोबाइल नंबर</th>
              <th className="py-1.5 px-2 text-left">पता</th>
              <th className="py-1.5 px-2 text-center">वादा तारीख</th>
              <th className="py-1.5 px-2 text-right">कुल उधार (+)</th>
              <th className="py-1.5 px-2 text-right">कुल जमा (-)</th>
              <th className="py-1.5 px-2 text-right">बाकी बैलेंस (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {customers.map((c, idx) => (
              <tr key={c.id || idx}>
                <td className="py-1.5 px-2 text-slate-500">{idx + 1}</td>
                <td className="py-1.5 px-2 font-bold text-slate-900">{c.name}</td>
                <td className="py-1.5 px-2 text-slate-600">{c.phone || '-'}</td>
                <td className="py-1.5 px-2 text-slate-500 truncate max-w-[120px]">{c.address || '-'}</td>
                <td className="py-1.5 px-2 text-center text-slate-600 font-medium">{c.due_date || '-'}</td>
                <td className="py-1.5 px-2 text-right font-semibold text-rose-700">₹{c.total_udhaar || 0}</td>
                <td className="py-1.5 px-2 text-right font-semibold text-emerald-700">₹{c.total_jama || 0}</td>
                <td className="py-1.5 px-2 text-right font-black text-slate-900">
                  <span className={(c.net_balance || 0) > 0 ? 'text-rose-700' : (c.net_balance || 0) < 0 ? 'text-emerald-700' : 'text-slate-600'}>
                    ₹{c.net_balance || 0}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Grand Total Row */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-300 rounded-lg flex justify-between items-center text-xs font-black">
          <span>कुल बाजार बकाया (Total Market Udhaar):</span>
          <span className="text-base text-rose-700">
            ₹{customers.reduce((sum, c) => sum + ((c.net_balance || 0) > 0 ? (c.net_balance || 0) : 0), 0)}
          </span>
        </div>
      </div>
    </>
  );
};
