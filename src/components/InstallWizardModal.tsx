import React, { useState } from 'react';
import {
  X,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Server,
  ShieldCheck,
  User,
  Phone,
  Mail,
  Lock,
  Layers,
  Sparkles
} from 'lucide-react';

interface InstallWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onOpenAdmin?: () => void;
  lang?: 'hi' | 'en';
}

export const InstallWizardModal: React.FC<InstallWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onOpenAdmin,
  lang = 'hi'
}) => {
  const isEn = lang === 'en';

  // 1. Database Connection State
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('3306');
  const [user, setUser] = useState('root');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('dukaan_khaata_db');

  // 2. Super Admin (Platform) Setup State - No Store Setup!
  const [adminName, setAdminName] = useState(isEn ? 'Platform Admin' : 'मुख्य व्यवस्थापक');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminMobile, setAdminMobile] = useState('9876543210');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [platformName, setPlatformName] = useState('दुकान खाता');

  const [testing, setTesting] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setAlert(null);
    try {
      const res = await fetch('/api/install/test-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, user, password, database })
      });
      const data = await res.json();
      if (data.success) {
        setAlert({
          type: 'success',
          text: data.message + (data.dbExists ? ' (डेटाबेस पहले से मौजूद है)' : ' (डेटाबेस नया बनाया जाएगा)')
        });
      } else {
        setAlert({
          type: 'error',
          text: data.error || 'डेटाबेस कनेक्शन असफल!'
        });
      }
    } catch (err: any) {
      setAlert({ type: 'error', text: 'सर्वर से संपर्क नहीं हो सका: ' + err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleInstallSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);

    const cleanUsername = adminUsername.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      setAlert({
        type: 'error',
        text: isEn ? 'Admin Username must be at least 3 characters' : 'व्यवस्थापक (Admin) यूज़रनेम कम से कम 3 अक्षरों का होना चाहिए'
      });
      return;
    }

    const cleanMobile = adminMobile.replace(/[^0-9]/g, '');
    if (cleanMobile.length < 10) {
      setAlert({
        type: 'error',
        text: isEn ? 'Enter valid 10-digit Admin mobile number' : 'कृपया व्यवस्थापक का सही 10-अंकों का मोबाइल नंबर दर्ज करें'
      });
      return;
    }

    const cleanEmail = adminEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setAlert({
        type: 'error',
        text: isEn ? 'Enter a valid Email ID (required for OTP & Admin Recovery)' : 'कृपया वैध ईमेल दर्ज करें (OTP व पासवर्ड रिकवरी हेतु अति आवश्यक)'
      });
      return;
    }

    if (!adminPassword || adminPassword.length < 4) {
      setAlert({
        type: 'error',
        text: isEn ? 'Admin Password must be at least 4 characters' : 'एडमिन पासवर्ड कम से कम 4 अक्षरों का होना चाहिए'
      });
      return;
    }

    setInstalling(true);

    try {
      const res = await fetch('/api/install/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host,
          port,
          user,
          password,
          database,
          admin_name: adminName.trim(),
          admin_username: cleanUsername,
          admin_phone: cleanMobile,
          admin_email: cleanEmail,
          admin_password: adminPassword.trim(),
          platform_name: platformName.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setInstalledSuccess(true);
        if (onSuccess) onSuccess();
      } else {
        setAlert({
          type: 'error',
          text: data.error || 'डेटाबेस सेटअप में समस्या आई!'
        });
      }
    } catch (err: any) {
      setAlert({ type: 'error', text: 'सेटअप में त्रुटि: ' + err.message });
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-lg md:max-w-xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92dvh] my-auto">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-teal-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-xl text-amber-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                {isEn ? 'Server & Database Setup Wizard' : '1-क्लिक सर्वर व एडमिन इंस्टॉलेशन विज़ार्ड'}
              </h3>
              <p className="text-[11px] text-indigo-100/90 font-medium">
                {isEn ? 'Configure MySQL database & Super Admin account' : 'डेटाबेस तैयार करें और मुख्य व्यवस्थापक (Super Admin) खाता बनाएं'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 overscroll-contain">
          {installedSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-black text-slate-900 dark:text-white">
                  {isEn ? 'Server & Database Installed Successfully!' : '🎉 सर्वर और डेटाबेस सफलतापूर्वक तैयार हो गया!'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  {isEn
                    ? 'All MySQL database tables and Super Admin portal account are ready.'
                    : 'सभी MySQL टेबल्स और मुख्य व्यवस्थापक (Super Admin) खाता तैयार हो चुका है।'}
                </p>
              </div>

              {/* Super Admin Credentials Summary Card */}
              <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-2xl max-w-md mx-auto text-xs text-left space-y-2.5">
                <div className="flex items-center justify-between border-b border-indigo-200/80 dark:border-indigo-800/60 pb-2">
                  <span className="font-extrabold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>{isEn ? 'Super Admin Login Credentials' : 'मुख्य व्यवस्थापक (Super Admin) लॉगिन:'}</span>
                  </span>
                  <span className="font-mono text-[11px] font-black px-2 py-0.5 rounded-md bg-indigo-200/70 dark:bg-indigo-900/70 text-indigo-900 dark:text-indigo-200">
                    {adminUsername}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  <div>👤 <strong>यूज़रनेम:</strong> <span className="font-bold text-indigo-700 dark:text-indigo-400">{adminUsername}</span></div>
                  <div>🔐 <strong>पासवर्ड:</strong> <span className="font-bold text-indigo-700 dark:text-indigo-400">{adminPassword}</span></div>
                  <div>📲 <strong>मोबाइल:</strong> <span className="font-bold">{adminMobile}</span></div>
                  <div>📧 <strong>ईमेल:</strong> <span className="font-bold truncate">{adminEmail}</span></div>
                </div>

                <div className="pt-2 border-t border-indigo-200/60 dark:border-indigo-800/40 text-[11px] text-indigo-900 dark:text-indigo-300 font-medium">
                  💡 <strong>स्टोर सेटअप:</strong> दुकान का सेटअप आप एडमिन पोर्टल में लॉगिन करने के बाद <strong>'दुकान जोड़ें (Add Store)'</strong> से या दुकान रजिस्ट्रेशन पेज से कभी भी कर सकते हैं।
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  onClick={() => {
                    onClose();
                    if (onOpenAdmin) {
                      onOpenAdmin();
                    } else {
                      window.location.reload();
                    }
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-700 hover:from-indigo-700 hover:to-teal-800 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 active:scale-98 transition-all"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isEn ? 'Open Super Admin Portal →' : '🛡️ एडमिन पोर्टल खोलें (Open Admin Portal) →'}</span>
                </button>
                <button
                  onClick={() => {
                    onClose();
                    window.location.reload();
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs"
                >
                  {isEn ? 'Reload Dukaan Khaata' : 'ऐप रीलोड करें'}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleInstallSetup} className="space-y-4">
              {/* Lock Missing Notice */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
                <span className="font-bold flex items-center gap-1.5">
                  <span>ℹ️</span>
                  <span>{isEn ? 'System installation lock (installed.lock) is missing.' : 'सिस्टम इंस्टॉलेशन लॉक नहीं मिला — सर्वर डेटाबेस व एडमिन सेटअप करें।'}</span>
                </span>
                <a
                  href="install.php"
                  className="inline-flex items-center justify-center px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] shadow-xs transition-all shrink-0"
                >
                  {isEn ? '🌐 Open install.php →' : '🌐 cPanel install.php खोलें →'}
                </a>
              </div>

              {/* Alert Notification */}
              {alert && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                    alert.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                  }`}
                >
                  {alert.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  )}
                  <span>{alert.text}</span>
                </div>
              )}

              {/* Section 1: Database Credentials Card */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>{isEn ? '1. MySQL Database Details' : '1. MySQL डेटाबेस कनेक्शन विवरण'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="text-[11px] font-bold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>🔌 टेस्ट कनेक्शन</span>}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">Host</label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="localhost"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">Port</label>
                    <input
                      type="text"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="3306"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">Database Name *</label>
                  <input
                    type="text"
                    required
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    placeholder="dukaan_khaata_db"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-teal-900 dark:text-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">Username *</label>
                    <input
                      type="text"
                      required
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="root"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Super Admin Platform Account Setup */}
              <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>{isEn ? '2. Super Admin Account Setup' : '2. मुख्य व्यवस्थापक (Super Admin) खाता सेटअप'}</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-200/80 dark:bg-indigo-900/80 text-indigo-900 dark:text-indigo-200 font-bold">
                    {isEn ? 'Platform Control' : 'प्लेटफ़ॉर्म कंट्रोल'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-indigo-900 dark:text-indigo-300 block mb-0.5 flex items-center gap-1">
                      <User className="w-3 h-3 text-indigo-600" />
                      <span>{isEn ? 'Admin Name *' : 'व्यवस्थापक का नाम *'}</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="मुख्य व्यवस्थापक"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-indigo-900 dark:text-indigo-300 block mb-0.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      <span>{isEn ? 'Admin Username (Login) *' : 'एडमिन यूज़रनेम (लॉगिन हेतु) *'}</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder="admin"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl text-xs font-mono font-bold text-indigo-950 dark:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-indigo-900 dark:text-indigo-300 block mb-0.5 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-indigo-600" />
                      <span>{isEn ? 'Admin Mobile (10 Digits) *' : 'व्यवस्थापक मोबाइल नंबर (10 अंक) *'}</span>
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={adminMobile}
                      onChange={(e) => setAdminMobile(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="9876543210"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-indigo-900 dark:text-indigo-300 block mb-0.5 flex items-center gap-1">
                      <Mail className="w-3 h-3 text-indigo-600" />
                      <span>{isEn ? 'Admin Email ID (for OTP & Recovery) *' : 'एडमिन ईमेल आईडी (OTP व रिकवरी हेतु) *'}</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@dukaan.com"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-indigo-900 dark:text-indigo-300 block mb-0.5 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-indigo-600" />
                      <span>{isEn ? 'Admin Portal Password *' : 'एडमिन पोर्टल पासवर्ड *'}</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="admin123"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-indigo-900 dark:text-indigo-300 block mb-0.5 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-indigo-600" />
                      <span>{isEn ? 'Platform / App Title' : 'प्लेटफ़ॉर्म / ऐप का नाम'}</span>
                    </label>
                    <input
                      type="text"
                      value={platformName}
                      onChange={(e) => setPlatformName(e.target.value)}
                      placeholder="दुकान खाता"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Helpful Store Setup Clarification Note */}
                <div className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-indigo-200/70 dark:border-indigo-800/50 text-[11px] text-indigo-900/90 dark:text-indigo-300 flex items-start gap-2">
                  <span className="text-base leading-none">🏬</span>
                  <span>
                    <strong>स्टोर सेटअप की आवश्यकता नहीं:</strong> इंस्टॉलेशन के बाद आप सीधे एडमिन पोर्टल खोलकर जितनी चाहें दुकानें जोड़ सकते हैं या दुकानदार खुद रजिस्ट्रेशन पेज से आवेदन कर सकते हैं।
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={installing}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-teal-700 hover:from-indigo-800 hover:to-teal-800 text-white font-extrabold text-xs shadow-lg shadow-indigo-700/25 flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
              >
                {installing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>{isEn ? 'Auto Create Database & Setup Admin' : '🚀 डेटाबेस बनाएं और एडमिन सेटअप करें'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
