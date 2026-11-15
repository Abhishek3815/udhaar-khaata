import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Smartphone, CheckCircle2, X } from 'lucide-react';
import QRCode from 'qrcode';

interface HotspotSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'hi' | 'en';
  isOnline: boolean;
  pendingSyncCount: number;
  onManualSync: () => Promise<void>;
  syncing: boolean;
}

export const HotspotSyncModal: React.FC<HotspotSyncModalProps> = ({
  isOpen,
  onClose,
  lang,
  isOnline,
  pendingSyncCount,
  onManualSync,
  syncing
}) => {
  const isEn = lang === 'en';
  const [networkInfo, setNetworkInfo] = useState<{
    localIps: { interface: string; ip: string; url: string }[];
    primaryUrl: string;
    port: number;
  } | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/network/status')
        .then(res => res.json())
        .then(async data => {
          if (data.success) {
            setNetworkInfo(data);
            if (data.primaryUrl) {
              const qr = await QRCode.toDataURL(data.primaryUrl, {
                width: 200,
                margin: 1,
                color: { dark: '#042f2e', light: '#ffffff' }
              });
              setQrCodeDataUrl(qr);
            }
          }
        })
        .catch(err => console.warn('Could not load network status:', err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-lg md:max-w-xl lg:max-w-2xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92dvh] my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-white/10 text-amber-300">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                {isEn ? 'Offline Mode & Hotspot Multi-Device Sync' : '📶 बिना इंटरनेट / हॉटस्पॉट मल्टी-डिवाइस सिंक'}
              </h3>
              <p className="text-[11px] text-teal-100/90 font-medium">
                {isEn
                  ? 'Works 100% offline & syncs live across devices connected to same WiFi / Hotspot'
                  : 'बिना इंटरनेट भी चलेगा और एक ही हॉटस्पॉट से जुड़े सभी फोन/लैपटॉप में रियल-टाइम चलेगा'}
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

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          {/* Current Status Banner */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
            isOnline 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/80 text-emerald-950 dark:text-emerald-100'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/80 text-amber-950 dark:text-amber-100'
          }`}>
            <div className="flex items-center gap-3">
              {isOnline ? (
                <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm shrink-0">
                  <Wifi className="w-5 h-5" />
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-amber-500 text-white shadow-sm shrink-0">
                  <WifiOff className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="font-extrabold text-sm flex items-center gap-2">
                  <span>{isOnline ? (isEn ? 'Internet Connected (Online)' : 'ऑनलाइन / इंटरनेट कनेक्टेड है') : (isEn ? 'Offline Mode Active' : 'ऑफलाइन मोड सक्रिय है')}</span>
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                </div>
                <div className="text-xs opacity-90 mt-0.5">
                  {pendingSyncCount > 0 ? (
                    <span className="font-bold text-amber-700 dark:text-amber-300">
                      ⚠️ {pendingSyncCount} {isEn ? 'entries waiting to sync to server' : 'एंट्री ऑफलाइन सुरक्षित हैं, सर्वर पर सिंक होना बाकी है'}
                    </span>
                  ) : (
                    <span className="text-emerald-800 dark:text-emerald-300 font-semibold">✅ {isEn ? 'All data is 100% synchronized' : 'सभी रिकॉर्ड्स पूरी तरह सिंक हैं'}</span>
                  )}
                </div>
              </div>
            </div>

            {pendingSyncCount > 0 && (
              <button
                type="button"
                onClick={onManualSync}
                disabled={syncing}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 active:scale-95 transition-all shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{isEn ? 'Sync Now' : 'अभी सिंक करें'}</span>
              </button>
            )}
          </div>

          {/* Section: How to connect other devices via Hotspot without internet */}
          <div className="bg-slate-50 dark:bg-slate-800/80 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-extrabold text-sm">
              <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{isEn ? 'Connect Mobile / Laptop on Same Hotspot' : '📲 एक ही हॉटस्पॉट से अन्य मोबाइल या कंप्यूटर कैसे जोड़ें:'}</span>
            </div>

            <ol className="text-xs space-y-2 text-slate-700 dark:text-slate-300 list-decimal list-inside leading-relaxed font-medium">
              <li>
                {isEn
                  ? 'Turn on Mobile Hotspot or connect both devices to the same shop Wi-Fi (No active internet needed!).'
                  : 'दुकान के मोबाइल का हॉटस्पॉट चालू करें या दोनों डिवाइस को एक ही वाईफाई/हॉटस्पॉट से जोड़ें (इंटरनेट होना ज़रूरी नहीं है)।'}
              </li>
              <li>
                {isEn
                  ? 'Scan the QR code below from your phone camera or browser, or type the Hotspot IP link:'
                  : 'दूसरे फोन या लैपटॉप के ब्राउज़र में नीचे दिया गया QR कोड स्कैन करें या लिंक खोलें:'}
              </li>
            </ol>

            {/* QR Code & Local URLs */}
            {networkInfo && (
              <div className="mt-3 p-3.5 bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-center gap-4 shadow-xs">
                {qrCodeDataUrl && (
                  <div
                    className="p-2.5 qr-code-box rounded-xl shadow-xs border border-slate-200 shrink-0 text-center"
                    style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
                  >
                    <img src={qrCodeDataUrl} alt="Hotspot QR Code" className="w-28 h-28 mx-auto" />
                    <span
                      className="text-[10px] font-bold block mt-1"
                      style={{ color: '#0f172a' }}
                    >
                      {isEn ? 'Scan to Open' : 'स्कैन करके खोलें'}
                    </span>
                  </div>
                )}

                <div className="flex-1 w-full space-y-2 text-left">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {isEn ? 'Hotspot / Local Network Link:' : 'हॉटस्पॉट / लोकल नेटवर्क लिंक:'}
                  </div>

                  {networkInfo.localIps && networkInfo.localIps.length > 0 ? (
                    networkInfo.localIps.map((net, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-teal-50 dark:bg-slate-800 border border-teal-200 dark:border-slate-700">
                        <div className="font-mono font-bold text-xs text-teal-900 dark:text-teal-200 truncate mr-2">
                          {net.url}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(net.url)}
                          className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] shrink-0 transition-colors shadow-2xs"
                        >
                          {copiedUrl === net.url ? (isEn ? 'Copied!' : 'कॉपी हुआ!') : (isEn ? 'Copy' : 'कॉपी')}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 font-mono">
                      http://localhost:3000
                    </div>
                  )}

                  <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                    💡 {isEn
                      ? 'Any device on this hotspot can view and add entries simultaneously. The database stays centrally synchronized!'
                      : 'इस लिंक से खुलने पर सभी फोन/सिस्टम में वही डेटा दिखेगा और एक डिवाइस में एंट्री करने पर तुरंत दूसरे में भी दिखेगी!'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section: Automatic Sync explanation */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-sky-50 dark:bg-slate-800/80 border border-sky-200 dark:border-slate-700 text-xs space-y-2">
            <div className="font-extrabold flex items-center gap-1.5 text-sky-950 dark:text-sky-300 text-xs">
              <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>{isEn ? 'Automatic Synchronization (No Manual Effort)' : '⚡ ऑटो-सिंक्रोनाइज़ेशन कैसे काम करता है:'}</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
              <li>
                {isEn
                  ? 'If internet goes off, you can continue taking Udhaar, Jama, or Product bills without any stopping.'
                  : 'यदि इंटरनेट चला जाता है, तो भी आप बिना रुके उधार-जमा और बिल की प्रविष्टियां कर सकते हैं।'}
              </li>
              <li>
                {isEn
                  ? 'All entries are safely kept in device offline storage.'
                  : 'सभी प्रविष्टियां आपके डिवाइस के सुरक्षित ऑफलाइन स्टोरेज में सुरक्षित रहती हैं।'}
              </li>
              <li>
                {isEn
                  ? 'As soon as internet or local network returns, everything auto-syncs in the background!'
                  : 'जैसे ही इंटरनेट या दुकान का हॉटस्पॉट दोबारा जुड़ता है, सारा डाटा बैकग्राउंड में अपने आप मुख्य सर्वर पर सिंक हो जाता है।'}
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs active:scale-95 transition-all shadow-sm"
          >
            {isEn ? 'Got it' : 'ठीक है / समझ गया'}
          </button>
        </div>
      </div>
    </div>
  );
};
