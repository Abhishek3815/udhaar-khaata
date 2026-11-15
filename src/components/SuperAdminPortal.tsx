import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Store,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  LogOut,
  ArrowLeft,
  KeyRound,
  Trash2,
  PauseCircle,
  PlayCircle,
  Phone,
  Calendar,
  Lock,
  ChevronRight,
  TrendingUp,
  CreditCard,
  ExternalLink,
  PlusCircle,
  Megaphone,
  Download,
  FileSpreadsheet,
  FileText,
  Eye,
  Info,
  DollarSign,
  MapPin,
  Mail,
  Sliders,
  Send,
  Cloud,
  CloudUpload,
  Copy,
  Check,
  Database
} from 'lucide-react';
import { AdminAuth, SuperAdminUser } from '../utils/auth';

export interface ShopItem {
  id: number;
  shop_name: string;
  owner_name: string;
  phone: string;
  email?: string;
  address?: string;
  upi_id?: string;
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  created_at: string;
  customer_count: number;
  transaction_count: number;
  total_udhaar: number;
  total_jama: number;
  net_due: number;
}

interface AdminStats {
  totalShops: number;
  pendingShops: number;
  approvedShops: number;
  suspendedShops: number;
  totalCustomers: number;
  totalTransactions: number;
  totalUdhaar: number;
  totalJama: number;
  marketDue: number;
}

interface PlatformNotice {
  id?: number;
  message: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  is_active: boolean;
  updated_at?: string;
}

interface ShopDetailsData {
  shop: ShopItem;
  top_customers: Array<{ id: number; name: string; phone: string; udhaar: number; jama: number; due: number }>;
  recent_transactions: Array<{ id: number; type: string; amount: number; notes: string; date: string; customer_name: string }>;
}

interface SuperAdminPortalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'hi' | 'en';
  onImpersonateStore?: (shop: ShopItem, token: string) => void;
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  isOpen,
  onClose,
  lang = 'hi',
  onImpersonateStore
}) => {
  const isEn = lang === 'en';

  const [adminUser, setAdminUser] = useState<SuperAdminUser | null>(() => AdminAuth.getUser());
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Active Admin Tab: 'shops' | 'add_shop' | 'broadcast' | 'stats' | 'backup'
  const [activeTab, setActiveTab] = useState<'shops' | 'add_shop' | 'broadcast' | 'stats' | 'backup'>('shops');

  // Platform Google Drive & Backup State
  const [backupSettings, setBackupSettings] = useState<{
    gdrive_webhook_url: string;
    auto_backup_enabled: boolean;
    auto_backup_interval_hours: number;
    sync_on_any_store_entry: boolean;
    last_backup_time: string | null;
    last_backup_status: string | null;
  }>({
    gdrive_webhook_url: '',
    auto_backup_enabled: false,
    auto_backup_interval_hours: 2,
    sync_on_any_store_entry: true,
    last_backup_time: null,
    last_backup_status: null
  });
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupSyncing, setBackupSyncing] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Admin Forgot Password Recovery State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [forgotIdentity, setForgotIdentity] = useState('admin');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [forgotMaskedEmail, setForgotMaskedEmail] = useState<string | null>(null);

  // Dashboard Data State
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [shops, setShops] = useState<ShopItem[]>([]);
  const [loadingShops, setLoadingShops] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'suspended'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passLoading, setPassLoading] = useState(false);

  // Reset Merchant PIN Modal
  const [resetPinShop, setResetPinShop] = useState<ShopItem | null>(null);
  const [merchantNewPin, setMerchantNewPin] = useState('1234');
  const [merchantNewPass, setMerchantNewPass] = useState('admin');
  const [resetPinLoading, setResetPinLoading] = useState(false);

  // Store Details Modal
  const [detailShop, setDetailShop] = useState<ShopItem | null>(null);
  const [shopDetailsData, setShopDetailsData] = useState<ShopDetailsData | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Quick Add Store Form State
  const [newStoreData, setNewStoreData] = useState({
    shop_name: '',
    owner_name: '',
    phone: '',
    email: '',
    address: '',
    upi_id: '',
    pin: '1234',
    password: 'admin'
  });
  const [createStoreLoading, setCreateStoreLoading] = useState(false);

  // Platform Broadcast Notice State
  const [broadcastNotice, setBroadcastNotice] = useState<PlatformNotice>({
    message: '',
    type: 'info',
    is_active: false
  });
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  // Authenticated Admin Request Headers Helper
  const getAuthHeaders = (): Record<string, string> => {
    const token = AdminAuth.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}`, 'x-admin-token': token } : {})
    };
  };

  // Load Dashboard Data
  const loadAdminData = async () => {
    if (!adminUser) return;
    setLoadingShops(true);
    try {
      const headers = getAuthHeaders();
      const [statsRes, shopsRes, broadcastRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/shops', { headers }),
        fetch('/api/admin/broadcast', { headers })
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success) setStats(statsData.stats);
      }

      if (shopsRes.ok) {
        const shopsData = await shopsRes.json();
        if (shopsData.success) setShops(shopsData.shops);
      }

      if (broadcastRes.ok) {
        const bData = await broadcastRes.json();
        if (bData.success && bData.notice) {
          setBroadcastNotice({
            message: bData.notice.message || '',
            type: bData.notice.type || 'info',
            is_active: Boolean(bData.notice.is_active),
            updated_at: bData.notice.updated_at
          });
        }
      }
    } catch (err: any) {
      console.warn('Admin fetch error:', err);
    } finally {
      setLoadingShops(false);
    }
  };

  useEffect(() => {
    if (isOpen && adminUser) {
      loadAdminData();
      fetchBackupSettings();
    }
  }, [isOpen, adminUser]);

  // Fetch Platform Backup Settings
  const fetchBackupSettings = async () => {
    try {
      setBackupLoading(true);
      const res = await fetch('/api/admin/backup/settings', {
        headers: { 'Authorization': `Bearer ${AdminAuth.getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings) {
          setBackupSettings({
            gdrive_webhook_url: data.settings.gdrive_webhook_url || '',
            auto_backup_enabled: Boolean(data.settings.auto_backup_enabled),
            auto_backup_interval_hours: Number(data.settings.auto_backup_interval_hours || 2),
            sync_on_any_store_entry: Boolean(data.settings.sync_on_any_store_entry),
            last_backup_time: data.settings.last_backup_time || null,
            last_backup_status: data.settings.last_backup_status || null
          });
        }
      }
    } catch (err: any) {
      console.warn('Backup settings fetch error:', err);
    } finally {
      setBackupLoading(false);
    }
  };

  // Save Platform Backup Settings
  const handleSaveBackupSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBackupSaving(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/admin/backup/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AdminAuth.getToken()}`
        },
        body: JSON.stringify(backupSettings)
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ text: '✅ Google Drive बैकअप सेटिंग्स सुरक्षित हो गईं!', type: 'success' });
      } else {
        setFeedbackMsg({ text: data.error || 'सेव करने में विफल', type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: 'नेटवर्क समस्या: ' + err.message, type: 'error' });
    } finally {
      setBackupSaving(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // Trigger Immediate Full Sync of all shops to Google Drive
  const handleSyncAllToGoogleDrive = async () => {
    if (!backupSettings.gdrive_webhook_url) {
      setFeedbackMsg({ text: 'कृपया पहले Google Drive Webhook URL दर्ज करें', type: 'error' });
      return;
    }
    setBackupSyncing(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/admin/backup/sync-gdrive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AdminAuth.getToken()}`
        },
        body: JSON.stringify({ webhook_url: backupSettings.gdrive_webhook_url })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ text: '☁️ ' + (data.message || 'सभी दुकानों का बैकअप Google Drive पर अपलोड हो गया!'), type: 'success' });
        fetchBackupSettings();
      } else {
        setFeedbackMsg({ text: data.error || 'Google Drive सिंक विफल हुआ', type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: 'Google Drive सिंक एरर: ' + err.message, type: 'error' });
    } finally {
      setBackupSyncing(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  // Download Master Full Platform JSON Backup
  const handleDownloadFullPlatformBackup = () => {
    const token = AdminAuth.getToken();
    window.open(`/api/admin/backup/download?token=${encodeURIComponent(token)}`, '_blank');
  };

  // Google Apps Script Template
  const gdriveMasterScriptCode = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // 1. अगर ईमेल भेजने की रिक्वेस्ट है (Instant Real Email Dispatch via Google Cloud)
    if (data.action === "send_email") {
      MailApp.sendEmail({
        to: data.to,
        subject: data.subject,
        htmlBody: data.htmlBody
      });
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Email delivered via Google Cloud"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var isPlatform = data.is_platform_backup === true || data.backup_type === "FULL_PROJECT_MASTER_BACKUP" || data.total_shops !== undefined;
    var now = new Date();
    var timeStamp = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd_HH-mm");
    
    if (isPlatform) {
      // ══════════════════════════════════════════════════════════
      // 📁 पूरे प्रोजेक्ट का मास्टर बैकअप (अलग Master Folder)
      // ══════════════════════════════════════════════════════════
      var masterFolders = DriveApp.getFoldersByName("1_Dukaan_FULL_PROJECT_Master_Backups");
      var masterFolder = masterFolders.hasNext() ? masterFolders.next() : DriveApp.createFolder("1_Dukaan_FULL_PROJECT_Master_Backups");
      
      var masterFileName = "FULL_PROJECT_MASTER_" + timeStamp + ".json";
      masterFolder.createFile(masterFileName, JSON.stringify(data, null, 2), MimeType.PLAIN_TEXT);
      
      var latestM = masterFolder.getFilesByName("FULL_PROJECT_latest.json");
      if (latestM.hasNext()) {
        latestM.next().setContent(JSON.stringify(data, null, 2));
      } else {
        masterFolder.createFile("FULL_PROJECT_latest.json", JSON.stringify(data, null, 2), MimeType.PLAIN_TEXT);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "FULL_PROJECT", file: masterFileName })).setMimeType(ContentService.MimeType.JSON);
    } else {
      // ══════════════════════════════════════════════════════════
      // 📁 व्यक्तिगत दुकान का बैकअप (अलग Store Subfolder)
      // ══════════════════════════════════════════════════════════
      var rootStoresFolders = DriveApp.getFoldersByName("2_Dukaan_INDIVIDUAL_STORES_Backups");
      var rootStoresFolder = rootStoresFolders.hasNext() ? rootStoresFolders.next() : DriveApp.createFolder("2_Dukaan_INDIVIDUAL_STORES_Backups");
      
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
      return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "STORE", shop_id: shopId, file: storeFileName })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(gdriveMasterScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  // Super Admin Forgot Password: Step 1 (Request Email OTP)
  const handleRequestAdminOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentity.trim()) {
      setForgotError('कृपया अपना एडमिन यूज़रनेम, ईमेल या मोबाइल नंबर दर्ज करें');
      return;
    }
    setForgotLoading(true);
    setForgotError(null);
    setForgotSuccess(null);
    try {
      const res = await fetch('/api/admin/forgot-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: forgotIdentity.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setForgotSuccess(data.message);
        setForgotMaskedEmail(data.maskedEmail);
        setForgotOtp('');
        setForgotStep('verify');
      } else {
        setForgotError(data.error || 'सुरक्षा OTP भेजने में विफल');
      }
    } catch (err: any) {
      setForgotError('सर्वर से संपर्क नहीं हो सका: ' + err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  // Super Admin Forgot Password: Step 2 (Verify OTP & Reset)
  const handleVerifyAndResetAdminPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotOtp.trim()) {
      setForgotError('कृपया 6-अंकों का OTP कोड दर्ज करें');
      return;
    }
    if (!forgotNewPass || forgotNewPass.length < 4) {
      setForgotError('नया पासवर्ड कम से कम 4 अक्षरों का होना चाहिए');
      return;
    }
    if (forgotNewPass !== forgotConfirmPass) {
      setForgotError('दोनों पासवर्ड एक जैसे नहीं हैं!');
      return;
    }

    setForgotLoading(true);
    setForgotError(null);
    try {
      const res = await fetch('/api/admin/forgot-password/verify-and-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: forgotIdentity.trim(),
          otp: forgotOtp.trim(),
          newPassword: forgotNewPass.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ text: '🎉 ' + (data.message || 'सुपर एडमिन पासवर्ड सफलतापूर्वक रीसेट हो गया!'), type: 'success' });
        if (data.token && data.user) {
          AdminAuth.setSession(data.token, data.user);
          setAdminUser(data.user);
        }
        setIsForgotModalOpen(false);
        setForgotStep('request');
        setForgotOtp('');
        setForgotNewPass('');
        setForgotConfirmPass('');
      } else {
        setForgotError(data.error || 'पासवर्ड रीसेट विफल रहा');
      }
    } catch (err: any) {
      setForgotError('सर्वर एरर: ' + err.message);
    } finally {
      setForgotLoading(false);
    }
  };



  // Handle Admin Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      setLoginError(isEn ? 'Please enter username and password' : 'कृपया यूज़रनेम और पासवर्ड दर्ज करें');
      return;
    }

    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword.trim() })
      });

      const data = await res.json();
      if (data.success && data.token) {
        AdminAuth.setSession(data.token, data.admin);
        setAdminUser(data.admin);
        setLoginPassword('');
      } else {
        setLoginError(data.error || (isEn ? 'Invalid credentials' : 'गलत क्रेडेंशियल!'));
      }
    } catch {
      setLoginError(isEn ? 'Server connection error' : 'सर्वर से संपर्क नहीं हो सका');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Admin Logout
  const handleAdminLogout = () => {
    AdminAuth.clearSession();
    setAdminUser(null);
  };

  // Handle Store Status Update (Approve, Suspend, Reject)
  const handleUpdateStatus = async (shopId: number, newStatus: 'approved' | 'pending' | 'suspended' | 'rejected') => {
    setActionLoadingId(shopId);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/admin/shops/update-status', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ shop_id: shopId, status: newStatus })
      });

      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ text: data.message, type: 'success' });
        setShops(prev => prev.map(s => (s.id === shopId ? { ...s, status: newStatus } : s)));
        loadAdminData();
      } else {
        setFeedbackMsg({ text: data.error || 'त्रुटि आई', type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: 'नेटवर्क समस्या: ' + err.message, type: 'error' });
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // Handle Store Deletion
  const handleDeleteShop = async (shop: ShopItem) => {
    if (shop.id === 1) {
      alert('मुख्य प्राथमिक दुकान (ID: 1) को हटाया नहीं जा सकता!');
      return;
    }

    const confirmMsg = `क्या आप सचमुच दुकान "${shop.shop_name}" (मालिक: ${shop.owner_name}) को स्थायी रूप से हटाना चाहते हैं?\n\nचेतावनी: इस दुकान के सभी ग्राहक, उधारी लेन-देन और स्टॉक हमेशा के लिए डिलीट हो जाएंगे!`;
    if (!confirm(confirmMsg)) return;

    setActionLoadingId(shop.id);
    try {
      const res = await fetch('/api/admin/shops/delete', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ shop_id: shop.id })
      });

      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ text: `दुकान "${shop.shop_name}" हटा दी गई है`, type: 'success' });
        setShops(prev => prev.filter(s => s.id !== shop.id));
        loadAdminData();
      } else {
        setFeedbackMsg({ text: data.error || 'दुकान हटाने में विफल', type: 'error' });
      }
    } catch {
      setFeedbackMsg({ text: 'सर्वर से संपर्क नहीं हो सका', type: 'error' });
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // 1. Direct Impersonation: Login Directly as Store Owner
  const handleImpersonate = async (shop: ShopItem) => {
    setActionLoadingId(shop.id);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ shop_id: shop.id })
      });
      const data = await res.json();
      if (data.success && data.token) {
        setFeedbackMsg({ text: `दुकान '${shop.shop_name}' में सीधे प्रवेश हो रहा है...`, type: 'success' });
        if (onImpersonateStore) {
          onImpersonateStore(shop, data.token);
        } else {
          // Fallback direct reload into impersonated shop
          sessionStorage.setItem('dukaan_auth_token', data.token);
          sessionStorage.setItem('dukaan_shop_id', String(shop.id));
          sessionStorage.setItem('dukaan_auth_user', JSON.stringify(data.user));
          sessionStorage.setItem('is_logged_in', 'true');
          sessionStorage.setItem('dukaan_is_impersonating', 'true');
          window.location.reload();
        }
      } else {
        setFeedbackMsg({ text: data.error || 'इम्पर्सनेशन विफल रहा', type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: 'सर्वर त्रुटि: ' + err.message, type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // 2. Load Store Financial Details
  const handleOpenDetails = async (shop: ShopItem) => {
    setDetailShop(shop);
    setShopDetailsData(null);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/admin/shops/details?id=${shop.id}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setShopDetailsData(data);
      }
    } catch (err: any) {
      console.warn('Details fetch error:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  // 3. Reset Merchant PIN / Password
  const handleResetMerchantPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPinShop) return;
    setResetPinLoading(true);

    try {
      const res = await fetch('/api/admin/shops/reset-pin', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          shop_id: resetPinShop.id,
          new_pin: merchantNewPin.trim(),
          new_password: merchantNewPass.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ text: data.message, type: 'success' });
        setResetPinShop(null);
      } else {
        setFeedbackMsg({ text: data.error || 'रीसेट विफल', type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: 'सर्वर समस्या: ' + err.message, type: 'error' });
    } finally {
      setResetPinLoading(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // 4. Quick Add Store
  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateStoreLoading(true);
    try {
      const res = await fetch('/api/admin/shops/create', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newStoreData)
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ text: data.message, type: 'success' });
        setNewStoreData({
          shop_name: '',
          owner_name: '',
          phone: '',
          email: '',
          address: '',
          upi_id: '',
          pin: '1234',
          password: 'admin'
        });
        setActiveTab('shops');
        loadAdminData();
      } else {
        setFeedbackMsg({ text: data.error || 'दुकान बनाने में त्रुटि', type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: 'सर्वर समस्या: ' + err.message, type: 'error' });
    } finally {
      setCreateStoreLoading(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // 5. Save Platform Notice
  const handleSaveBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setBroadcastLoading(true);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(broadcastNotice)
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ text: '✅ ' + data.message, type: 'success' });
        loadAdminData();
      } else {
        setFeedbackMsg({ text: '❌ ' + (data.error || 'नोटिस अपडेट विफल'), type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: '❌ सर्वर समस्या: ' + err.message, type: 'error' });
    } finally {
      setBroadcastLoading(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // 6. Export Directory to CSV / Excel
  const handleExportCSV = () => {
    if (shops.length === 0) return;
    const headers = [
      'Shop ID',
      'Shop Name',
      'Owner Name',
      'Mobile Phone',
      'Status',
      'Customers',
      'Transactions',
      'Total Udhaar (Rs)',
      'Total Jama (Rs)',
      'Net Due (Rs)',
      'Address',
      'UPI ID',
      'Created At'
    ];

    const rows = shops.map(s => [
      s.id,
      `"${(s.shop_name || '').replace(/"/g, '""')}"`,
      `"${(s.owner_name || '').replace(/"/g, '""')}"`,
      `'${s.phone}`,
      s.status || 'approved',
      s.customer_count || 0,
      s.transaction_count || 0,
      s.total_udhaar || 0,
      s.total_jama || 0,
      s.net_due || 0,
      `"${(s.address || '').replace(/"/g, '""')}"`,
      `"${(s.upi_id || '').replace(/"/g, '""')}"`,
      `"${new Date(s.created_at).toLocaleString('hi-IN')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Dukaan_Stores_Export_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Change Admin Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPass || !newPass) return;
    setPassLoading(true);

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass })
      });

      const data = await res.json();
      if (data.success) {
        alert('पासवर्ड सफलतापूर्वक अपडेट हो गया!');
        setIsChangePassOpen(false);
        setCurrentPass('');
        setNewPass('');
      } else {
        alert(data.error || 'पासवर्ड बदलने में विफल');
      }
    } catch {
      alert('सर्वर त्रुटि');
    } finally {
      setPassLoading(false);
    }
  };

  if (!isOpen) return null;

  // Filtered Shops
  const filteredShops = shops.filter(shop => {
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'pending'
        ? shop.status === 'pending'
        : statusFilter === 'approved'
        ? shop.status === 'approved' || !shop.status
        : shop.status === 'suspended' || shop.status === 'rejected';

    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      shop.shop_name.toLowerCase().includes(q) ||
      shop.owner_name.toLowerCase().includes(q) ||
      shop.phone.includes(q) ||
      String(shop.id) === q;

    return matchesStatus && matchesSearch;
  });

  const pendingCount = shops.filter(s => s.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 overflow-y-auto">
      {/* 1. SUPER ADMIN LOGIN VIEW */}
      {!adminUser ? (
        <div className="min-h-screen flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl relative">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              title="Close"
            >
              ✕
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex p-3.5 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-900/40 mb-3">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-white">सुपर एडमिन पोर्टल (Super Admin)</h2>
              <p className="text-xs text-slate-400 mt-1">
                दुकान खाता SaaS • मल्टी-स्टोर अनुमोदन व नियंत्रण
              </p>
            </div>

            {loginError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  व्यवस्थापक यूज़रनेम या मोबाइल नंबर
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={e => setLoginUsername(e.target.value)}
                  placeholder="यूज़रनेम या मोबाइल नंबर"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  व्यवस्थापक पासवर्ड (Admin Password)
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">पासवर्ड याद नहीं है?</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotModalOpen(true);
                    setForgotStep('request');
                    setForgotError(null);
                    setForgotSuccess(null);
                  }}
                  className="text-xs font-bold text-sky-400 hover:text-sky-300 underline underline-offset-2 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>पासवर्ड भूल गए? (ईमेल से रीसेट करें)</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-sm shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                {loginLoading ? (
                  <span>⏳ लॉगिन हो रहा है...</span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>सुपर एडमिन लॉगिन करें →</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-xs transition-all"
              >
                ← वापस दुकान पर जाएं (Back to Store)
              </button>
            </form>

            {/* ADMIN FORGOT PASSWORD RECOVERY MODAL */}
            {isForgotModalOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
                <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl relative text-left max-h-[92dvh] overflow-y-auto">
                  <button
                    onClick={() => {
                      setIsForgotModalOpen(false);
                      setForgotError(null);
                      setForgotSuccess(null);
                    }}
                    className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs cursor-pointer"
                    title="Close"
                  >
                    ✕
                  </button>

                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-3 rounded-2xl bg-sky-600/20 text-sky-400 border border-sky-500/30">
                      <KeyRound className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white">सुपर एडमिन पासवर्ड रिकवरी</h3>
                      <p className="text-xs text-slate-400">ईमेल पर 6-अंकों का OTP प्राप्त कर पासवर्ड रीसेट करें</p>
                    </div>
                  </div>

                  {/* Step Indicators */}
                  <div className="grid grid-cols-2 gap-2 mb-5 text-[11px] font-bold">
                    <div className={`p-2 rounded-xl border text-center transition-all ${
                      forgotStep === 'request'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'bg-slate-800/60 text-slate-400 border-slate-800'
                    }`}>
                      1. पहचान व ईमेल OTP
                    </div>
                    <div className={`p-2 rounded-xl border text-center transition-all ${
                      forgotStep === 'verify'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800/60 text-slate-400 border-slate-800'
                    }`}>
                      2. नया पासवर्ड सेट करें
                    </div>
                  </div>

                  {/* Messages */}
                  {forgotError && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{forgotError}</span>
                    </div>
                  )}

                  {forgotSuccess && (
                    <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>{forgotSuccess}</span>
                    </div>
                  )}

                  {/* STEP 1: REQUEST OTP */}
                  {forgotStep === 'request' && (
                    <form onSubmit={handleRequestAdminOtp} className="space-y-4 text-xs">
                      <div>
                        <label className="font-extrabold text-slate-300 block mb-1">
                          व्यवस्थापक यूज़रनेम, ईमेल या मोबाइल नंबर
                        </label>
                        <input
                          type="text"
                          value={forgotIdentity}
                          onChange={e => setForgotIdentity(e.target.value)}
                          placeholder="admin / abhishek3815@gmail.com / मोबाइल नंबर"
                          className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                          required
                        />
                        <span className="text-[10px] text-slate-400 block mt-1">
                          सिस्टम आपके पंजीकृत ईमेल पर तुरंत 6-अंकों का सत्यापन कोड भेजेगा।
                        </span>
                      </div>

                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-black text-xs shadow-lg shadow-sky-900/40 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
                      >
                        {forgotLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-white" />
                            <span>सुरक्षा OTP भेजा जा रहा है...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>सुरक्षा कोड (OTP) ईमेल पर भेजें →</span>
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* STEP 2: VERIFY OTP & RESET PASSWORD */}
                  {forgotStep === 'verify' && (
                    <form onSubmit={handleVerifyAndResetAdminPass} className="space-y-3.5 text-xs">
                      {forgotMaskedEmail && (
                        <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-800/40 text-[11px] text-sky-200 flex items-center gap-2">
                          <Mail className="w-4 h-4 shrink-0 text-sky-400" />
                          <span>कोड ईमेल पर भेजा गया: <strong>{forgotMaskedEmail}</strong></span>
                        </div>
                      )}

                      <div>
                        <label className="font-extrabold text-slate-300 block mb-1">
                          6-अंकों का ईमेल सुरक्षा कोड (OTP)
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          value={forgotOtp}
                          onChange={e => setForgotOtp(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="123456"
                          className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono font-black text-center text-lg tracking-widest focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          required
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="font-extrabold text-slate-300 block mb-1">
                          नया एडमिन पासवर्ड (New Password)
                        </label>
                        <input
                          type="password"
                          value={forgotNewPass}
                          onChange={e => setForgotNewPass(e.target.value)}
                          placeholder="नया पासवर्ड (कम से कम 4 अक्षर)"
                          className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="font-extrabold text-slate-300 block mb-1">
                          नया पासवर्ड दोबारा दर्ज करें (Confirm Password)
                        </label>
                        <input
                          type="password"
                          value={forgotConfirmPass}
                          onChange={e => setForgotConfirmPass(e.target.value)}
                          placeholder="वही पासवर्ड दोबारा लिखें"
                          className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-xs shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
                      >
                        {forgotLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-white" />
                            <span>पासवर्ड रीसेट हो रहा है...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>पासवर्ड रीसेट करें और सीधे लॉगिन करें</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setForgotStep('request');
                            setForgotError(null);
                          }}
                          className="text-[11px] text-sky-400 hover:underline"
                        >
                          ← यूज़रनेम बदलें या पुनः OTP भेजें
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 2. SUPER ADMIN DASHBOARD VIEW */
        <div className="min-h-screen flex flex-col">
          {/* Top Navbar */}
          <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6 py-2.5 sm:py-3 sticky top-0 z-30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="p-1.5 sm:p-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md shrink-0">
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5 sm:gap-2">
                  <span className="truncate">दुकान खाता SaaS</span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    SUPER ADMIN
                  </span>
                </h1>
                <p className="text-[10px] sm:text-[11px] text-slate-400 truncate max-w-[130px] sm:max-w-none">
                  {adminUser.name} ({adminUser.username})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={handleExportCSV}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold transition-all border border-slate-700"
                title="सभी दुकानों की CSV डाउनलोड करें"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV डाउनलोड</span>
              </button>

              <button
                onClick={() => setIsChangePassOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all border border-slate-700"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>पासवर्ड</span>
              </button>

              <button
                onClick={loadAdminData}
                disabled={loadingShops}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
                title="रिफ्रेश करें"
              >
                <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loadingShops ? 'animate-spin text-emerald-400' : ''}`} />
              </button>

              <button
                onClick={onClose}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-700 text-xs font-bold transition-all"
                title="दुकान पर जाएं"
              >
                <Store className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">दुकान पर जाएं</span>
                <span className="sm:hidden text-[11px]">दुकान</span>
              </button>

              <button
                onClick={handleAdminLogout}
                className="p-1.5 sm:p-2 rounded-xl bg-rose-950/50 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-all shrink-0"
                title="एडमिन लॉगआउट"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </header>

          {/* Navigation Tabs Bar */}
          <div className="bg-slate-900/80 border-b border-slate-800 px-3 sm:px-6 py-2 flex items-center overflow-x-auto gap-1.5 sm:gap-2 no-scrollbar scroll-smooth">
            <button
              onClick={() => setActiveTab('shops')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                activeTab === 'shops'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>दुकानें और अनुमोदन ({shops.length})</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-black animate-pulse">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('add_shop')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                activeTab === 'add_shop'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>+ नई दुकान जोड़ें</span>
            </button>

            <button
              onClick={() => setActiveTab('broadcast')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                activeTab === 'broadcast'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5 text-blue-400" />
              <span>प्लेटफॉर्म नोटिस</span>
              {broadcastNotice.is_active && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('stats')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                activeTab === 'stats'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
              <span>वित्तीय ऑडिट</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('backup');
                fetchBackupSettings();
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                activeTab === 'backup'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Cloud className="w-3.5 h-3.5 text-sky-400" />
              <span>Google Drive & बैकअप</span>
              {backupSettings.auto_backup_enabled && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>
          </div>

          {/* Feedback Toast */}
          {feedbackMsg && (
            <div
              className={`mx-4 sm:mx-6 mt-4 p-3 rounded-2xl text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in duration-200 ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-950/80 border border-emerald-600 text-emerald-200'
                  : 'bg-rose-950/80 border border-rose-600 text-rose-200'
              }`}
            >
              <span>{feedbackMsg.text}</span>
              <button onClick={() => setFeedbackMsg(null)} className="opacity-70 hover:opacity-100">✕</button>
            </div>
          )}

          <main className="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full space-y-4 sm:space-y-6">
            {/* Stat Cards Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
              <div className="p-3 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] sm:text-xs font-bold truncate">कुल दुकानें</span>
                  <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-400 shrink-0" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-white">{stats?.totalShops ?? shops.length}</div>
                <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 truncate">SaaS टेनेंट्स</p>
              </div>

              <div
                onClick={() => {
                  setActiveTab('shops');
                  setStatusFilter('pending');
                }}
                className={`p-3 sm:p-4 rounded-2xl border shadow-sm cursor-pointer transition-all ${
                  pendingCount > 0
                    ? 'bg-amber-950/40 border-amber-500/50 hover:border-amber-400'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-amber-300 mb-1">
                  <span className="text-[11px] sm:text-xs font-bold flex items-center gap-1 truncate">
                    <span>स्वीकृति लंबित</span>
                    {pendingCount > 0 && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                    )}
                  </span>
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-400">{pendingCount}</div>
                <p className="text-[9px] sm:text-[10px] text-amber-300/70 mt-0.5 truncate">अनुमोदन की प्रतीक्षा में</p>
              </div>

              <div className="p-3 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] sm:text-xs font-bold truncate">सक्रिय दुकानें</span>
                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400">{stats?.approvedShops ?? 0}</div>
                <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 truncate">स्वीकृत और चालू</p>
              </div>

              <div className="p-3 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] sm:text-xs font-bold truncate">कुल ग्राहक</span>
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-white">{stats?.totalCustomers ?? 0}</div>
                <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 truncate">सभी दुकानों के ग्राहक</p>
              </div>
            </div>

            {/* TAB 1: SHOPS & APPROVALS */}
            {activeTab === 'shops' && (
              <div className="space-y-4">
                {/* Filter & Search Bar */}
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center justify-between bg-slate-900 p-2.5 sm:p-3.5 rounded-2xl border border-slate-800">
                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={`shrink-0 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        statusFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      सभी ({shops.length})
                    </button>

                    <button
                      onClick={() => setStatusFilter('pending')}
                      className={`shrink-0 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        statusFilter === 'pending'
                          ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                          : 'text-amber-300 hover:bg-amber-950/40'
                      }`}
                    >
                      <span>⏳ लंबित</span>
                      {pendingCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-900 text-amber-200 font-extrabold">
                          {pendingCount}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setStatusFilter('approved')}
                      className={`shrink-0 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        statusFilter === 'approved'
                          ? 'bg-emerald-600 text-white font-black shadow-md'
                          : 'text-emerald-400 hover:bg-emerald-950/40'
                      }`}
                    >
                      ✅ स्वीकृत
                    </button>

                    <button
                      onClick={() => setStatusFilter('suspended')}
                      className={`shrink-0 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        statusFilter === 'suspended'
                          ? 'bg-rose-600 text-white font-black shadow-md'
                          : 'text-rose-400 hover:bg-rose-950/40'
                      }`}
                    >
                      ⏸ निलंबित
                    </button>
                  </div>

                  {/* Search box & CSV */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="दुकान, मालिक या नंबर खोजें..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Store Cards / Table */}
                {loadingShops && shops.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    ⏳ दुकानों का डेटा लोड हो रहा है...
                  </div>
                ) : filteredShops.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-slate-900 border border-slate-800">
                    <Store className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm font-bold text-slate-300">कोई दुकान नहीं मिली</p>
                    <p className="text-xs text-slate-500 mt-1">फिल्टर या सर्च बदल कर देखें।</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {filteredShops.map(shop => {
                      const isPending = shop.status === 'pending';
                      const isApproved = shop.status === 'approved' || !shop.status;
                      const isSuspended = shop.status === 'suspended' || shop.status === 'rejected';
                      const isProcessing = actionLoadingId === shop.id;

                      return (
                        <div
                          key={shop.id}
                          className={`p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border transition-all relative flex flex-col justify-between ${
                            isPending
                              ? 'bg-amber-950/20 border-amber-500/40 shadow-lg shadow-amber-950/30'
                              : isSuspended
                              ? 'bg-rose-950/15 border-rose-900/40 opacity-80'
                              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            {/* Header: Shop Name & Status Badge */}
                            <div className="flex items-start justify-between gap-2 mb-2.5 sm:mb-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                                    ID: #{shop.id}
                                  </span>
                                  {shop.id === 1 && (
                                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700 shrink-0">
                                      Primary
                                    </span>
                                  )}
                                </div>
                                <h3 className="text-sm sm:text-base font-black text-white mt-1 leading-snug break-words">
                                  {shop.shop_name}
                                </h3>
                              </div>

                              <div className="shrink-0">
                                {isPending && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>लंबित</span>
                                  </span>
                                )}
                                {isApproved && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>सक्रिय</span>
                                  </span>
                                )}
                                {isSuspended && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>निलंबित</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Owner Details */}
                            <div className="space-y-1.5 text-xs text-slate-300 mb-3 bg-slate-950/50 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-800/60">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400 font-medium shrink-0">मालिक:</span>
                                <span className="font-bold text-white truncate text-right">{shop.owner_name}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400 font-medium shrink-0">मोबाइल:</span>
                                <a
                                  href={`tel:${shop.phone}`}
                                  className="font-bold font-mono text-emerald-400 hover:underline flex items-center gap-1 shrink-0"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>{shop.phone}</span>
                                </a>
                              </div>
                              {shop.address && (
                                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                                  <span className="shrink-0">पता:</span>
                                  <span className="truncate max-w-[170px] text-right">{shop.address}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
                                <span>पंजीकरण:</span>
                                <span>{new Date(shop.created_at).toLocaleDateString('hi-IN')}</span>
                              </div>
                            </div>

                            {/* Ledger Metrics */}
                            <div className="grid grid-cols-2 gap-2 text-center text-xs mb-3">
                              <div className="p-2 rounded-xl bg-slate-800/50 border border-slate-800">
                                <div className="text-[10px] text-slate-400">ग्राहक (Customers)</div>
                                <div className="text-sm font-black text-white">{shop.customer_count || 0}</div>
                              </div>
                              <div className="p-2 rounded-xl bg-slate-800/50 border border-slate-800">
                                <div className="text-[10px] text-slate-400">बाकी उधारी (Net Due)</div>
                                <div className={`text-sm font-black ${(shop.net_due || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  ₹{(shop.net_due || 0).toLocaleString('en-IN')}
                                </div>
                              </div>
                            </div>

                            {/* Impersonate & Audit Action Row */}
                            <div className="grid grid-cols-2 gap-2 mb-3">
                              <button
                                onClick={() => handleImpersonate(shop)}
                                disabled={isProcessing}
                                className="py-2 px-2 rounded-xl bg-teal-950/60 hover:bg-teal-900 border border-teal-700/60 text-teal-300 font-extrabold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                                title="दुकानदार का पिन जाने बिना दुकान में सीधे प्रवेश करें"
                              >
                                <Eye className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                <span className="truncate">👀 दुकान खोलें</span>
                              </button>

                              <button
                                onClick={() => handleOpenDetails(shop)}
                                className="py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
                              >
                                <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="truncate">📋 विवरण</span>
                              </button>
                            </div>
                          </div>

                          {/* Approval / Status / Pin Reset Action Row */}
                          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-1.5 sm:gap-2">
                            {isPending ? (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(shop.id, 'approved')}
                                  disabled={isProcessing}
                                  className="flex-1 py-2 px-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-extrabold text-xs shadow-md shadow-emerald-950 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                                >
                                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{isProcessing ? 'मंजूर हो रहा है...' : '✅ मंज़ूरी दें (Approve)'}</span>
                                </button>

                                <button
                                  onClick={() => handleUpdateStatus(shop.id, 'rejected')}
                                  disabled={isProcessing}
                                  className="py-2 px-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs active:scale-95 transition-all shrink-0"
                                  title="अस्वीकार करें"
                                >
                                  रद्द करें
                                </button>
                              </>
                            ) : isApproved ? (
                              <>
                                <button
                                  onClick={() => {
                                    setResetPinShop(shop);
                                    setMerchantNewPin('1234');
                                    setMerchantNewPass('admin');
                                  }}
                                  className="flex-1 py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold text-[11px] flex items-center justify-center gap-1 transition-all"
                                  title="व्यापारी का पिन रीसेट करें"
                                >
                                  <KeyRound className="w-3 h-3 shrink-0" />
                                  <span className="truncate">पिन रीसेट</span>
                                </button>

                                <button
                                  onClick={() => handleUpdateStatus(shop.id, 'suspended')}
                                  disabled={isProcessing}
                                  className="flex-1 py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold text-[11px] flex items-center justify-center gap-1 transition-all"
                                >
                                  <PauseCircle className="w-3 h-3 shrink-0" />
                                  <span className="truncate">रोकें</span>
                                </button>

                                {shop.id !== 1 && (
                                  <button
                                    onClick={() => handleDeleteShop(shop)}
                                    disabled={isProcessing}
                                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 hover:border-rose-700 border border-slate-700 text-slate-400 hover:text-rose-300 transition-all shrink-0"
                                    title="दुकान हटाएं"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(shop.id, 'approved')}
                                  disabled={isProcessing}
                                  className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                                >
                                  <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>पुनः चालू करें (Activate)</span>
                                </button>

                                {shop.id !== 1 && (
                                  <button
                                    onClick={() => handleDeleteShop(shop)}
                                    disabled={isProcessing}
                                    className="p-1.5 rounded-xl bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 transition-all shrink-0"
                                    title="दुकान हटाएं"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: QUICK ADD STORE (PRE-APPROVED) */}
            {activeTab === 'add_shop' && (
              <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xl">
                <div className="flex items-center gap-3 mb-5 sm:mb-6 pb-4 border-b border-slate-800">
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                    <PlusCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-white">नई दुकान जोड़ें (Admin Pre-Approved Store)</h2>
                    <p className="text-[11px] sm:text-xs text-slate-400">
                      एडमिन द्वारा सीधे बनाई गई दुकान तुरंत स्वीकृत (Approved) रहेगी और सीधे लॉगिन योग्य होगी।
                    </p>
                  </div>
                </div>

                <form onSubmit={handleCreateStore} className="space-y-3.5 sm:space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="text-slate-300 font-bold block mb-1">दुकान का नाम *</label>
                      <input
                        type="text"
                        value={newStoreData.shop_name}
                        onChange={e => setNewStoreData({ ...newStoreData, shop_name: e.target.value })}
                        placeholder="जैसे: गुप्ता प्रोविजन स्टोर"
                        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 font-bold block mb-1">दुकानदार / मालिक का नाम *</label>
                      <input
                        type="text"
                        value={newStoreData.owner_name}
                        onChange={e => setNewStoreData({ ...newStoreData, owner_name: e.target.value })}
                        placeholder="जैसे: राजेश गुप्ता"
                        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="text-slate-300 font-bold block mb-1">
                        मालिक का मोबाइल नंबर * (यूनिक 10-अंक)
                      </label>
                      <input
                        type="tel"
                        maxLength={10}
                        value={newStoreData.phone}
                        onChange={e => setNewStoreData({ ...newStoreData, phone: e.target.value.replace(/[^0-9]/g, '') })}
                        placeholder="9876543210"
                        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        required
                      />
                      <p className="text-[10px] text-amber-400 mt-1">⚠️ हर दुकान का मोबाइल नंबर अलग होना अनिवार्य है।</p>
                    </div>

                    <div>
                      <label className="text-slate-300 font-bold block mb-1">दुकान का पता (Address)</label>
                      <input
                        type="text"
                        value={newStoreData.address}
                        onChange={e => setNewStoreData({ ...newStoreData, address: e.target.value })}
                        placeholder="मेन मार्केट, सदर बाजार"
                        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="text-slate-300 font-bold block mb-1">लॉगिन सुरक्षा पिन (PIN)</label>
                      <input
                        type="text"
                        maxLength={6}
                        value={newStoreData.pin}
                        onChange={e => setNewStoreData({ ...newStoreData, pin: e.target.value })}
                        placeholder="1234"
                        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 font-bold block mb-1">लॉगिन पासवर्ड (Password)</label>
                      <input
                        type="text"
                        value={newStoreData.password}
                        onChange={e => setNewStoreData({ ...newStoreData, password: e.target.value })}
                        placeholder="admin"
                        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={createStoreLoading}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-sm shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all active:scale-98"
                    >
                      {createStoreLoading ? (
                        <span>⏳ दुकान बनाई जा रही है...</span>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>तुरंत नई दुकान बनाएं (Create & Pre-Approve)</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 3: PLATFORM BROADCAST NOTICE */}
            {activeTab === 'broadcast' && (
              <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xl">
                <div className="flex items-center gap-3 mb-5 sm:mb-6 pb-4 border-b border-slate-800">
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shrink-0">
                    <Megaphone className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-white">प्लेटफॉर्म नोटिस / अनाउंसमेंट बैनर</h2>
                    <p className="text-[11px] sm:text-xs text-slate-400">
                      यह संदेश सभी दुकानों के डैशबोर्ड पर ऊपर पट्टी (Banner) के रूप में दिखाई देगा।
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveBroadcast} className="space-y-3.5 sm:space-y-4 text-xs">
                  <div>
                    <label className="text-slate-300 font-bold block mb-1">संदेश (Notice Message)</label>
                    <textarea
                      rows={3}
                      value={broadcastNotice.message}
                      onChange={e => setBroadcastNotice({ ...broadcastNotice, message: e.target.value })}
                      placeholder="जैसे: प्रिय दुकानदार, आज रात 11:00 बजे सर्वर बैकअप कार्य रहेगा। कृपया अपने खाते समय पर सेव कर लें।"
                      className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="text-slate-300 font-bold block mb-1">नोटिस का प्रकार (Type)</label>
                      <select
                        value={broadcastNotice.type}
                        onChange={e => setBroadcastNotice({ ...broadcastNotice, type: e.target.value as any })}
                        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      >
                        <option value="info">🔵 सूचना (Info - Blue)</option>
                        <option value="warning">🟡 चेतावनी (Warning - Amber)</option>
                        <option value="alert">🔴 अलर्ट (Alert - Red)</option>
                        <option value="success">🟢 शुभ समाचार / ऑफर (Success - Green)</option>
                      </select>
                    </div>

                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-2 p-2.5 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer">
                        <input
                          type="checkbox"
                          checked={broadcastNotice.is_active}
                          onChange={e => setBroadcastNotice({ ...broadcastNotice, is_active: e.target.checked })}
                          className="w-4 h-4 text-emerald-600 rounded bg-slate-700 border-slate-600 focus:ring-emerald-500"
                        />
                        <span className="font-bold text-white">नोटिस चालू रखें (Active Banner)</span>
                      </label>
                    </div>
                  </div>

                  {/* Preview Banner */}
                  {broadcastNotice.message && (
                    <div className="pt-2">
                      <span className="text-[10px] text-slate-400 block mb-1 font-bold">लाइव प्रीव्यू (Preview):</span>
                      <div
                        className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                          broadcastNotice.type === 'warning'
                            ? 'bg-amber-950/60 border-amber-600 text-amber-200'
                            : broadcastNotice.type === 'alert'
                            ? 'bg-rose-950/60 border-rose-600 text-rose-200'
                            : broadcastNotice.type === 'success'
                            ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200'
                            : 'bg-blue-950/60 border-blue-600 text-blue-200'
                        }`}
                      >
                        <Megaphone className="w-4 h-4 shrink-0" />
                        <span>{broadcastNotice.message}</span>
                      </div>
                    </div>
                  )}

                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={broadcastLoading}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-black text-sm shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 transition-all active:scale-98"
                    >
                      {broadcastLoading ? (
                        <span>⏳ सेव हो रहा है...</span>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>नोटिस पब्लिश करें (Broadcast Notice)</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 4: PLATFORM FINANCIAL AUDIT */}
            {activeTab === 'stats' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-md">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400">कुल बाजार उधारी (Total Udhaar)</span>
                    <div className="text-xl sm:text-2xl font-black text-amber-400 mt-1">
                      ₹{Number(stats?.totalUdhaar || 0).toLocaleString('en-IN')}
                    </div>
                    <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1">सभी दुकानों की दी गई उधारी</p>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-md">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400">कुल वसूली (Total Jama)</span>
                    <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
                      ₹{Number(stats?.totalJama || 0).toLocaleString('en-IN')}
                    </div>
                    <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1">सभी दुकानों में आया हुआ भुगतान</p>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-md">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400">मार्केट बैलेंस (Net Market Due)</span>
                    <div className="text-xl sm:text-2xl font-black text-teal-300 mt-1">
                      ₹{Number(stats?.marketDue || 0).toLocaleString('en-IN')}
                    </div>
                    <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1">बाजार में फंसा हुआ कुल धन</p>
                  </div>
                </div>

                {/* Stores Overview Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl">
                  <div className="p-3.5 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <h3 className="text-sm font-black text-white">दुकानों का लेजर व वित्तीय सारांश</h3>
                      <p className="text-xs text-slate-400">प्लेटफॉर्म की सभी पंजीकृत दुकानों का टर्नओवर</p>
                    </div>
                    <button
                      onClick={handleExportCSV}
                      className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-400 border border-slate-700"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>एक्सेल शीट डाउनलोड</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto -mx-1 sm:mx-0">
                    <table className="w-full text-left text-xs min-w-[650px]">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                        <tr>
                          <th className="px-3.5 sm:px-4 py-3">दुकान</th>
                          <th className="px-3.5 sm:px-4 py-3">मालिक व मोबाइल</th>
                          <th className="px-3.5 sm:px-4 py-3">स्थिति</th>
                          <th className="px-3.5 sm:px-4 py-3 text-right">ग्राहक</th>
                          <th className="px-3.5 sm:px-4 py-3 text-right">उधारी</th>
                          <th className="px-3.5 sm:px-4 py-3 text-right">जमा</th>
                          <th className="px-3.5 sm:px-4 py-3 text-right">बाकी</th>
                          <th className="px-3.5 sm:px-4 py-3 text-center">एक्शन</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {shops.map(s => (
                          <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-bold text-white">{s.shop_name}</div>
                              <span className="text-[10px] text-slate-500">ID: #{s.id}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-slate-300">{s.owner_name}</div>
                              <div className="text-slate-500 font-mono text-[11px]">{s.phone}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                s.status === 'pending'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-700'
                                  : s.status === 'suspended'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-700'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              }`}>
                                {s.status || 'approved'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-300">{s.customer_count || 0}</td>
                            <td className="px-4 py-3 text-right font-mono text-amber-400">₹{(s.total_udhaar || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right font-mono text-emerald-400">₹{(s.total_jama || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-white">₹{(s.net_due || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleImpersonate(s)}
                                className="px-2.5 py-1 rounded-lg bg-teal-950 hover:bg-teal-900 border border-teal-700 text-teal-300 font-bold text-[10px]"
                              >
                                लॉगिन करें
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: GOOGLE DRIVE MASTER BACKUP & DISASTER RECOVERY */}
            {activeTab === 'backup' && (
              <div className="space-y-4 sm:space-y-6">
                {/* Header Banner */}
                <div className="bg-gradient-to-br from-slate-900 via-sky-950/20 to-slate-900 border border-sky-800/40 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="p-2.5 sm:p-3.5 rounded-2xl bg-sky-600/20 text-sky-400 border border-sky-500/30 shadow-inner shrink-0">
                        <Cloud className="w-6 h-6 sm:w-8 sm:h-8" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base sm:text-xl font-black text-white">Google Drive मास्टर ऑटो-बैकअप</h2>
                          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold shrink-0">
                            सुपर एडमिन नियंत्रण
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                          पूरे प्रोजेक्ट का डेटा (सभी दुकानें, ग्राहक, लेन-देन, इन्वेंटरी और सेटिंग्स) सीधे आपके अपने Google Drive पर सुरक्षित ऑटो-स्टोर होता रहेगा।
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5 bg-slate-950/60 p-2.5 sm:p-3 rounded-2xl border border-slate-800 self-start sm:self-auto">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${backupSettings.auto_backup_enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span className="text-xs font-black text-white">
                          {backupSettings.auto_backup_enabled ? 'क्लाउड ऑटो-सिंक: सक्रिय' : 'क्लाउड ऑटो-सिंक: निष्क्रिय'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        अंतिम बैकअप:{' '}
                        <span className="text-sky-300 font-mono font-bold">
                          {backupSettings.last_backup_time || 'अभी तक कोई बैकअप नहीं'}
                        </span>
                      </div>
                      {backupSettings.last_backup_status && (
                        <div className="text-[10px] text-slate-500">
                          स्थिति:{' '}
                          <span className={backupSettings.last_backup_status.includes('सफल') ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {backupSettings.last_backup_status}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Immediate Action Buttons Bar */}
                  <div className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3">
                    <button
                      onClick={handleSyncAllToGoogleDrive}
                      disabled={backupSyncing}
                      className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-black text-xs shadow-lg shadow-sky-900/40 transition-all active:scale-98 disabled:opacity-50"
                    >
                      {backupSyncing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          <span>Google Drive पर अपलोड हो रहा है...</span>
                        </>
                      ) : (
                        <>
                          <CloudUpload className="w-4 h-4 text-sky-200" />
                          <span>☁️ अभी पूरे प्रोजेक्ट का बैकअप Google Drive पर भेजें</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDownloadFullPlatformBackup}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all active:scale-98"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>📥 पूरा सिस्टम JSON बैकअप डाउनलोड करें</span>
                    </button>
                  </div>
                </div>

                {/* Metrics Summary Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400">कुल पंजीकृत दुकानें</span>
                    <div className="text-xl font-black text-white mt-1">{shops.length}</div>
                    <span className="text-[10px] text-slate-500">सभी स्टोर्स सम्मिलित</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400">कुल ग्राहक रिकॉर्ड</span>
                    <div className="text-xl font-black text-emerald-400 mt-1">{stats?.totalCustomers || 0}</div>
                    <span className="text-[10px] text-slate-500">सकुशल बैकअप में संरक्षित</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400">कुल उधारी व जमा लेन-देन</span>
                    <div className="text-xl font-black text-sky-400 mt-1">{stats?.totalTransactions || 0}</div>
                    <span className="text-[10px] text-slate-500">समस्त बही-खाता इतिहास</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400">सुरक्षा एन्क्रिप्शन</span>
                    <div className="text-xl font-black text-amber-400 mt-1">Bcrypt Vault</div>
                    <span className="text-[10px] text-slate-500">पासवर्ड व पिन पूर्ण सुरक्षित</span>
                  </div>
                </div>

                {/* Main 2-Column Section: Settings Form & Google Apps Script Setup Guide */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Backup Configuration Settings */}
                  <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
                        <Sliders className="w-5 h-5 text-sky-400" />
                        <h3 className="text-sm font-black text-white">क्लाउड बैकअप सेटिंग्स (Sync Configuration)</h3>
                      </div>

                      <form onSubmit={handleSaveBackupSettings} className="space-y-4 text-xs">
                        {/* Auto-Backup Toggle */}
                        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                          <div>
                            <span className="font-extrabold text-white block">स्वचालित क्लाउड बैकअप (Automated Drive Sync)</span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              निर्धारित समयांतराल पर बिना किसी रुकावट बैकअप Google Drive पर पहुंचता रहेगा
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBackupSettings(prev => ({ ...prev, auto_backup_enabled: !prev.auto_backup_enabled }))}
                            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                              backupSettings.auto_backup_enabled ? 'bg-emerald-600 justify-end' : 'bg-slate-700 justify-start'
                            }`}
                          >
                            <span className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
                          </button>
                        </div>

                        {/* Real-time Entry Sync Toggle */}
                        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                          <div>
                            <span className="font-extrabold text-white block">हर नई एंट्री पर रियल-टाइम बैकअप (Live Entry Sync)</span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              किसी भी दुकान में नया ग्राहक, उधारी/जमा या सामान जोड़ने पर तुरंत बैकअप ट्रिगर होगा
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBackupSettings(prev => ({ ...prev, sync_on_any_store_entry: !prev.sync_on_any_store_entry }))}
                            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                              backupSettings.sync_on_any_store_entry ? 'bg-sky-600 justify-end' : 'bg-slate-700 justify-start'
                            }`}
                          >
                            <span className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
                          </button>
                        </div>

                        {/* Sync Frequency / Interval */}
                        <div>
                          <label className="text-slate-300 font-extrabold block mb-1">
                            स्वचालित बैकअप अंतराल (Sync Frequency)
                          </label>
                          <select
                            value={backupSettings.auto_backup_interval_hours}
                            onChange={e => setBackupSettings(prev => ({ ...prev, auto_backup_interval_hours: Number(e.target.value) }))}
                            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                          >
                            <option value={1}>प्रत्येक 1 घंटा (Every 1 Hour)</option>
                            <option value={2}>प्रत्येक 2 घंटे (Every 2 Hours - अनुशंसित)</option>
                            <option value={6}>प्रत्येक 6 घंटे (Every 6 Hours)</option>
                            <option value={12}>प्रत्येक 12 घंटे (Every 12 Hours)</option>
                            <option value={24}>प्रत्येक 24 घंटे / प्रतिदिन (Once Daily)</option>
                          </select>
                          <span className="text-[10px] text-slate-500 block mt-1">
                            सिस्टम बैकग्राउंड में बिना लोड दिए डेटाबेस का स्नैपशॉट क्लाउड पर अपलोड करता रहेगा।
                          </span>
                        </div>

                        {/* Webhook URL Input */}
                        <div>
                          <label className="text-slate-300 font-extrabold block mb-1">
                            Google Apps Script Webhook URL <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="url"
                            placeholder="https://script.google.com/macros/s/.../exec"
                            value={backupSettings.gdrive_webhook_url}
                            onChange={e => setBackupSettings(prev => ({ ...prev, gdrive_webhook_url: e.target.value.trim() }))}
                            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">
                            दाईं ओर दिए गए गूगल स्क्रिप्ट को डिप्लॉय करके मिलने वाला वेबहुक URL यहाँ पेस्ट करें।
                          </p>
                        </div>

                        {/* Save Button */}
                        <div className="pt-2">
                          <button
                            type="submit"
                            disabled={backupSaving}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition-all disabled:opacity-50"
                          >
                            {backupSaving ? (
                              <span>⏳ सेटिंग्स सुरक्षित हो रही हैं...</span>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>💾 बैकअप सेटिंग्स सुरक्षित करें (Save Backup Settings)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className="mt-4 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-[11px] space-y-2">
                      <div className="font-extrabold text-white flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-emerald-400" />
                        <span>Google Drive में दोनों बैकअप पूरी तरह अलग-अलग फ़ोल्डर्स में सुरक्षित:</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[10px]">
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-emerald-500/30 text-emerald-300">
                          <span className="font-bold block text-white mb-0.5">📁 पूरे प्रोजेक्ट का मास्टर बैकअप:</span>
                          <code className="text-[9px] bg-slate-950 px-1 py-0.5 rounded">1_Dukaan_FULL_PROJECT_Master_Backups</code>
                          <p className="text-slate-400 mt-1">सभी दुकानों, ग्राहकों व खातों का संपूर्ण बैकअप।</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-sky-500/30 text-sky-300">
                          <span className="font-bold block text-white mb-0.5">📁 व्यक्तिगत दुकान का बैकअप:</span>
                          <code className="text-[9px] bg-slate-950 px-1 py-0.5 rounded">2_Dukaan_INDIVIDUAL_STORES_Backups</code>
                          <p className="text-slate-400 mt-1">दुकान-वार अलग सब-फ़ोल्डर (Store_दुकाननाम_ID)।</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Google Apps Script Template & Instructions */}
                  <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                        <div className="flex items-center gap-2">
                          <Database className="w-5 h-5 text-emerald-400" />
                          <h3 className="text-sm font-black text-white">Google Apps Script सेटअप गाइड (2 मिनट)</h3>
                        </div>
                        <button
                          onClick={copyScriptToClipboard}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black shadow-md transition-all active:scale-95 cursor-pointer"
                        >
                          {copiedScript ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>कॉपीड! (Copied)</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>1-क्लिक कोड कॉपी करें</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Step-by-Step Instructions */}
                      <div className="space-y-2.5 text-xs text-slate-300 mb-4">
                        <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-800/40 border border-slate-800">
                          <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-black text-[11px] flex items-center justify-center shrink-0">1</span>
                          <div>
                            <span className="font-bold text-white">Google Apps Script खोलें:</span> अपने ब्राउज़र में{' '}
                            <a
                              href="https://script.google.com/home"
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-400 underline inline-flex items-center gap-0.5 hover:text-sky-300"
                            >
                              script.google.com <ExternalLink className="w-2.5 h-2.5 inline" />
                            </a>{' '}
                            खोलें और <strong>"New project"</strong> पर क्लिक करें।
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-800/40 border border-slate-800">
                          <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-black text-[11px] flex items-center justify-center shrink-0">2</span>
                          <div>
                            <span className="font-bold text-white">कोड पेस्ट करें:</span> ऊपर दिया गया कोड कॉपी करें और पुराने कोड को हटाकर इसे पेस्ट कर दें।
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-800/40 border border-slate-800">
                          <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-black text-[11px] flex items-center justify-center shrink-0">3</span>
                          <div>
                            <span className="font-bold text-white">वेब ऐप डिप्लॉय करें:</span> ऊपर <strong>"Deploy"</strong> &gt; <strong>"New deployment"</strong> पर क्लिक करें। Gear आइकन से <strong>"Web app"</strong> चुनें। <em>Who has access</em> को <strong>"Anyone"</strong> रखें और <strong>Deploy</strong> दबाएं।
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-800/40 border border-slate-800">
                          <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-black text-[11px] flex items-center justify-center shrink-0">4</span>
                          <div>
                            <span className="font-bold text-white">URL पेस्ट करें:</span> मिलने वाले <strong>Web app URL</strong> को कॉपी करके बाईं तरफ के इनपुट बॉक्स में पेस्ट कर दें। काम पूरा!
                          </div>
                        </div>
                      </div>

                      {/* Code Block */}
                      <div className="relative">
                        <pre className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300/90 overflow-x-auto max-h-52 leading-relaxed">
                          {gdriveMasterScriptCode}
                        </pre>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                      <span>📁 फोल्डर नाम: <strong>Dukaan_Platform_Master_Backups</strong></span>
                      <span>🔒 पूर्ण डेटा प्राइवेसी</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* RESET MERCHANT PIN MODAL */}
          {resetPinShop && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs">
              <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">व्यापारी पिन / पासवर्ड रीसेट</h3>
                    <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{resetPinShop.shop_name}</p>
                  </div>
                </div>

                <form onSubmit={handleResetMerchantPin} className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">नया 4-अंकों का सुरक्षा पिन (PIN)</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={merchantNewPin}
                      onChange={e => setMerchantNewPin(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 font-bold block mb-1">नया पासवर्ड (Password)</label>
                    <input
                      type="text"
                      value={merchantNewPass}
                      onChange={e => setMerchantNewPass(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-800 text-[10px] text-slate-400">
                    💡 रीसेट के बाद दुकानदार इस नए पिन/पासवर्ड से तुरंत लॉगिन कर सकेगा।
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setResetPinShop(null)}
                      className="w-1/2 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-bold"
                    >
                      रद्द करें
                    </button>
                    <button
                      type="submit"
                      disabled={resetPinLoading}
                      className="w-1/2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-950"
                    >
                      {resetPinLoading ? 'रीसेट हो रहा है...' : 'पिन रीसेट करें'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* SHOP DETAILS AUDIT MODAL */}
          {detailShop && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs">
              <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between mb-4 pb-3 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        ID: #{detailShop.id}
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {detailShop.status || 'approved'}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-white mt-1">{detailShop.shop_name}</h2>
                    <p className="text-xs text-slate-400">
                      मालिक: {detailShop.owner_name} • मोबाइल: {detailShop.phone}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetailShop(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    ✕
                  </button>
                </div>

                {detailsLoading ? (
                  <div className="text-center py-10 text-xs text-slate-400">
                    ⏳ दुकान का वित्तीय ब्योरा लोड हो रहा है...
                  </div>
                ) : shopDetailsData ? (
                  <div className="space-y-4 text-xs">
                    {/* Store Meta */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 p-3 bg-slate-950 rounded-2xl border border-slate-800">
                      <div>
                        <span className="text-slate-500 block text-[10px]">पता:</span>
                        <span className="font-bold text-slate-200">{shopDetailsData.shop.address || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">UPI आईडी:</span>
                        <span className="font-bold font-mono text-emerald-400">{shopDetailsData.shop.upi_id || '—'}</span>
                      </div>
                    </div>

                    {/* Top 5 Debtors */}
                    <div>
                      <h4 className="text-xs font-black text-white mb-2 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-blue-400" />
                        <span>शीर्ष 5 देनदार ग्राहक (Top Debtors)</span>
                      </h4>
                      {shopDetailsData.top_customers.length === 0 ? (
                        <p className="text-slate-500 text-[11px]">कोई ग्राहक नहीं मिले</p>
                      ) : (
                        <div className="space-y-1.5">
                          {shopDetailsData.top_customers.map(c => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 border border-slate-800"
                            >
                              <div>
                                <span className="font-bold text-white">{c.name}</span>
                                {c.phone && <span className="text-slate-500 font-mono ml-2">({c.phone})</span>}
                              </div>
                              <span className="font-bold font-mono text-amber-400">
                                ₹{c.due.toLocaleString('en-IN')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recent 5 Transactions */}
                    <div>
                      <h4 className="text-xs font-black text-white mb-2 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-teal-400" />
                        <span>हालिया 5 लेन-देन (Recent Transactions)</span>
                      </h4>
                      {shopDetailsData.recent_transactions.length === 0 ? (
                        <p className="text-slate-500 text-[11px]">कोई हालिया लेन-देन नहीं मिला</p>
                      ) : (
                        <div className="space-y-1.5">
                          {shopDetailsData.recent_transactions.map(t => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 border border-slate-800"
                            >
                              <div>
                                <span className="font-bold text-white">{t.customer_name || 'ग्राहक'}</span>
                                <span className="text-slate-400 ml-2">{t.notes}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    t.type === 'udhaar' ? 'bg-amber-950 text-amber-400' : 'bg-emerald-950 text-emerald-400'
                                  }`}
                                >
                                  {t.type === 'udhaar' ? 'उधार' : 'जमा'}
                                </span>
                                <span className="font-mono font-bold text-white">₹{t.amount}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => handleImpersonate(shopDetailsData.shop)}
                        className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-teal-950 active:scale-98"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>इस दुकान के डैशबोर्ड में सीधे जाएं</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* CHANGE ADMIN PASSWORD MODAL */}
          {isChangePassOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs">
              <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto">
                <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <span>सुपर एडमिन पासवर्ड बदलें</span>
                </h3>

                <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">वर्तमान पासवर्ड</label>
                    <input
                      type="password"
                      value={currentPass}
                      onChange={e => setCurrentPass(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">नया पासवर्ड</label>
                    <input
                      type="password"
                      value={newPass}
                      onChange={e => setNewPass(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsChangePassOpen(false)}
                      className="w-1/2 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-bold"
                    >
                      रद्द करें
                    </button>
                    <button
                      type="submit"
                      disabled={passLoading}
                      className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold"
                    >
                      {passLoading ? 'सेव हो रहा है...' : 'पासवर्ड सेव करें'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
