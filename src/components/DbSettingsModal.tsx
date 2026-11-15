import React, { useState } from 'react';
import { X, Database, Check, Copy, CheckCheck, RefreshCw, AlertCircle } from 'lucide-react';
import { DbStatus, ShopSettings } from '../types';

interface DbSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbStatus: DbStatus | null;
  settings: ShopSettings;
  onSaveSettings: (settings: Partial<ShopSettings>) => Promise<void>;
  onRefreshStatus: () => void;
}

export const DbSettingsModal: React.FC<DbSettingsModalProps> = ({
  isOpen,
  onClose,
  dbStatus,
  settings,
  onSaveSettings,
  onRefreshStatus
}) => {
  const [shopName, setShopName] = useState(settings.shop_name);
  const [ownerName, setOwnerName] = useState(settings.owner_name);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [upiId, setUpiId] = useState(settings.upi_id);
  const [savingSettings, setSavingSettings] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'xampp' | 'env' | 'schema' | 'shop'>('status');

  React.useEffect(() => {
    if (isOpen) {
      setShopName(settings.shop_name);
      setOwnerName(settings.owner_name);
      setPhone(settings.phone);
      setAddress(settings.address);
      setUpiId(settings.upi_id);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const isMySQL = dbStatus?.isMySQLConnected;

  const handleSaveShopSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await onSaveSettings({
        shop_name: shopName,
        owner_name: ownerName,
        phone,
        address,
        upi_id: upiId
      });
      alert('दुकान का विवरण सफलतापूर्वक सुरक्षित कर लिया गया!');
    } catch (err) {
      console.error(err);
    } finally {
      setSavingSettings(false);
    }
  };

  const sampleSql = `-- Dukaan Khaata & Stock MySQL Schema
CREATE DATABASE IF NOT EXISTS \`dukaan_khaata_db\`;
USE \`dukaan_khaata_db\`;

CREATE TABLE IF NOT EXISTS \`customers\` (
  \`id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`name\` VARCHAR(150) NOT NULL,
  \`phone\` VARCHAR(25) DEFAULT '',
  \`address\` VARCHAR(255) DEFAULT '',
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS \`transactions\` (
  \`id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`customer_id\` INT NOT NULL,
  \`type\` ENUM('udhaar', 'jama') NOT NULL,
  \`amount\` DECIMAL(10, 2) NOT NULL,
  \`notes\` TEXT NULL,
  \`date\` VARCHAR(30) NOT NULL,
  \`voice_recorded\` TINYINT(1) DEFAULT 0,
  INDEX (\`customer_id\`)
);

CREATE TABLE IF NOT EXISTS \`products\` (
  \`id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`name\` VARCHAR(150) NOT NULL,
  \`category\` VARCHAR(100) DEFAULT 'General',
  \`unit\` VARCHAR(30) DEFAULT 'पैकेट',
  \`purchase_price\` DECIMAL(10, 2) NOT NULL,
  \`selling_price\` DECIMAL(10, 2) NOT NULL,
  \`stock_quantity\` DECIMAL(10, 2) DEFAULT 0,
  \`min_stock_alert\` DECIMAL(10, 2) DEFAULT 5
);`;

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sampleSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-lg md:max-w-2xl lg:max-w-3xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden border border-slate-100 dark:border-slate-800 my-auto">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">MySQL डेटाबेस व होस्टिंग सेटिंग्स</h3>
              <p className="text-xs text-slate-400">.env फ़ाइल और सर्वर विन्यास</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-5 pt-2 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('status')}
            className={`py-2 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'status'
                ? 'border-teal-600 text-teal-800 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            स्थिति (Status)
          </button>
          <button
            onClick={() => setActiveTab('xampp')}
            className={`py-2 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'xampp'
                ? 'border-teal-600 text-teal-800 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/30'
                : 'border-transparent text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300'
            }`}
          >
            ⚡ XAMPP सेटअप गाइड
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`py-2 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'env'
                ? 'border-teal-600 text-teal-800 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            .env फ़ाइल
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`py-2 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'schema'
                ? 'border-teal-600 text-teal-800 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            MySQL स्कीमा (SQL)
          </button>
          <button
            onClick={() => setActiveTab('shop')}
            className={`py-2 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'shop'
                ? 'border-teal-600 text-teal-800 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            दुकान प्रोफाइल
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 overscroll-contain">
          {/* TAB 1: STATUS */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-2xl border ${
                  isMySQL
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    {isMySQL ? (
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">
                        <Check className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-sm">
                        {isMySQL ? 'MySQL डेटाबेस सक्रिय है' : 'लोकल सुरक्षित स्टोरेज मोड (Fallback)'}
                      </h4>
                      <p className="text-xs opacity-90 mt-0.5">
                        {isMySQL
                          ? 'सभी डेटा सीधे आपके MySQL सर्वर में सुरक्षित हो रहा है।'
                          : 'MySQL सर्वर से संपर्क न होने पर दुकान का डेटा लोकल स्टोरेज में सुरक्षित रखा गया है।'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={onRefreshStatus}
                    className="p-1.5 rounded-lg bg-white/70 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs"
                    title="स्थिति रिफ्रेश करें"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {!isMySQL && dbStatus?.connectionError && (
                  <div className="mt-3 p-2 bg-amber-100/70 dark:bg-amber-900/50 rounded-xl text-[11px] font-mono text-amber-950 dark:text-amber-200">
                    कारण: {dbStatus.connectionError}
                  </div>
                )}
              </div>

              {/* Server & DB Details */}
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-2.5 text-xs">
                <h5 className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider text-[11px]">
                  सक्रिय सर्वर विवरण
                </h5>
                <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                  <div>
                    <span className="block text-[10px] text-slate-400">डेटाबेस प्रकार:</span>
                    <strong className="text-slate-800 dark:text-slate-100">{isMySQL ? 'MySQL 8.0+' : 'Persistent JSON'}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">MySQL होस्ट:</span>
                    <strong className="text-slate-800 dark:text-slate-100">{dbStatus?.env.host || 'localhost'}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">MySQL पोर्ट:</span>
                    <strong className="text-slate-800 dark:text-slate-100">{dbStatus?.env.port || '3306'}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">डेटाबेस नाम:</span>
                    <strong className="text-slate-800 dark:text-slate-100">{dbStatus?.env.database || 'dukaan_khaata_db'}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">होस्टिंग पोर्ट:</span>
                    <strong className="text-slate-800 dark:text-slate-100">{dbStatus?.env.serverPort || 3000}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">AI वॉइस इंजन:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400">सक्रिय (Hindi / Hinglish / Eng)</strong>
                  </div>
                </div>
              </div>

              {/* Demo Data Management Card */}
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <div>
                  <h5 className="font-bold text-xs text-teal-900 dark:text-teal-300 flex items-center gap-1.5">
                    <span>✨ डेमो डेटा प्रबंधन (Demo Data)</span>
                  </h5>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    अभी डेमो डिटेल्स भरी हैं। जब आप अपनी असली दुकान का डेटा डालना चाहें, तो नीचे दिए बटन से डेटा साफ या रीलोड कर सकते हैं:
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm('क्या आप डेमो डेटा दोबारा लोड करना चाहते हैं?')) {
                        await fetch('/api/demo/reset', { method: 'POST' });
                        onRefreshStatus();
                        alert('डेमो डेटा सफलतापूर्वक रीलोड हो गया!');
                      }
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-2xs active:scale-95 transition-all text-center"
                  >
                    🔁 डेमो डेटा रीलोड करें
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm('सावधानी: क्या आप सारा डेटा खाली करके नए सिरे से अपनी दुकान का खाता शुरू करना चाहते हैं?')) {
                        const enteredPin = prompt('सुरक्षा जांच: कृपया अपनी दुकान का 4-अंकों का सुरक्षा पिन (PIN) दर्ज करें:');
                        if (!enteredPin) return;
                        try {
                          const res = await fetch('/api/demo/clear', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pin: enteredPin })
                          });
                          const data = await res.json();
                          if (data.success) {
                            onRefreshStatus();
                            alert('दुकान का डेटा खाली कर दिया गया है। अब आप अपने असली ग्राहक व सामान जोड़ सकते हैं!');
                          } else {
                            alert(data.error || 'सुरक्षा पिन गलत है');
                          }
                        } catch {
                          alert('डेटा खाली करने में विफल रहा। सर्वर कनेक्शन जांचें।');
                        }
                      }
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-200 hover:bg-rose-100 text-slate-700 hover:text-rose-700 font-bold text-xs border border-slate-300 active:scale-95 transition-all text-center"
                  >
                    🗑️ डेटा खाली करें (शुरुआत)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: XAMPP SETUP GUIDE */}
          {activeTab === 'xampp' && (
            <div className="space-y-4 text-xs">
              {/* Direct Download ZIP button */}
              <div className="p-4 bg-gradient-to-r from-teal-800 to-emerald-800 text-white rounded-2xl shadow-md flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm text-amber-300">📦 पूरा प्रोजेक्ट कोड (.ZIP)</h4>
                  <p className="text-[11px] text-teal-100 mt-0.5">
                    पूरा कोड, .env, और MySQL schema.sql एक ज़िप फ़ाइल में
                  </p>
                </div>
                <a
                  href="/api/download-zip"
                  download="dukaan-khaata-app.zip"
                  className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 font-extrabold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>📥 ZIP डाउनलोड करें</span>
                </a>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-1">
                <p className="font-bold text-sm text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <span>🚀 अपने कम्प्यूटर पर XAMPP में चलाने के 5 आसान स्टेप्स:</span>
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300/80">
                  यह प्रोजेक्ट Node.js Express और MySQL पर बना है और XAMPP के साथ 100% कम्पैटिबल है।
                </p>
              </div>

              {/* Step 1 */}
              <div className="p-3 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-[11px]">1</span>
                  <strong className="text-slate-900 dark:text-slate-100 text-xs">XAMPP Control Panel शुरू करें:</strong>
                </div>
                <p className="text-slate-600 dark:text-slate-300 pl-7 text-[11px]">
                  XAMPP खोलें और <strong>Apache</strong> तथा <strong>MySQL</strong> दोनों के सामने "Start" बटन दबाएं (दोनों का बैकग्राउंड हरा हो जाएगा)।
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-3 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-[11px]">2</span>
                  <strong className="text-slate-900 dark:text-slate-100 text-xs">phpMyAdmin खोलें (डेटाबेस तैयार करें):</strong>
                </div>
                <p className="text-slate-600 dark:text-slate-300 pl-7 text-[11px]">
                  ब्राउज़र में खोलें: <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono text-teal-800 dark:text-teal-300">http://localhost/phpmyadmin</code><br />
                  (नोट: ऐप चालू होने पर खुद ही <strong>dukaan_khaata_db</strong> डेटाबेस और टेबल्स बना लेगी, या आप 'SQL' टैब में जाकर हमारे <strong>schema.sql</strong> का कोड भी पेस्ट कर सकते हैं!)
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-3 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-[11px]">3</span>
                  <strong className="text-slate-900 dark:text-slate-100 text-xs">.env फ़ाइल चेक करें (पहले से सेट है):</strong>
                </div>
                <div className="pl-7">
                  <div className="bg-slate-900 text-emerald-400 p-2.5 rounded-xl font-mono text-[10px] space-y-0.5">
                    <p>MYSQL_HOST="localhost"</p>
                    <p>MYSQL_PORT=3306</p>
                    <p>MYSQL_USER="root"</p>
                    <p>MYSQL_PASSWORD="" # XAMPP में पासवर्ड खाली रहता है</p>
                    <p>MYSQL_DATABASE="dukaan_khaata_db"</p>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-3 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-[11px]">4</span>
                  <strong className="text-slate-900 dark:text-slate-100 text-xs">टर्मिनल / CMD में रन करें:</strong>
                </div>
                <div className="pl-7 space-y-1.5">
                  <p className="text-slate-600 dark:text-slate-300 text-[11px]">प्रोजेक्ट फोल्डर में CMD या VS Code टर्मिनल खोलें और लिखें:</p>
                  <div className="bg-slate-900 text-emerald-400 p-2.5 rounded-xl font-mono text-xs">
                    <p>npm install</p>
                    <p className="mt-1">npm run dev</p>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="p-3 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-[11px]">5</span>
                  <strong className="text-slate-900 dark:text-slate-100 text-xs">ब्राउज़र या मोबाइल पर खोलें:</strong>
                </div>
                <p className="text-slate-600 dark:text-slate-300 pl-7 text-[11px]">
                  कंप्यूटर पर: <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono text-teal-800 dark:text-teal-300">http://localhost:3000</code><br />
                  मोबाइल फोन पर (सेम वाई-फाई): <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono text-teal-800 dark:text-teal-300">http://[आपकी-PC-का-IP]:3000</code> (जैसे 192.168.1.5:3000) खोलकर बोलकर एंट्री का पूरा आनंद लें!
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: .ENV FILE EXPLANATION */}
          {activeTab === 'env' && (
            <div className="space-y-3">
              <div className="p-3 bg-teal-50 dark:bg-teal-950/40 rounded-xl border border-teal-200 dark:border-teal-900/60 text-teal-900 dark:text-teal-200 text-xs">
                <p className="font-bold">प्रोजेक्ट में `.env` और `.env.example` दोनों मौजूद हैं!</p>
                <p className="mt-1 text-[11px] text-teal-800 dark:text-teal-300">
                  यदि आप इसे अपने कंप्यूटर (XAMPP / MySQL) या किसी लाइव होस्टिंग (cPanel, AWS, Railway) पर चला रहे हैं, तो `.env` में अपनी MySQL क्रेडेंशियल डालें:
                </p>
              </div>

              <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-2xl font-mono text-xs overflow-x-auto space-y-1">
                <p className="text-slate-500"># HOSTING SETTINGS</p>
                <p>PORT=3000</p>
                <p>HOST="0.0.0.0"</p>
                <p className="text-slate-500 pt-1"># MYSQL DATABASE</p>
                <p>DB_TYPE="mysql"</p>
                <p>MYSQL_HOST="localhost"</p>
                <p>MYSQL_PORT=3306</p>
                <p>MYSQL_USER="root"</p>
                <p>MYSQL_PASSWORD="your_password"</p>
                <p>MYSQL_DATABASE="dukaan_khaata_db"</p>
                <p>MYSQL_SSL="false"</p>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                नोट: अगर MySQL उपलब्ध नहीं होगा, तो भी दुकान का कोई डेटा नहीं खोएगा। सिस्टम ऑटोमैटिकली बैकअप स्टोरेज में सुरक्षित रखेगा।
              </p>
            </div>
          )}

          {/* TAB 3: MYSQL SCHEMA */}
          {activeTab === 'schema' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">MySQL टेबल्स बनाने के लिए SQL कोड:</p>
                <button
                  onClick={copySqlToClipboard}
                  className="px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1 shadow-2xs"
                >
                  {copiedSql ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'कॉपी हो गया!' : 'SQL कॉपी करें'}</span>
                </button>
              </div>

              <div className="bg-slate-900 text-slate-200 p-3.5 rounded-2xl font-mono text-[11px] max-h-56 overflow-y-auto leading-relaxed border border-slate-700">
                <pre>{sampleSql}</pre>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                यह SQL कोड phpMyAdmin, HeidiSQL, MySQL Workbench या AWS RDS में सीधे रन कर सकते हैं।
              </p>
            </div>
          )}

          {/* TAB 4: SHOP PROFILE */}
          {activeTab === 'shop' && (
            <form onSubmit={handleSaveShopSettings} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">दुकान का नाम (Shop Name)</label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">मालिक का नाम (Owner Name)</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">मोबाइल नंबर</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">UPI ID (तकादा संदेश के लिए)</label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="उदा: rajesh@okaxis, 9876543210@paytm"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">दुकान का पता</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{savingSettings ? 'सुरक्षित हो रहा है...' : 'दुकान प्रोफाइल अपडेट करें'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
