import React, { useState, useEffect, useRef } from 'react';
import { X, Store, User, Phone, Mail, MapPin, QrCode, Volume2, VolumeX, Check, Sparkles, Loader2, Cloud, Download, Upload, Copy, CheckCheck, RefreshCw, ChevronDown, ChevronUp, AlertCircle, ShieldCheck, Camera, Trash2, Image as ImageIcon, Users, Lock } from 'lucide-react';
import { ShopSettings } from '../types';
import { playSoundboxVoice } from '../utils/speech';
import { useLanguage } from '../context/LanguageContext';

interface ShopSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ShopSettings;
  soundboxEnabled: boolean;
  onToggleSoundbox: () => void;
  onSaveSettings: (settings: Partial<ShopSettings>) => Promise<void>;
}

export const ShopSettingsModal: React.FC<ShopSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  soundboxEnabled,
  onToggleSoundbox,
  onSaveSettings
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [shopName, setShopName] = useState(settings.shop_name || '');
  const [ownerName, setOwnerName] = useState(settings.owner_name || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [email, setEmail] = useState(settings.email || '');
  const [address, setAddress] = useState(settings.address || '');
  const [upiId, setUpiId] = useState(settings.upi_id || '');
  const [logo, setLogo] = useState<string | null>(settings.logo || null);
  const [staffPhones, setStaffPhones] = useState(settings.staff_phones || '');
  const [gdriveWebhookUrl, setGdriveWebhookUrl] = useState(settings.gdrive_webhook_url || '');
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(Boolean(settings.auto_backup_enabled));
  const [lastBackupTime, setLastBackupTime] = useState(settings.last_backup_time || '');
  const [lastBackupStatus, setLastBackupStatus] = useState(settings.last_backup_status || '');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDriveHelper, setShowDriveHelper] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setShopName(settings.shop_name || '');
      setOwnerName(settings.owner_name || '');
      setPhone(settings.phone || '');
      setEmail(settings.email || '');
      setAddress(settings.address || '');
      setUpiId(settings.upi_id || '');
      setLogo(settings.logo || null);
      setStaffPhones(settings.staff_phones || '');
      setGdriveWebhookUrl(settings.gdrive_webhook_url || '');
      setAutoBackupEnabled(Boolean(settings.auto_backup_enabled));
      setLastBackupTime(settings.last_backup_time || '');
      setLastBackupStatus(settings.last_backup_status || '');
      setPin('');
      setPassword('');
      setSavedSuccess(false);
      setSyncMsg(null);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('कृपया फोटो फाइल (JPG, PNG, WebP) ही चुनें');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          setLogo(compressed);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSavedSuccess(false);

    try {
      await onSaveSettings({
        shop_name: shopName.trim(),
        owner_name: ownerName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        upi_id: upiId.trim(),
        logo: logo,
        staff_phones: staffPhones.trim(),
        gdrive_webhook_url: gdriveWebhookUrl.trim(),
        auto_backup_enabled: autoBackupEnabled,
        ...(pin.trim() ? { pin: pin.trim() } : {}),
        ...(password.trim() ? { password: password.trim() } : {})
      });
      setSavedSuccess(true);
      if (soundboxEnabled) {
        playSoundboxVoice('दुकान की सेटिंग्स सुरक्षित हो गई है', true);
      }
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      alert('सेटिंग्स सेव करने में समस्या आई');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualDriveSync = async () => {
    if (!gdriveWebhookUrl.trim()) {
      alert('कृपया पहले नीचे अपना Google Drive Webhook URL डालें');
      return;
    }

    setSyncingDrive(true);
    setSyncMsg(null);
    try {
      // First save current form inputs so shop details are preserved
      await onSaveSettings({
        shop_name: shopName.trim() || settings.shop_name || 'Mohit Kirana Store',
        owner_name: ownerName.trim() || settings.owner_name || 'मोहित कुमार',
        phone: phone.trim() || settings.phone || '9876543210',
        address: address.trim() || settings.address || '',
        upi_id: upiId.trim() || settings.upi_id || '',
        logo: logo,
        staff_phones: staffPhones.trim(),
        gdrive_webhook_url: gdriveWebhookUrl.trim(),
        auto_backup_enabled: autoBackupEnabled,
        ...(pin.trim() ? { pin: pin.trim() } : {}),
        ...(password.trim() ? { password: password.trim() } : {})
      });

      const res = await fetch('/api/backup/sync-gdrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: gdriveWebhookUrl.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setSyncMsg({ type: 'success', text: `✅ Google Drive पर बैकअप सफल! (${data.time})` });
        setLastBackupTime(data.time);
        setLastBackupStatus('सफल (Success)');
      } else {
        setSyncMsg({ type: 'error', text: `❌ ${data.error || 'Google Drive सिंक में समस्या आई'}` });
      }
    } catch (err: any) {
      setSyncMsg({ type: 'error', text: 'सिंक एरर: ' + err.message });
    } finally {
      setSyncingDrive(false);
    }
  };

  const handleDownloadBackup = () => {
    const downloadPin = pin || '1234';
    window.location.href = `/api/backup/download?pin=${encodeURIComponent(downloadPin)}`;
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('चेतावनी: क्या आप इस बैकअप फ़ाइल से सारा डेटा रिस्टोर करना चाहते हैं? इससे मौजूदा डेटा रिप्लेस हो जाएगा।')) {
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
      return;
    }

    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupData)
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ डेटा सफलतापूर्वक रिस्टोर हो गया! ऐप रिफ्रेश हो रहा है...');
        window.location.reload();
      } else {
        alert('रिस्टोर करने में समस्या आई: ' + data.error);
      }
    } catch (err: any) {
      alert('अमान्य बैकअप फाइल: ' + err.message);
    } finally {
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
    }
  };

  const gdriveScriptCode = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // 1. अगर ईमेल भेजने की रिक्वेस्ट है (Instant Real Email Dispatch via Google Cloud)
    if (data.action === "send_email") {
      MailApp.sendEmail({ to: data.to, subject: data.subject, htmlBody: data.htmlBody });
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    var isPlatform = data.is_platform_backup === true || data.backup_type === "FULL_PROJECT_MASTER_BACKUP" || data.total_shops !== undefined;
    var now = new Date();
    var timeStamp = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd_HH-mm");
    
    if (isPlatform) {
      // ══════════════════════════════════════════════════════════
      // 📁 पूरे प्रोजेक्ट का मास्टर बैकअप (अलग Master Folder)
      // ══════════════════════════════════════════════════════════
      var masterFolder = DriveApp.getFoldersByName("1_Dukaan_FULL_PROJECT_Master_Backups").hasNext() 
        ? DriveApp.getFoldersByName("1_Dukaan_FULL_PROJECT_Master_Backups").next() 
        : DriveApp.createFolder("1_Dukaan_FULL_PROJECT_Master_Backups");
      
      var masterFileName = "FULL_PROJECT_MASTER_" + timeStamp + ".json";
      masterFolder.createFile(masterFileName, JSON.stringify(data, null, 2), MimeType.PLAIN_TEXT);
      
      var latestM = masterFolder.getFilesByName("FULL_PROJECT_latest.json");
      if (latestM.hasNext()) {
        latestM.next().setContent(JSON.stringify(data, null, 2));
      } else {
        masterFolder.createFile("FULL_PROJECT_latest.json", JSON.stringify(data, null, 2), MimeType.PLAIN_TEXT);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "FULL_PROJECT" })).setMimeType(ContentService.MimeType.JSON);
    } else {
      // ══════════════════════════════════════════════════════════
      // 📁 व्यक्तिगत दुकान का बैकअप (अलग Store Subfolder)
      // ══════════════════════════════════════════════════════════
      var rootStoresFolder = DriveApp.getFoldersByName("2_Dukaan_INDIVIDUAL_STORES_Backups").hasNext()
        ? DriveApp.getFoldersByName("2_Dukaan_INDIVIDUAL_STORES_Backups").next()
        : DriveApp.createFolder("2_Dukaan_INDIVIDUAL_STORES_Backups");
      
      var shopId = data.shop_id || 1;
      var cleanName = (data.shop_name || ("Store_" + shopId)).replace(/[^a-zA-Z0-9_\u0900-\u097F]/g, "_");
      var storeFolderName = "Store_" + cleanName + "_ID" + shopId;
      
      var subFolders = rootStoresFolder.getFoldersByName(storeFolderName);
      var storeFolder = subFolders.hasNext() ? subFolders.next() : rootStoresFolder.createFolder(storeFolderName);
      
      var storeFileName = "STORE_" + cleanName + "_" + timeStamp + ".json";
      storeFolder.createFile(storeFileName, JSON.stringify(data, null, 2), MimeType.PLAIN_TEXT);
      
      var latestS = storeFolder.getFilesByName("STORE_latest.json");
      if (latestS.hasNext()) {
        latestS.next().setContent(JSON.stringify(data, null, 2));
      } else {
        storeFolder.createFile("STORE_latest.json", JSON.stringify(data, null, 2), MimeType.PLAIN_TEXT);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "STORE", shop_id: shopId })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(gdriveScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const testVoice = () => {
    playSoundboxVoice(`${shopName || 'दुकान'} पर ₹500 प्राप्त हुए। धन्यवाद!`, true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-lg md:max-w-xl lg:max-w-2xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-150">
        {/* Pinned Header */}
        <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 bg-white/10 rounded-xl shrink-0">
              <Store className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base leading-tight truncate">
                {isEn ? 'Shop Profile & Settings' : 'दुकान प्रोफाइल व सेटिंग्स'}
              </h3>
              <p className="text-[11px] text-teal-100 font-medium truncate">
                {isEn ? 'Name, UPI, Soundbox & Google Drive Backup' : 'नाम, UPI, साउंडबॉक्स व Google Drive बैकअप'}
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Shop Logo Upload Card */}
          <div className="flex items-center gap-3.5 p-3 bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-900/60 rounded-2xl">
            <div className="relative shrink-0">
              {logo ? (
                <img
                  src={logo}
                  alt="Shop Logo"
                  className="w-16 h-16 rounded-full object-cover border-2 border-teal-600 shadow-xs"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-teal-700 to-emerald-600 text-white flex items-center justify-center font-black text-xl shadow-xs border-2 border-white">
                  {(shopName && shopName.slice(0, 1)) || <Store className="w-8 h-8" />}
                </div>
              )}
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-teal-700 hover:bg-teal-800 text-white shadow-xs"
                title={isEn ? 'Change Shop Logo' : 'दुकान का लोगो बदलें'}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-800 dark:text-white">{isEn ? 'Shop Logo' : 'दुकान का लोगो (Shop Logo)'}</h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isEn ? 'This logo appears on header, bills and statements' : 'यह लोगो ऐप के मुख्य हेडर, बिल और पर्ची पर दिखेगा'}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                >
                  <Upload className="w-3 h-3" />
                  <span>{logo ? (isEn ? 'Change Logo' : 'लोगो बदलें') : (isEn ? 'Upload Logo' : 'लोगो लगाएं')}</span>
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => setLogo(null)}
                    className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-[11px] font-bold flex items-center gap-1 transition-all"
                    title={isEn ? 'Remove Logo' : 'लोगो हटाएं'}
                  >
                    <Trash2 className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                    <span>{isEn ? 'Remove' : 'हटाएं'}</span>
                  </button>
                )}
              </div>
              <input
                type="file"
                ref={logoInputRef}
                onChange={handleLogoUpload}
                accept="image/*"
                className="hidden"
              />
            </div>
          </div>

          {/* Shop Name */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
              {isEn ? 'Shop Name*' : 'दुकान का नाम (Shop Name)*'}
            </label>
            <div className="relative">
              <Store className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder={isEn ? 'e.g. Mohit Kirana Store' : 'उदा: Mohit Kirana Store'}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Owner & Phone Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">{isEn ? 'Owner Name' : 'दुकानदार का नाम'}</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder={isEn ? 'Your Name' : 'आपका नाम'}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">{isEn ? 'Shop Phone No.' : 'दुकान का मोबाइल नं'}</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Recovery Email (फ्री सुरक्षित ईमेल OTP के लिए) */}
          <div className="bg-emerald-500/10 dark:bg-slate-800/80 border border-emerald-400/30 dark:border-emerald-500/20 rounded-2xl p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-emerald-950 dark:text-emerald-300 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{isEn ? 'Owner Recovery Email (for Free OTP)' : 'दुकानदार रिकवरी ईमेल (फ्री OTP के लिए)'}</span>
              </label>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-white/80 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                🔒 100% Free & Secure
              </span>
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isEn ? 'e.g. yourname@gmail.com' : 'उदा: apnaemail@gmail.com'}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[10px] text-emerald-700 dark:text-emerald-400 leading-tight">
              {isEn
                ? 'When resetting password, a 6-digit OTP will be securely sent to this email address for free.'
                : 'पासवर्ड या पिन भूल जाने पर 6-अंकों का गुप्त OTP सीधे इसी ईमेल पर मुफ़्त में भेजा जाएगा।'}
            </p>
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">{isEn ? 'Shop Address' : 'दुकान का पता (Address)'}</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={isEn ? 'e.g. Main Market, Shop No. 12' : 'उदा: मुख्य बाजार, सिनेमा रोड, दुकान नं 12'}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* UPI ID */}
          <div className="bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-300">
              <QrCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{isEn ? 'Shop UPI ID (for QR Code)' : 'दुकान की UPI ID (QR कोड के लिए)'}</span>
            </div>
            <input
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="उदा: 9876543210@paytm या yourname@okhdfcbank"
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold text-emerald-950 dark:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Security PIN & Password (एंटी-टैम्परिंग सुरक्षा) */}
          <div className="bg-gradient-to-br from-slate-50 to-rose-50/30 dark:from-slate-800/80 dark:to-rose-950/30 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                <Lock className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>{isEn ? 'Master Security PIN & Anti-Tamper' : 'मालिक मास्टर सुरक्षा पिन (Anti-Tamper Lock)'}</span>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                🛡️ {isEn ? 'Protected' : 'सुरक्षित'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  {isEn ? 'Master Security PIN' : 'मालिक सुरक्षा पिन (PIN)'}
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="•••• (बदलने के लिए लिखें)"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-black text-center tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  {isEn ? 'Owner Password' : 'मालिक पासवर्ड (Password)'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="•••••••• (बदलने के लिए लिखें)"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              🔒 <strong>सुरक्षित एनक्रिप्शन:</strong> पिन व पासवर्ड डेटाबेस में सीधे सेव होने के बजाय 100% एनक्रिप्ट होकर सेव रहते हैं। यदि आप इन्हें नहीं बदलना चाहते तो खाली छोड़ दें।
            </p>

            <div className="p-2 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-bold text-slate-800 dark:text-white">
                🛡️ {isEn ? 'Anti-Fraud & Security Guarantee:' : 'हेराफेरी से बचाव सुरक्षा गारंटी:'}
              </p>
              <p>• {isEn ? 'No staff member or unauthorized person can delete transactions without this PIN.' : 'बिना इस पिन के कोई भी स्टाफ या अन्य व्यक्ति खाता रिकॉर्ड डिलीट नहीं कर सकता।'}</p>
              <p>• {isEn ? 'Cancelled records are struck-through (cut mark) with time & reason for permanent audit.' : 'डिलीट करने पर रिकॉर्ड हमेशा के लिए मिटने के बजाय लाल कट-मार्क (रद्द) के साथ सुरक्षित रहता है।'}</p>
            </div>
          </div>

          {/* 👥 Shop Staff / Counter Members WhatsApp */}
          <div className="bg-amber-500/10 dark:bg-slate-800/80 border border-amber-400/30 dark:border-amber-500/20 rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500 text-white rounded-lg shadow-2xs">
                <Users className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-950 dark:text-amber-200">{isEn ? 'Staff / Counter WhatsApp Numbers' : 'दुकान स्टाफ / सहायक WhatsApp नंबर'}</h4>
                <p className="text-[10px] text-amber-700 dark:text-amber-300">
                  {isEn ? 'Instant Mandi price alerts will be sent to these numbers' : 'मंडी में नया भाव मिलने पर एक क्लिक में इन नंबरों पर अलर्ट स्लिप जाएगी'}
                </p>
              </div>
            </div>
            <input
              type="text"
              value={staffPhones}
              onChange={(e) => setStaffPhones(e.target.value)}
              placeholder={isEn ? 'e.g. 9876543210, 8765432109 (comma separated)' : 'उदा: 9876543210, 8765432109 (कॉमा लगाकर कई नंबर लिख सकते हैं)'}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* ☁️ GOOGLE DRIVE AUTO BACKUP SECTION */}
          <div className="bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-slate-800/90 dark:to-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800/80 rounded-2xl p-3.5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-600 text-white rounded-xl shadow-2xs">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-indigo-950 dark:text-indigo-200 flex items-center gap-1">
                    <span>{isEn ? 'Google Drive Auto Backup' : 'Google Drive ऑटो बैकअप'}</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </h4>
                  <p className="text-[10px] text-indigo-700 dark:text-indigo-300">
                    {isEn ? 'Data will never be deleted or lost' : 'डेटा कभी डिलीट या मिस नहीं होगा'}
                  </p>
                </div>
              </div>

              {/* Auto Backup Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[10px] font-bold text-indigo-900 dark:text-indigo-200">
                  {autoBackupEnabled ? (isEn ? 'ON' : 'चालू') : (isEn ? 'OFF' : 'बंद')}
                </span>
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </label>
            </div>

            {/* Last Backup Status pill */}
            <div className="bg-white/90 dark:bg-slate-800/90 p-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 font-medium">{isEn ? 'Last Backup Status:' : 'अंतिम बैकअप स्थिति:'}</span>
              <span className="font-bold text-slate-800 dark:text-white">
                {lastBackupTime ? `${lastBackupTime}` : (isEn ? 'Not yet' : 'अभी तक नहीं')}
                {lastBackupStatus && (
                  <span className={`ml-1 text-[10px] ${lastBackupStatus.includes('सफल') || lastBackupStatus.includes('Success') ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    [{lastBackupStatus}]
                  </span>
                )}
              </span>
            </div>

            {/* Google Drive Webhook URL Input */}
            <div>
              <label className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200 block mb-1">
                {isEn ? 'Google Drive Webhook URL:' : 'Google Drive Webhook URL (वेबहूक लिंक):'}
              </label>
              <input
                type="url"
                value={gdriveWebhookUrl}
                onChange={(e) => setGdriveWebhookUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Sync Feedback Message */}
            {syncMsg && (
              <div className={`p-2 rounded-xl text-xs font-bold ${
                syncMsg.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
              }`}>
                {syncMsg.text}
              </div>
            )}

            {/* Store Isolation Assurance */}
            <div className="bg-indigo-50/80 dark:bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-950 dark:text-indigo-200">
              <span className="font-extrabold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                <span>🏪</span>
                <span>{isEn ? 'Individual Store Backup (Isolated)' : 'दुकान-वार व्यक्तिगत बैकअप (Isolated Store Data)'}</span>
              </span>
              <p className="text-[10px] text-indigo-800/80 dark:text-indigo-300/80 mt-1">
                {isEn 
                  ? 'This backup contains ONLY this store data. Full project master data is securely separated and kept by Super Admin.' 
                  : 'इस बैकअप में केवल आपकी दुकान का डेटा (ग्राहक, बिल, खाते) स्टोर होगा। पूरे प्रोजेक्ट का मास्टर बैकअप अलग सुपर एडमिन में रहता है।'}
              </p>
            </div>

            {/* Backup Content Assurance Badge */}
            <div className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-indigo-950 dark:text-indigo-200">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{isEn ? '100% Protected Backup Data:' : 'बैकअप में 100% सुरक्षित डेटा:'}</span>
              </div>
              <div className="flex flex-wrap gap-1 text-[10px] text-slate-700 dark:text-slate-300">
                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                  ✓ {isEn ? 'Customers & Ledger' : 'ग्राहक व उधार-जमा'}
                </span>
                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                  ✓ {isEn ? '📸 Bill Photos' : '📸 बिल पर्चियों की फोटो'}
                </span>
                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                  ✓ {isEn ? 'Rate List' : 'रेट लिस्ट व भाव'}
                </span>
                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                  ✓ {isEn ? 'Logo & Settings' : 'दुकान लोगो व सेटिंग्स'}
                </span>
              </div>
            </div>

            {/* Manual Sync & Download Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={syncingDrive}
                onClick={handleManualDriveSync}
                className="py-2 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-2xs active:scale-95 transition-all disabled:opacity-50"
              >
                {syncingDrive ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>{isEn ? 'Uploading...' : 'अपलोड हो रहा है...'}</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-3 h-3 text-sky-200" />
                    <span>{isEn ? '☁️ Sync to Drive' : '☁️ अभी Drive पर भेजें'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadBackup}
                className="py-2 px-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-2xs active:scale-95 transition-all"
                title={isEn ? 'Download entire backup in JSON' : 'पूरा बैकअप JSON फाइल में डाउनलोड करें'}
              >
                <Download className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>{isEn ? '📥 Download JSON' : '📥 बैकअप डाउनलोड'}</span>
              </button>
            </div>

            {/* Restore from File */}
            <div className="pt-1 flex items-center justify-between text-[11px] border-t border-indigo-100 dark:border-indigo-900/50">
              <span className="text-indigo-800 dark:text-indigo-300 font-medium">{isEn ? 'Restore from PC/Phone file:' : 'फ़ोन/PC बैकअप से रीस्टोर:'}</span>
              <button
                type="button"
                onClick={() => restoreFileInputRef.current?.click()}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200 font-bold hover:bg-indigo-50 dark:hover:bg-slate-700 flex items-center gap-1"
              >
                <Upload className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>{isEn ? 'Choose File' : 'फ़ाइल चुनें'}</span>
              </button>
              <input
                ref={restoreFileInputRef}
                type="file"
                accept=".json"
                onChange={handleRestoreFile}
                className="hidden"
              />
            </div>

            {/* Setup Guide Collapsible */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowDriveHelper(!showDriveHelper)}
                className="text-[11px] text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 font-bold flex items-center gap-1 w-full justify-between"
              >
                <span>{isEn ? '📖 How to set up Google Drive auto backup in 1-min?' : '📖 1-मिनट में Google Drive ऑटो बैकअप कैसे सेट करें?'}</span>
                {showDriveHelper ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showDriveHelper && (
                <div className="mt-2 p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-800 text-[11px] space-y-2 text-slate-700 dark:text-slate-300 animate-in fade-in duration-150">
                  <ol className="list-decimal list-inside space-y-1 font-medium text-slate-800 dark:text-slate-200">
                    <li>अपने गूगल अकाउंट में <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 underline font-bold">script.google.com</a> खोलें।</li>
                    <li><strong>New project</strong> पर क्लिक करके पुराना कोड हटा दें।</li>
                    <li>नीचे दिया गया कोड कॉपी करके वहां पेस्ट करें:</li>
                  </ol>

                  <div className="relative">
                    <pre className="p-2 bg-slate-900 dark:bg-slate-950 text-emerald-300 rounded-lg text-[9px] border border-slate-800 overflow-x-auto font-mono max-h-24">
                      {gdriveScriptCode}
                    </pre>
                    <button
                      type="button"
                      onClick={copyScriptToClipboard}
                      className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] flex items-center gap-1 shadow-2xs"
                    >
                      {copiedScript ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedScript ? 'कॉपी हो गया' : 'कोड कॉपी'}</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-600 dark:text-slate-400">
                    4. ऊपर <strong>Deploy &gt; New deployment &gt; Web app</strong> चुनें, <em>Who has access</em> में <strong>Anyone</strong> करें, और मिले वेबहूक लिंक को ऊपर पेस्ट करें।
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Smart Soundbox Setting Card */}
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{isEn ? 'Smart Soundbox Voice' : 'स्मार्ट साउंडबॉक्स वॉइस'}</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isEn ? 'Announces amount when udhaar/jama is entered' : 'उधार या जमा होने पर आवाज़ से पुष्टि करेगा'}
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleSoundbox}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  soundboxEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform ${
                    soundboxEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <button
              type="button"
              onClick={testVoice}
              className="w-full py-1.5 px-3 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-teal-800 dark:text-teal-200 border border-slate-200 dark:border-slate-600 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>{isEn ? 'Test Soundbox (Play Demo Voice)' : 'साउंडबॉक्स टेस्ट करें (Play Demo Voice)'}</span>
            </button>
          </div>

          {/* Success Message */}
          {savedSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs font-bold text-center flex items-center justify-center gap-1.5 animate-in zoom-in-95">
              <Check className="w-4 h-4" />
              <span>{isEn ? 'Settings and backup saved successfully!' : 'दुकान सेटिंग्स व बैकअप सुरक्षित हो गया!'}</span>
            </div>
          )}
          </div>

          {/* Pinned Submit Actions Footer */}
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
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all active:scale-98"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Saving...' : 'सेव हो रहा है...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEn ? 'Save Settings' : 'सेटिंग्स सुरक्षित करें'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
