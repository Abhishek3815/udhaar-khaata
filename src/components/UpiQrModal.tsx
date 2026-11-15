import React, { useState, useRef, useEffect } from 'react';
import { X, QrCode, Download, Share2, Copy, Check, MessageCircle, ExternalLink, Store, Sparkles, Image as ImageIcon, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import { Customer, ShopSettings } from '../types';
import { formatCurrency, playSoundboxVoice } from '../utils/speech';
import { useLanguage } from '../context/LanguageContext';

interface UpiQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  settings: ShopSettings;
}

export const UpiQrModal: React.FC<UpiQrModalProps> = ({
  isOpen,
  onClose,
  customer,
  settings
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [amount, setAmount] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [localQrUrl, setLocalQrUrl] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && customer) {
      const balance = Math.max(customer.net_balance || 0, 0);
      setAmount(balance || 500);
      setCopiedLink(false);
      setCopiedUpi(false);
      setCopiedImage(false);
      setToastMessage(null);
    }
  }, [isOpen, customer]);

  const upiId = settings.upi_id || '9876543210@paytm';
  const shopName = settings.shop_name || 'दुकान खाता';
  const custName = customer?.name || 'ग्राहक';

  // Standard NPCI UPI URI
  const upiPayUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`${custName} Udhaar Payment`)}`;

  // Web Payment Page URL
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const webPayUrl = `${origin}/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName)}&am=${amount}&cust=${encodeURIComponent(custName)}`;

  // Generate crisp QR code locally
  useEffect(() => {
    if (!isOpen || !customer) return;
    QRCode.toDataURL(upiPayUrl, {
      width: 380,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    }).then(url => {
      setLocalQrUrl(url);
    }).catch(err => {
      console.warn('Local QRCode generation error, using fallback:', err);
      setLocalQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(upiPayUrl)}`);
    });
  }, [isOpen, customer, upiPayUrl]);

  if (!isOpen || !customer) return null;

  // Show a toast message for 4 seconds
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4500);
  };

  // Helper to generate the complete styled Dukaan QR Poster on an offscreen canvas
  const generateQrCardCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;

    // 1. Background Gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 800);
    grad.addColorStop(0, '#0f766e');
    grad.addColorStop(0.32, '#064e3b');
    grad.addColorStop(0.32, '#f8fafc');
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 800);

    // 2. Header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(shopName, 300, 60);

    ctx.fillStyle = '#99f6e4';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('UPI से किसी भी ऐप द्वारा स्कैन करके भुगतान करें', 300, 95);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.fillText(`UPI ID: ${upiId}`, 300, 125);

    // 3. Card Container for QR
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.roundRect(80, 160, 440, 500, 24);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // 4. Draw QR Code
    const qrImg = new Image();
    qrImg.src = localQrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(upiPayUrl)}`;
    await new Promise((resolve) => {
      qrImg.onload = resolve;
      qrImg.onerror = resolve; // proceed even on error
    });
    ctx.drawImage(qrImg, 140, 190, 320, 320);

    // 5. Amount & Customer Text
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(`₹${amount.toLocaleString('en-IN')}`, 300, 560);

    ctx.fillStyle = '#047857';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`ग्राहक: ${custName}`, 300, 600);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.fillText('दुकान उधारी बकाया भुगतान', 300, 630);

    // 6. Footer Supported Apps
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('Google Pay  •  PhonePe  •  Paytm  •  BHIM UPI', 300, 720);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText(`दिनांक: ${new Date().toLocaleDateString('hi-IN')}`, 300, 755);

    return canvas;
  };

  const getQrBlob = async (): Promise<Blob | null> => {
    try {
      const canvas = await generateQrCardCanvas();
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
    } catch (err) {
      console.warn('Canvas blob error:', err);
      return null;
    }
  };

  // 1. WhatsApp Action (Primary)
  const handleSendWhatsApp = async () => {
    setSendingWa(true);
    try {
      const cleanPhone = (customer.phone || '').replace(/[^0-9]/g, '');
      const formattedPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;

      const shareText = `नमस्ते ${custName} जी! 🙏\n\n` +
        `दुकान *${shopName}* से बकाया उधार भुगतान हेतु UPI QR कोड:\n\n` +
        `💰 *कुल बकाया राशि: ₹${amount.toLocaleString('en-IN')}*\n` +
        `📲 *दुकान UPI ID:* \`${upiId}\`\n\n` +
        `👉 *सीधे PhonePe / Google Pay / Paytm से ऑनलाइन पे करने के लिए क्लिक करें:*\n` +
        `${webPayUrl}\n\n` +
        `कृपया भुगतान करने के बाद सूचित करें। धन्यवाद!\n- *${shopName}*`;

      const blob = await getQrBlob();

      // Case A: Modern Web Share API with image file (Android Chrome / iOS Safari)
      if (blob && typeof navigator !== 'undefined' && navigator.canShare) {
        const file = new File([blob], `QR-${shopName}-Rs${amount}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${shopName} QR Code`,
            text: shareText
          });
          showToast('✅ QR कोड WhatsApp / शेयर में खुल गया है!');
          setSendingWa(false);
          return;
        }
      }

      // Case B: Desktop PC / WhatsApp Web:
      // 1) Copy QR image directly to clipboard so user can just Ctrl+V into WhatsApp chat!
      if (blob && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          setCopiedImage(true);
          showToast('📋 QR कोड कॉपी हो गया है! WhatsApp खुलने पर चैट में बस Ctrl + V (Paste) दबाकर भेजें!');
        } catch (clipErr) {
          console.warn('Clipboard image write failed:', clipErr);
        }
      }

      // 2) Also auto-download the card so they have the image file ready
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `UPI-QR-${custName.replace(/\s+/g, '_')}-Rs${amount}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }

      // 3) Open WhatsApp Chat
      const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(shareText)}`;
      window.open(waUrl, '_blank');
    } catch (err: any) {
      console.error('Failed to send on WhatsApp:', err);
      // Fallback direct URL
      const cleanPhone = (customer.phone || '').replace(/[^0-9]/g, '');
      const waUrl = `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}`;
      window.open(waUrl, '_blank');
    } finally {
      setSendingWa(false);
    }
  };

  // 2. Copy QR Code Image to Clipboard
  const handleCopyQrImage = async () => {
    try {
      const blob = await getQrBlob();
      if (blob && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopiedImage(true);
        showToast('✅ QR कोड इमेज कॉपी हो गई! कहीं भी (WhatsApp, Mail) Paste करें।');
        setTimeout(() => setCopiedImage(false), 3000);
      } else {
        showToast('⚠️ इस ब्राउज़र में डायरेक्ट इमेज कॉपी सपोर्ट नहीं है, डाउनलोड बटन उपयोग करें।');
      }
    } catch (err) {
      console.warn('Copy QR Image failed:', err);
      showToast('⚠️ इमेज कॉपी नहीं हो सकी। कृपया डाउनलोड बटन का उपयोग करें।');
    }
  };

  // 3. Download QR Poster Card
  const handleDownloadQrCard = async () => {
    setDownloading(true);
    try {
      const canvas = await generateQrCardCanvas();
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `UPI-QR-${custName.replace(/\s+/g, '_')}-Rs${amount}.png`;
      a.click();
      showToast('📥 QR पोस्टर डाउनलोड हो गया है!');
    } catch (e) {
      console.error('Failed to download QR card:', e);
      if (localQrUrl) {
        window.open(localQrUrl, '_blank');
      }
    } finally {
      setDownloading(false);
    }
  };

  // 4. Copy Payment Link
  const handleCopyPayLink = () => {
    navigator.clipboard.writeText(webPayUrl);
    setCopiedLink(true);
    showToast('🔗 ऑनलाइन पेमेंट लिंक कॉपी हो गया!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // 5. Copy UPI ID
  const handleCopyUpiId = () => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    showToast(`📲 UPI ID (${upiId}) कॉपी हो गई!`);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-md sm:max-w-lg bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto border border-slate-100 dark:border-slate-800">
        {/* Pinned Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 bg-white/10 rounded-xl text-emerald-300 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base truncate">
                {isEn ? 'UPI Payment QR Code' : 'UPI पेमेंट QR कोड'}
              </h3>
              <p className="text-xs text-teal-100/90 truncate">
                {isEn ? `Send QR to ${custName} or let them scan` : `${custName} को WhatsApp पर QR भेजें या स्कैन कराएं`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold text-center animate-in fade-in slide-in-from-top-2 duration-150 shadow-sm flex items-center justify-center gap-1.5 shrink-0">
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Amount Box */}
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                {isEn ? 'Payment Amount (in ₹)' : 'भुगतान राशि (Amount in ₹)'}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {isEn ? 'Change amount as needed' : 'जरूरत अनुसार राशि बदल सकते हैं'}
              </span>
            </div>
            <div className="relative w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-extrabold text-slate-400 dark:text-slate-500">₹</span>
              <input
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(Math.max(Number(e.target.value) || 0, 0))}
                className="w-full pl-7 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-base font-extrabold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 text-right"
              />
            </div>
          </div>

          {/* QR Code Presentation Card */}
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 text-center shadow-xs flex flex-col items-center">
            {/* Shop Details */}
            <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200 font-extrabold text-sm mb-1">
              {settings.logo ? (
                <img src={settings.logo} alt="Shop Logo" className="w-7 h-7 rounded-full object-cover border border-teal-600 shadow-2xs" />
              ) : (
                <Store className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              )}
              <span>{shopName}</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 font-mono">
              UPI: <span className="font-semibold text-slate-700 dark:text-slate-200">{upiId}</span>
            </div>

            {/* QR Image Container (Always crisp white background for scanner cameras & high-contrast dark text) */}
            <div
              className="p-3 qr-code-box rounded-2xl border shadow-md inline-block relative group"
              style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a' }}
            >
              {localQrUrl ? (
                <img
                  src={localQrUrl}
                  alt={`UPI QR ₹${amount}`}
                  className="w-56 h-56 object-contain rounded-lg"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center bg-slate-100 rounded-lg">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                </div>
              )}
              <div
                className="text-[11px] font-bold mt-2 flex items-center justify-center gap-1"
                style={{ color: '#0f172a' }}
              >
                <span>{isEn ? `Scan & Pay ₹${amount.toLocaleString('en-IN')}` : `स्कैन करें और ₹${amount.toLocaleString('en-IN')} पे करें`}</span>
              </div>
            </div>

            {/* Supported payment apps */}
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-300 bg-white/80 dark:bg-slate-800/90 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
              <span className="text-blue-600 dark:text-blue-400">GPay</span>
              <span>•</span>
              <span className="text-purple-600 dark:text-purple-400">PhonePe</span>
              <span>•</span>
              <span className="text-sky-600 dark:text-sky-400">Paytm</span>
              <span>•</span>
              <span className="text-emerald-700 dark:text-emerald-400">BHIM UPI</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {/* 1. Main Send via WhatsApp Button */}
            <button
              onClick={handleSendWhatsApp}
              disabled={sendingWa}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-700/20 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              {sendingWa ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              <span>
                {sendingWa
                  ? (isEn ? 'Preparing QR for WhatsApp...' : 'WhatsApp पर QR भेजा जा रहा है...')
                  : (isEn ? 'Send QR & Payment Link via WhatsApp' : 'ग्राहक को WhatsApp पर QR कोड व लिंक भेजें')}
              </span>
            </button>

            {/* 2. Copy QR Image & Download Poster Grid */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCopyQrImage}
                className="py-2.5 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 text-teal-900 dark:text-teal-200 border border-teal-200 dark:border-teal-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-98"
                title="QR कोड की फोटो कॉपी करें (WhatsApp चैट में सीधे Ctrl+V करें)"
              >
                {copiedImage ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <ImageIcon className="w-3.5 h-3.5 text-teal-700 dark:text-teal-300" />}
                <span>{copiedImage ? (isEn ? 'Photo Copied!' : 'फोटो कॉपी हो गई!') : (isEn ? 'Copy QR Image' : 'QR फोटो कॉपी करें')}</span>
              </button>

              <button
                onClick={handleDownloadQrCard}
                disabled={downloading}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-98"
                title="पूरा QR पोस्टर इमेज डाउनलोड करें"
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />}
                <span>
                  {downloading
                    ? (isEn ? 'Downloading...' : 'डाउनलोड हो रहा है...')
                    : (isEn ? 'Download Poster' : 'QR पोस्टर डाउनलोड')}
                </span>
              </button>
            </div>

            {/* 3. Copy Link or Copy UPI ID */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleCopyPayLink}
                className="py-2 px-3 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all"
                title="PhonePe / GPay 1-क्लिक पेमेंट वेब लिंक कॉपी करें"
              >
                {copiedLink ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500 dark:text-slate-400" />}
                <span>{copiedLink ? (isEn ? 'Link Copied!' : 'लिंक कॉपी हो गया!') : (isEn ? 'Copy Pay Link' : 'पेमेंट लिंक कॉपी')}</span>
              </button>

              <button
                onClick={handleCopyUpiId}
                className="py-2 px-3 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all"
                title="दुकान की UPI ID कॉपी करें"
              >
                {copiedUpi ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500 dark:text-slate-400" />}
                <span>{copiedUpi ? (isEn ? 'UPI ID Copied!' : 'UPI ID कॉपी हो गई!') : (isEn ? 'Copy UPI' : 'UPI ID कॉपी')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
