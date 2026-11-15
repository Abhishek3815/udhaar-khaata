import React, { useState, useRef, useEffect } from 'react';
import {
  Store,
  Lock,
  KeyRound,
  Phone,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Sun,
  Moon,
  ShieldCheck,
  ArrowRight,
  Loader2,
  UserPlus,
  MapPin,
  QrCode,

  Mic,
  Zap,
  Wifi,
  Smartphone
} from 'lucide-react';
import { ShopSettings } from '../types';
import { playSoundboxVoice } from '../utils/speech';
import { AuthEngine } from '../utils/auth';

interface LoginPageProps {
  onLoginSuccess: (user: any) => void;
  settings: ShopSettings;
  soundboxEnabled: boolean;
  lang: 'hi' | 'en';
  onToggleLang: (target?: 'hi' | 'en') => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenAdmin?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  settings,
  soundboxEnabled,
  lang,
  onToggleLang,
  theme,
  onToggleTheme,
  onOpenAdmin
}) => {
  const isEn = lang === 'en';
  const isDark = theme === 'dark';

  // Primary mode: 'login' or 'register' or 'forgot'
  const [authType, setAuthType] = useState<'login' | 'register' | 'forgot'>('login');

  // Forgot Password & Recovery state
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [recoveryPhone, setRecoveryPhone] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('dukaan_last_phone') || '' : ''
  );
  const [recoveryOtp, setRecoveryOtp] = useState('');
  const [recoveryMaskedEmail, setRecoveryMaskedEmail] = useState('');
  const [recoveryHasEmail, setRecoveryHasEmail] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);


  // Sub-mode for login: 'pin' or 'password'
  const [loginMode, setLoginMode] = useState<'pin' | 'password'>('pin');

  // PIN mode state (4 digits)
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '']);

  // Phone input ref & digit input refs
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null)
  ];

  // Login credentials state
  const [phone, setPhone] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('dukaan_last_phone') || '' : ''
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // New Shop Registration state
  const [regShopName, setRegShopName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regUpiId, setRegUpiId] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regMasterPin, setRegMasterPin] = useState('');
  const [regStartFresh, setRegStartFresh] = useState(false);

  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto focus phone box or PIN digit box on mount
  useEffect(() => {
    if (authType === 'login') {
      setTimeout(() => {
        if (!phone || phone.length < 10) {
          phoneInputRef.current?.focus();
        } else if (loginMode === 'pin') {
          pinInputRefs[0].current?.focus();
        }
      }, 150);
    }
  }, [authType, loginMode]);

  // Handle digit input in PIN mode
  const handleDigitChange = (index: number, value: string) => {
    const cleanVal = value.replace(/[^0-9]/g, '');
    const newDigits = [...pinDigits];

    if (!cleanVal) {
      newDigits[index] = '';
      setPinDigits(newDigits);
      return;
    }

    if (cleanVal.length > 1) {
      const chars = cleanVal.slice(0, 4).split('');
      for (let i = 0; i < 4; i++) {
        newDigits[i] = chars[i] || '';
      }
      setPinDigits(newDigits);
      const nextFocus = Math.min(cleanVal.length, 3);
      pinInputRefs[nextFocus].current?.focus();
      if (cleanVal.length >= 4) {
        submitPin(newDigits.join(''));
      }
      return;
    }

    newDigits[index] = cleanVal;
    setPinDigits(newDigits);

    if (index < 3 && cleanVal) {
      pinInputRefs[index + 1].current?.focus();
    }

    if (index === 3 && cleanVal) {
      const fullPin = newDigits.join('');
      if (fullPin.length === 4) {
        submitPin(fullPin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  const submitPin = async (pinValue: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '').trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMsg(
        isEn
          ? 'Please enter 10-digit registered mobile number'
          : 'कृपया 10-अंकों का पंजीकृत मोबाइल नंबर दर्ज करें'
      );
      phoneInputRef.current?.focus();
      return;
    }

    if (pinValue.length < 4) {
      setErrorMsg(isEn ? 'Please enter 4-digit PIN' : 'कृपया पूरा 4-अंकों का पिन दर्ज करें');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, pin: pinValue })
      });

      const data = await res.json();
      if (data.success) {
        AuthEngine.setSession(
          data.token || '',
          data.shop_id || data.user?.shop_id || 1,
          data.user,
          rememberMe
        );

        const welcomeText = isEn
          ? `Welcome to ${data.user?.shop_name || 'Dukaan'}`
          : `नमस्ते, ${data.user?.shop_name || 'दुकान खाता'} में आपका स्वागत है`;
        playSoundboxVoice(welcomeText, soundboxEnabled);

        onLoginSuccess(data.user);
      } else {
        setErrorMsg(
          data.error ||
            (isEn ? 'Incorrect PIN or unregistered mobile!' : 'गलत पिन या अपंजीकृत मोबाइल नंबर!')
        );
        setPinDigits(['', '', '', '']);
        pinInputRefs[0].current?.focus();
      }
    } catch {
      setErrorMsg(isEn ? 'Server connection error' : 'सर्वर से संपर्क नहीं हो सका');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/[^0-9]/g, '').trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMsg(
        isEn
          ? 'Please enter 10-digit registered mobile number'
          : 'कृपया 10-अंकों का पंजीकृत मोबाइल नंबर दर्ज करें'
      );
      phoneInputRef.current?.focus();
      return;
    }
    if (!password) {
      setErrorMsg(isEn ? 'Please enter password' : 'कृपया पासवर्ड दर्ज करें');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, password })
      });

      const data = await res.json();
      if (data.success) {
        AuthEngine.setSession(
          data.token || '',
          data.shop_id || data.user?.shop_id || 1,
          data.user,
          rememberMe
        );

        const welcomeText = isEn
          ? `Welcome to ${data.user?.shop_name || 'Dukaan'}`
          : `नमस्ते, ${data.user?.shop_name || 'दुकान खाता'} में आपका स्वागत है`;
        playSoundboxVoice(welcomeText, soundboxEnabled);

        onLoginSuccess(data.user);
      } else {
        setErrorMsg(
          data.error || (isEn ? 'Invalid mobile or password' : 'गलत मोबाइल नंबर या पासवर्ड')
        );
      }
    } catch {
      setErrorMsg(isEn ? 'Server connection error' : 'सर्वर से संपर्क नहीं हो सका');
    } finally {
      setLoading(false);
    }
  };

  // Handle New Shop Registration Submission
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!regShopName.trim()) {
      setErrorMsg(isEn ? 'Please enter shop name' : 'कृपया दुकान का नाम दर्ज करें');
      return;
    }
    const cleanRegPhone = regPhone.replace(/[^0-9]/g, '').trim();
    if (!cleanRegPhone || cleanRegPhone.length < 10) {
      setErrorMsg(
        isEn
          ? 'Please enter valid 10-digit mobile number'
          : 'कृपया मान्य 10-अंकों का मोबाइल नंबर दर्ज करें'
      );
      return;
    }
    if (!regPin.trim() || regPin.trim().length < 4) {
      setErrorMsg(isEn ? 'Please set a 4-digit PIN' : 'कृपया 4-अंकों का पिन दर्ज करें');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_name: regShopName.trim(),
          owner_name: regOwnerName.trim() || 'दुकानदार',
          phone: cleanRegPhone,
          email: regEmail.trim(),
          address: regAddress.trim(),
          upi_id: regUpiId.trim() || `${cleanRegPhone}@paytm`,
          pin: regPin.trim(),
          password: regPassword.trim() || 'admin'
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        if (data.is_pending_approval) {
          playSoundboxVoice(
            'दुकान का रजिस्ट्रेशन प्राप्त हो गया है। व्यवस्थापक द्वारा मंज़ूर होने के बाद आप लॉगिन कर सकेंगे',
            soundboxEnabled
          );
          setTimeout(() => {
            setAuthType('login');
          }, 3500);
        } else {
          AuthEngine.setSession(
            data.token || '',
            data.shop_id || data.user?.shop_id || 1,
            data.user,
            rememberMe
          );
          const welcomeText = `बधाई हो! आपकी दुकान ${regShopName.trim()} का खाता तैयार हो गया है`;
          playSoundboxVoice(welcomeText, soundboxEnabled);
          setTimeout(() => {
            onLoginSuccess(data.user);
          }, 1200);
        }
      } else {
        setErrorMsg(
          data.error || (isEn ? 'Failed to register shop' : 'दुकान रजिस्टर करने में समस्या आई')
        );
      }
    } catch {
      setErrorMsg(isEn ? 'Server connection error' : 'सर्वर से संपर्क नहीं हो सका');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password / Recovery Handlers
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = recoveryPhone.replace(/[^0-9]/g, '');
    if (!clean) {
      setErrorMsg(
        isEn ? 'Please enter registered mobile number' : 'कृपया पंजीकृत मोबाइल नंबर दर्ज करें'
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean })
      });

      const data = await res.json();
      if (data.success) {
        setRecoveryOtp('');
        setRecoveryMaskedEmail(data.maskedEmail || '');
        setRecoveryHasEmail(Boolean(data.hasEmail));
        setForgotStep('verify');
        if (data.hasEmail && data.maskedEmail) {
          setSuccessMsg(
            isEn
              ? `Security code (OTP) sent to ${data.maskedEmail}`
              : `सुरक्षा कोड (OTP) आपके पंजीकृत ईमेल ${data.maskedEmail} पर भेज दिया गया है!`
          );
          playSoundboxVoice('सुरक्षा कोड आपके ईमेल पर भेज दिया गया है', soundboxEnabled);
        } else {
          setSuccessMsg(
            isEn
              ? 'No recovery email found. Please use server emergency reset below.'
              : 'दुकान में कोई ईमेल लिंक नहीं है। कृपया नीचे दिया गया इमरजेंसी रीसेट विकल्प देखें।'
          );
        }
      } else {
        setErrorMsg(data.error || (isEn ? 'Phone not registered' : 'यह नंबर पंजीकृत नहीं है'));
      }
    } catch {
      setErrorMsg(isEn ? 'Failed to connect to server' : 'सर्वर से संपर्क नहीं हो सका');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryOtp || !recoveryOtp.trim()) {
      setErrorMsg(isEn ? 'Please enter 6-digit OTP' : 'कृपया सुरक्षा कोड (OTP) दर्ज करें');
      return;
    }
    const cleanPin = newPin.trim();
    if (cleanPin.length !== 4) {
      setErrorMsg(isEn ? 'New PIN must be 4 digits' : 'नया पिन 4 अंकों का होना चाहिए');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password/verify-and-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: recoveryPhone,
          otp: recoveryOtp.trim(),
          newPin: cleanPin,
          newPassword: newPassword.trim() || 'admin'
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(
          isEn
            ? 'PIN & Password reset successful! Logging in...'
            : 'पिन और पासवर्ड सफलतापूर्वक बदल दिया गया! लॉगिन हो रहा है...'
        );
        playSoundboxVoice('नया पिन और पासवर्ड सेट हो गया है', soundboxEnabled);

        AuthEngine.setSession(
          data.token || '',
          data.shop_id || data.user?.shop_id || 1,
          data.user,
          true
        );

        setTimeout(() => {
          onLoginSuccess(data.user);
        }, 1200);
      } else {
        setErrorMsg(data.error || (isEn ? 'Invalid OTP' : 'गलत सुरक्षा कोड'));
      }
    } catch {
      setErrorMsg(isEn ? 'Server connection error' : 'सर्वर से संपर्क नहीं हो सका');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      } flex items-center justify-center p-3 sm:p-6 lg:p-10 transition-colors duration-200`}
    >
      {/* Outer Responsive Wrapper: Split layout on Desktop (lg:flex), Single Card on Mobile */}
      <div className="w-full max-w-5xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col lg:flex-row transition-colors duration-200">
        {/* --- LEFT HERO BANNER (Desktop Showcase & Mobile Brand Strip) --- */}
        <div className="lg:w-5/12 bg-gradient-to-br from-emerald-800 via-teal-900 to-slate-950 dark:from-emerald-950 dark:via-slate-900 dark:to-slate-950 text-white p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle decorative circles */}
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />

          {/* Top Controls: Lang & Theme */}
          <div className="flex items-center justify-between mb-6 z-10">
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-xs px-2.5 py-1 rounded-full border border-white/20">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-200">
                100% {isEn ? 'Secure Digital Khata' : 'सुरक्षित मुनीम'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => onToggleLang(lang === 'hi' ? 'en' : 'hi')}
                className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-amber-300 transition-all active:scale-95"
              >
                {lang === 'hi' ? 'English' : 'हिंदी'}
              </button>
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex items-center p-0.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition-all active:scale-95 shadow-inner"
                title={isDark ? (isEn ? 'Dark mode active (Click for Light)' : 'डार्क मोड सक्रिय (लाइट के लिए क्लिक करें)') : (isEn ? 'Light mode active (Click for Dark)' : 'लाइट मोड सक्रिय (डार्क के लिए क्लिक करें)')}
              >
                <span className={`p-1 rounded-lg flex items-center justify-center transition-all ${
                  !isDark
                    ? 'bg-amber-400 text-slate-900 shadow-xs font-bold'
                    : 'text-teal-200/60 hover:text-teal-100'
                }`}>
                  <Sun className="w-3.5 h-3.5" />
                </span>
                <span className={`p-1 rounded-lg flex items-center justify-center transition-all ${
                  isDark
                    ? 'bg-teal-500 text-white shadow-xs font-bold'
                    : 'text-teal-200/60 hover:text-teal-100'
                }`}>
                  <Moon className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>
          </div>

          {/* Platform Identity Hero Presentation */}
          <div className="z-10 my-auto py-4">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center font-black text-2xl shadow-lg shrink-0">
                <Store className="w-7 h-7 text-white" />
              </div>

              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
                  {isEn ? 'Dukaan Khaata' : 'डिजिटल दुकान खाता'}
                </h1>
                <p className="text-xs text-emerald-200/90 font-semibold mt-0.5">
                  {isEn ? 'Smart Digital Ledger & Multi-Store Manager' : 'स्मार्ट डिजिटल बहीखाता & मुनीम'}
                </p>
              </div>
            </div>

            {/* Feature highlights (Desktop only) */}
            <div className="hidden lg:flex flex-col space-y-3 mt-6 pt-6 border-t border-white/10">
              <div className="flex items-center gap-3 text-xs text-emerald-100">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                  <Mic className="w-4 h-4" />
                </div>
                <span>
                  <strong>{isEn ? 'Voice Assistant:' : 'बोलकर मुनीम:'}</strong>{' '}
                  {isEn ? 'Record khata & bills by speaking' : 'बोलकर उधार-जमा और बिल एंट्री'}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-emerald-100">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                  <Wifi className="w-4 h-4" />
                </div>
                <span>
                  <strong>{isEn ? 'Offline Ready:' : '100% ऑफलाइन:'}</strong>{' '}
                  {isEn ? 'Works without internet, syncs anytime' : 'बिना इंटरनेट चलता है, कभी भी सिंक करें'}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-emerald-100">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                  <Smartphone className="w-4 h-4" />
                </div>
                <span>
                  <strong>{isEn ? 'WhatsApp Reminders:' : 'WhatsApp तगादा:'}</strong>{' '}
                  {isEn ? 'One-click payment link & statement' : 'एक क्लिक में ग्राहकों को बकाया का तगादा'}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Trust Badge */}
          <div className="z-10 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-teal-200/80">
            <span>{isEn ? 'Encrypted & Password Protected' : 'सुरक्षित व पिन लॉक सुविधा'}</span>
            <span className="font-mono text-emerald-300 font-bold">v2.5 Pro</span>
          </div>
        </div>

        {/* --- RIGHT AUTH FORM CARD (Modern Fintech Form) --- */}
        <div className="lg:w-7/12 p-6 sm:p-8 flex flex-col justify-center space-y-5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors duration-200">
          {/* Main Auth Mode Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {authType === 'register'
                  ? (isEn ? 'Register New Shop' : '✨ नई दुकान रजिस्टर करें')
                  : authType === 'forgot'
                  ? (isEn ? '🔐 Recover PIN & Password' : '🔐 पासवर्ड / पिन रिकवरी')
                  : (isEn ? 'Welcome Back!' : 'दुकान में आपका स्वागत है')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {authType === 'register'
                  ? (isEn ? 'Start managing accounts in under 1 minute' : '1 मिनट में अपनी दुकान का डिजिटल खाता शुरू करें')
                  : authType === 'forgot'
                  ? (isEn ? 'Verify your mobile number to reset access' : 'अपना मोबाइल नंबर सत्यापित करके नया पिन बनाएं')
                  : (isEn ? 'Enter registered mobile and 4-digit PIN to unlock' : 'पंजीकृत मोबाइल व 4-अंकों का पिन डालकर खाता खोलें')}
              </p>
            </div>

            {/* If forgot, back to login */}
            {authType === 'forgot' && (
              <button
                type="button"
                onClick={() => {
                  setAuthType('login');
                  setForgotStep('request');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="py-1 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                ← {isEn ? 'Back' : 'पीछे'}
              </button>
            )}
          </div>

          {/* Top Switcher: Login vs Register (shown when not in forgot mode) */}
          {authType !== 'forgot' && (
            <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-bold border border-slate-200/80 dark:border-slate-700/80">
              <button
                type="button"
                onClick={() => {
                  setAuthType('login');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                  authType === 'login'
                    ? 'bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isEn ? 'Dukaan Login' : 'दुकान लॉगिन'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthType('register');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                  authType === 'register'
                    ? 'bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isEn ? 'New Registration' : 'नई दुकान रजिस्टर'}</span>
              </button>
            </div>
          )}

          {/* Alerts */}
          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ========================================= */}
          {/* VIEW 1: LOGIN (PIN or Password) */}
          {/* ========================================= */}
          {authType === 'login' && (
            <div className="space-y-4">
              {/* Phone Input */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Registered Mobile Number *' : 'पंजीकृत मोबाइल नंबर *'}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-bold text-xs flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    <span>+91</span>
                  </span>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    maxLength={10}
                    value={phone}
                    onChange={e => {
                      setPhone(e.target.value.replace(/[^0-9]/g, ''));
                      setErrorMsg(null);
                    }}
                    placeholder="9876543210"
                    className="w-full pl-16 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-extrabold tracking-wide focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              {/* Sub-Tabs: PIN vs Password */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold border border-slate-200/80 dark:border-slate-700/80">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('pin');
                    setErrorMsg(null);
                  }}
                  className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    loginMode === 'pin'
                      ? 'bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isEn ? '4-Digit PIN' : '4-अंकों का PIN'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('password');
                    setErrorMsg(null);
                  }}
                  className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    loginMode === 'password'
                      ? 'bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Password' : 'पासवर्ड'}</span>
                </button>
              </div>

              {/* PIN Mode */}
              {loginMode === 'pin' && (
                <div className="space-y-3.5">
                  <div className="text-center">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block">
                      {isEn ? 'Enter your 4-digit security PIN' : 'सुरक्षा पिन दर्ज करें'}
                    </label>
                  </div>

                  {/* 4 Digit Boxes */}
                  <div className="flex justify-center gap-3 my-2">
                    {pinDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={pinInputRefs[idx]}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleDigitChange(idx, e.target.value)}
                        onKeyDown={e => handleKeyDown(idx, e)}
                        className={`w-14 h-15 text-center text-2xl font-black rounded-2xl border-2 transition-all ${
                          digit
                            ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300'
                            : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white'
                        } focus:border-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-500/20`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => submitPin(pinDigits.join(''))}
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-sm shadow-md shadow-emerald-700/25 flex items-center justify-center gap-2 active:scale-98 transition-all"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span>{isEn ? 'Unlock Dukaan Khaata' : 'खाता खोलें (Unlock)'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Password Mode */}
              {loginMode === 'password' && (
                <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {isEn ? 'Password' : 'पासवर्ड'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                        <Lock className="w-4 h-4" />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-sm shadow-md shadow-emerald-700/25 flex items-center justify-center gap-2 active:scale-98 transition-all"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span>{isEn ? 'Login with Password' : 'पासवर्ड से लॉगिन करें'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                  />
                  <span className="text-slate-600 dark:text-slate-400 font-medium">
                    {isEn ? 'Remember me' : 'मुझे याद रखें'}
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setForgotStep('request');
                    setAuthType('forgot');
                  }}
                  className="text-amber-600 dark:text-amber-400 font-bold hover:underline flex items-center gap-1"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Forgot PIN / Password?' : 'पिन या पासवर्ड भूल गए?'}</span>
                </button>
              </div>

              {/* Registration Link */}
              <div className="text-center pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAuthType('register')}
                  className="text-emerald-700 dark:text-emerald-400 font-bold text-xs hover:underline inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{isEn ? 'New shopkeeper? Register new shop here →' : 'नई दुकान है? यहाँ नई दुकान रजिस्टर करें →'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================= */}
          {/* VIEW 2: NEW SHOP REGISTRATION */}
          {/* ========================================= */}
          {authType === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Shop Name *' : 'दुकान का नाम *'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Store className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={regShopName}
                    onChange={e => setRegShopName(e.target.value)}
                    placeholder={isEn ? 'e.g. Balaji Supermart' : 'उदा: श्री बालाजी किराना स्टोर'}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Owner Name' : 'मालिक का नाम'}
                  </label>
                  <input
                    type="text"
                    value={regOwnerName}
                    onChange={e => setRegOwnerName(e.target.value)}
                    placeholder="राजेश कुमार"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Mobile No. *' : 'मोबाइल नंबर *'}
                  </label>
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={e => setRegPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between mb-1">
                  <span>{isEn ? 'Recovery Email (Optional)' : 'रिकवरी ईमेल (वैकल्पिक)'}</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">🔒 फ्री OTP के लिए</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Mail className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    placeholder="apnaemail@gmail.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Shop Address' : 'दुकान का पता'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <MapPin className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    value={regAddress}
                    onChange={e => setRegAddress(e.target.value)}
                    placeholder={isEn ? 'Market, Town' : 'मेन बाजार, स्टेशन रोड'}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Shop UPI ID (for QR payment)' : 'दुकान की UPI ID (QR पेमेंट के लिए)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <QrCode className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    value={regUpiId}
                    onChange={e => setRegUpiId(e.target.value)}
                    placeholder="9876543210@paytm"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-emerald-50/70 dark:bg-emerald-950/30 p-2.5 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                <div>
                  <label className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300 block mb-1">
                    {isEn ? 'Set 4-Digit PIN' : '4-अंकों का पिन'}
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={regPin}
                    onChange={e => setRegPin(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="••••"
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-emerald-300 rounded-lg text-xs font-extrabold text-center tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300 block mb-1">
                    {isEn ? 'Set Password' : 'पासवर्ड'}
                  </label>
                  <input
                    type="text"
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-emerald-300 rounded-lg text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-sm shadow-md shadow-emerald-700/25 flex items-center justify-center gap-2 active:scale-98 transition-all mt-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>{isEn ? 'Create Shop Account & Open Dukaan' : 'दुकान खाता बनाएं & शुरू करें'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAuthType('login')}
                  className="text-emerald-700 dark:text-emerald-400 font-bold text-xs hover:underline inline-flex items-center gap-1"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Already have account? Login here →' : 'पहले से दुकान खाता है? यहाँ लॉगिन करें →'}</span>
                </button>
              </div>
            </form>
          )}

          {/* ========================================= */}
          {/* VIEW 3: FORGOT PASSWORD / PIN RECOVERY */}
          {/* ========================================= */}
          {authType === 'forgot' && (
            <div className="space-y-4">
              {forgotStep === 'request' && (
                <form onSubmit={handleForgotRequest} className="space-y-3">
                  <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                        <KeyRound className="w-5 h-5" />
                      </div>
                      <div className="text-xs">
                        <div className="font-bold text-amber-900 dark:text-amber-300 mb-0.5">
                          {isEn ? 'Step 1: Enter Registered Mobile Number' : 'स्टेप 1: दुकान में दर्ज मोबाइल नंबर दर्ज करें'}
                        </div>
                        <div className="text-amber-800/90 dark:text-amber-400/80 leading-relaxed text-[11px]">
                          {isEn
                            ? 'We will verify your shop mobile number and generate a 6-digit security recovery OTP.'
                            : 'दुकान में दर्ज आपका मोबाइल नंबर जांचा जाएगा और एक 6-अंकों का सिक्योरिटी OTP तैयार होगा।'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {isEn ? 'Registered Mobile Number *' : 'पंजीकृत मोबाइल नंबर *'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Phone className="w-4 h-4" />
                      </span>
                      <input
                        type="tel"
                        maxLength={10}
                        required
                        value={recoveryPhone}
                        onChange={e => setRecoveryPhone(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder={isEn ? '10-digit registered mobile' : '10-अंकों का पंजीकृत मोबाइल नंबर'}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-extrabold text-sm shadow-md shadow-amber-600/25 flex items-center justify-center gap-2 active:scale-98 transition-all"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span>{isEn ? 'Send Security OTP' : 'सिक्योरिटी OTP भेजें / प्राप्त करें'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {forgotStep === 'verify' && (
                <form onSubmit={handleForgotVerifyAndReset} className="space-y-3">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        {recoveryHasEmail ? (
                          <>
                            <Mail className="w-4 h-4 text-emerald-600" />
                            <span>{isEn ? 'OTP Dispatched to Email' : 'ईमेल पर 6-अंकों का OTP भेजा गया'}</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>{isEn ? 'Master Security Verification' : 'मास्टर सुरक्षा सत्यापन'}</span>
                          </>
                        )}
                      </div>
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-bold">
                        🔒 {isEn ? 'Secure' : 'सुरक्षित'}
                      </span>
                    </div>

                    {recoveryHasEmail && recoveryMaskedEmail ? (
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                        {isEn
                          ? `A 6-digit security OTP has been sent to registered email `
                          : `6-अंकों का सुरक्षा OTP कोड आपके पंजीकृत ईमेल `}
                        <strong className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 font-mono font-extrabold">
                          {recoveryMaskedEmail}
                        </strong>
                        {isEn
                          ? `. Please check your inbox or spam folder.`
                          : ` पर भेज दिया गया है। कृपया इनबॉक्स देखें।`}
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                        {isEn
                          ? `No recovery email linked. Please use server emergency reset below.`
                          : `दुकान में कोई ईमेल लिंक नहीं है। कृपया नीचे दिए गए सर्वर इमरजेंसी रीसेट का उपयोग करें।`}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {isEn ? 'Enter 6-Digit Email OTP *' : 'ईमेल पर आया 6-अंकों का OTP दर्ज करें *'}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={recoveryOtp}
                      onChange={e => setRecoveryOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="••••••"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-center font-mono font-extrabold text-lg tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        {isEn ? 'New 4-Digit PIN *' : 'नया 4-अंकों का पिन *'}
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        required
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="••••"
                        className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-center font-bold text-sm tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        {isEn ? 'New Password' : 'नया पासवर्ड'}
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="••••••"
                          className="w-full px-2 py-2 pr-7 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForgotStep('request')}
                      className="py-3 px-3 rounded-2xl border border-slate-300 dark:border-slate-700 text-xs font-bold transition-all"
                    >
                      {isEn ? 'Back' : 'पीछे'}
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-sm shadow-md shadow-emerald-700/25 flex items-center justify-center gap-2 active:scale-98 transition-all"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{isEn ? 'Reset & Login Now' : 'पिन रीसेट करें & लॉगिन करें'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}



              {onOpenAdmin && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-center">
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/40 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:border-indigo-300 transition-all active:scale-95 shadow-xs"
                  >
                    <ShieldCheck className="w-4 h-4 text-indigo-500" />
                    <span>{isEn ? 'Super Admin Portal (Store Approval)' : '🛡️ सुपर एडमिन पोर्टल (दुकान अप्रूवल)'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
