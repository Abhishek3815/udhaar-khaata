/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Customer, Product, ShopSettings, DbStatus, MandiAlert } from './types';
import { Header } from './components/Header';
import { DesktopSidebar } from './components/DesktopSidebar';
import { BottomNav } from './components/BottomNav';
import { LedgerTab } from './components/LedgerTab';
import { ProductsTab } from './components/ProductsTab';
import { VoiceModal } from './components/VoiceModal';
import { CustomerDetailModal } from './components/CustomerDetailModal';
import { AddCustomerModal } from './components/AddCustomerModal';
import { EditCustomerModal } from './components/EditCustomerModal';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AddProductModal } from './components/AddProductModal';
import { ShopSettingsModal } from './components/ShopSettingsModal';
import { MandiAlertModal } from './components/MandiAlertModal';
import { LoginPage } from './components/LoginPage';
import { SuperAdminPortal } from './components/SuperAdminPortal';
import { InstallWizardModal } from './components/InstallWizardModal';
import { HotspotSyncModal } from './components/HotspotSyncModal';
import { OfflineSyncEngine } from './utils/offlineSync';
import { AuthEngine } from './utils/auth';
import { playSoundboxVoice } from './utils/speech';
import { CustomerPassbookView } from './components/CustomerPassbookView';
import { useLanguage } from './context/LanguageContext';

const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  shop_name: 'दुकान खाता',
  owner_name: 'दुकानदार',
  phone: '',
  address: '',
  upi_id: '',
  logo: ''
};

export default function App() {
  const { lang, setLang, toggleLang } = useLanguage();

  // Customer Self-service Passbook link check
  const [passbookToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('passbook');
      if (token) return token;
      const hashMatch = window.location.hash.match(/passbook[=/]([a-f0-9]+)/i);
      if (hashMatch) return hashMatch[1];
    }
    return null;
  });

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return AuthEngine.isLoggedIn();
  });

  // Super Admin Portal modal state (can also be opened via #admin or #/admin)
  const [isSuperAdminOpen, setIsSuperAdminOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      return hash === '#admin' || hash === '#/admin';
    }
    return false;
  });

  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash;
      if (h === '#admin' || h === '#/admin') {
        setIsSuperAdminOpen(true);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleCloseSuperAdmin = () => {
    setIsSuperAdminOpen(false);
    if (typeof window !== 'undefined' && (window.location.hash === '#admin' || window.location.hash === '#/admin')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  // 1-Click Database Installation Wizard Modal State
  const [isInstallWizardOpen, setIsInstallWizardOpen] = useState<boolean>(false);

  // Automatically start installation wizard if neither installed.lock nor install.lock exists
  useEffect(() => {
    const checkInstallStatus = async () => {
      try {
        const res = await fetch('/api/install/status');
        if (res.ok) {
          const data = await res.json();
          if (data && data.installed === false) {
            // If running on PHP hosting with install.php available, navigate or open wizard
            try {
              const phpCheck = await fetch('install.php', { method: 'HEAD' });
              if (phpCheck.ok && phpCheck.headers.get('content-type')?.includes('text/html')) {
                window.location.href = 'install.php';
                return;
              }
            } catch {}
            setIsInstallWizardOpen(true);
          }
        }
      } catch (err) {
        console.warn('Install status check error:', err);
      }
    };
    checkInstallStatus();
  }, []);

  // Listen for unauthorized 401 session expiration
  useEffect(() => {
    const handleUnauthorized = () => {
      AuthEngine.clearSession();
      OfflineSyncEngine.clearLocalCache();
      setIsAuthenticated(false);
      setCustomers([]);
      setProducts([]);
      setSelectedCustomer(null);
      setSettings(DEFAULT_SHOP_SETTINGS);
    };
    window.addEventListener('dukaan:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('dukaan:unauthorized', handleUnauthorized);
  }, []);

  // Restore active tab and open customer from URL hash or localStorage
  const [activeTab, setActiveTab] = useState<'ledger' | 'products'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'products' || hash === 'rates' || hash === 'items') return 'products';
      if (hash === 'ledger' || hash === 'khata') return 'ledger';
      const savedTab = localStorage.getItem('active_tab');
      if (savedTab === 'products' || savedTab === 'ledger') return savedTab;
    }
    return 'ledger';
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<ShopSettings>(() => {
    if (typeof window !== 'undefined' && AuthEngine.isLoggedIn()) {
      const cached = OfflineSyncEngine.getLocalCache();
      if (cached && cached.settings && cached.settings.shop_name) return cached.settings;
    }
    return DEFAULT_SHOP_SETTINGS;
  });
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Dynamic Browser Title Bar: Admin -> "Admin - App ka name", Store -> "Store name - App ka name"
  useEffect(() => {
    const appName = lang === 'en' ? 'Dukaan Khaata' : 'दुकान खाता';
    if (isSuperAdminOpen) {
      document.title = `Admin - ${appName}`;
    } else if (isAuthenticated && settings?.shop_name) {
      document.title = `${settings.shop_name} - ${appName}`;
    } else if (passbookToken) {
      document.title = `Passbook - ${appName}`;
    } else {
      document.title = appName;
    }
  }, [isSuperAdminOpen, isAuthenticated, settings?.shop_name, lang, passbookToken]);

  // Soundbox & Theme settings
  const [soundboxEnabled, setSoundboxEnabled] = useState<boolean>(() => {
    return localStorage.getItem('soundbox_enabled') !== 'false';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Modals state
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem('selected_customer_id');
      if (savedId) return parseInt(savedId, 10);
    }
    return null;
  });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [quickTxCustomer, setQuickTxCustomer] = useState<Customer | null>(null);
  const [quickTxType, setQuickTxType] = useState<'udhaar' | 'jama'>('udhaar');
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isShopSettingsOpen, setIsShopSettingsOpen] = useState(false);
  const [mandiAlerts, setMandiAlerts] = useState<MandiAlert[]>([]);
  const [isMandiModalOpen, setIsMandiModalOpen] = useState(false);
  const [mandiPrefill, setMandiPrefill] = useState<any>(null);

  // Offline & Hotspot Sync state
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => OfflineSyncEngine.getQueue().length);
  const [isHotspotModalOpen, setIsHotspotModalOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Super Admin Impersonation & Global Platform Broadcast Notice
  const [isImpersonating, setIsImpersonating] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('dukaan_is_impersonating') === 'true';
  });
  const [platformNotice, setPlatformNotice] = useState<{ id?: number; message: string; type: string; updated_at?: string } | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const lastNoticeKeyRef = useRef<string>('');

  // Fetch & live refresh broadcast notice from Super Admin
  const fetchBroadcastNotice = useCallback(async () => {
    try {
      const res = await fetch('/api/broadcast');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.notice && data.notice.message) {
            const currentKey = `${data.notice.id || ''}_${data.notice.updated_at || ''}_${data.notice.message}`;
            if (currentKey !== lastNoticeKeyRef.current) {
              lastNoticeKeyRef.current = currentKey;
              setNoticeDismissed(false); // Reset dismissed status when a new notice is published
            }
            setPlatformNotice(data.notice);
          } else {
            setPlatformNotice(null); // Instantly remove banner if deactivated by admin
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchBroadcastNotice();
    // Live poll notice every 30 seconds
    const interval = setInterval(fetchBroadcastNotice, 30000);
    return () => clearInterval(interval);
  }, [fetchBroadcastNotice]);

  // Monitor online / offline network events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      playSoundboxVoice('इंटरनेट कनेक्ट हो गया है, डेटा सिंक हो रहा है', soundboxEnabled);
      // Auto-trigger sync
      triggerAutoSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      playSoundboxVoice('इंटरनेट बंद है, ऐप ऑफलाइन मोड में सुरक्षित काम करेगा', soundboxEnabled);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check & sync every 30 seconds
    const interval = setInterval(() => {
      if (navigator.onLine && OfflineSyncEngine.getQueue().length > 0) {
        triggerAutoSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [soundboxEnabled]);

  const triggerAutoSync = async () => {
    if (isSyncing) return;
    const queue = OfflineSyncEngine.getQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    try {
      const res = await OfflineSyncEngine.processSyncQueue();
      setPendingSyncCount(res.remaining);
      if (res.synced > 0) {
        playSoundboxVoice(`${res.synced} ऑफलाइन प्रविष्टियां सर्वर पर सिंक हो गईं`, soundboxEnabled);
        await fetchAllData();
      }
    } catch (e) {
      console.warn('Auto sync warning:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync activeTab with localStorage and URL hash
  const handleChangeTab = (tab: 'ledger' | 'products') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('active_tab', tab);
      window.location.hash = tab;
    }
  };

  // Sync selectedCustomer with localStorage
  const handleSelectCustomer = (c: Customer | null) => {
    setSelectedCustomer(c);
    if (typeof window !== 'undefined') {
      if (c) {
        localStorage.setItem('selected_customer_id', String(c.id));
      } else {
        localStorage.removeItem('selected_customer_id');
      }
    }
  };

  // Fetch all initial data (Protected: sensitive merchant ledger only loads when authenticated)
  const fetchAllData = useCallback(async () => {
    try {
      // If user is not authenticated, maintain neutral branding and don't load merchant data
      if (!isAuthenticated) {
        setSettings(DEFAULT_SHOP_SETTINGS);
        setCustomers([]);
        setProducts([]);
        setLoading(false);
        return;
      }

      const [sRes, dRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/db/status')
      ]);

      const [sData, dData] = await Promise.all([
        sRes.json(),
        dRes.json()
      ]);

      // If database is not configured or connection failed, redirect to install.php
      if (
        (dData && dData.error && String(dData.error).includes('Database connection failed')) ||
        (sData && sData.error && String(sData.error).includes('Database connection failed'))
      ) {
        window.location.href = 'install.php';
        return;
      }

      if (sData.success && sData.data) setSettings(sData.data);
      if (dData.success) setDbStatus(dData);

      // Only fetch sensitive merchant business records if authenticated
      const [cRes, pRes, mRes] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/products'),
        fetch('/api/mandi/alerts')
      ]);

      const [cData, pData, mData] = await Promise.all([
        cRes.json(),
        pRes.json(),
        mRes.json()
      ]);

      if (cData.success) {
        setCustomers(cData.data);
        if (selectedCustomerId) {
          const found = cData.data.find((c: Customer) => c.id === selectedCustomerId);
          if (found) setSelectedCustomer(found);
        }
      }
      if (pData.success) setProducts(pData.data);
      if (mData.success) setMandiAlerts(mData.data);

      // Cache locally for instant offline loading
      OfflineSyncEngine.saveLocalCache(cData.data, pData.data, sData.data);
    } catch (err) {
      console.warn('Network fetch failed, loading offline local cache:', err);
      if (isAuthenticated) {
        const cached = OfflineSyncEngine.getLocalCache();
        if (cached.customers && cached.customers.length > 0) setCustomers(cached.customers);
        if (cached.products && cached.products.length > 0) setProducts(cached.products);
        if (cached.settings) setSettings(cached.settings);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedCustomerId, isAuthenticated]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleLoginSuccess = (user: any) => {
    setIsAuthenticated(true);
    // Clear previous store in-memory state so new store never sees old store records
    setCustomers([]);
    setProducts([]);
    setMandiAlerts([]);
    setSelectedCustomer(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selected_customer_id');
    }
    if (user && user.shop_name) {
      setSettings(prev => ({
        ...prev,
        shop_name: user.shop_name,
        owner_name: user.owner_name || prev.owner_name,
        phone: user.phone || prev.phone
      }));
    }
    fetchAllData();
  };

  const handleImpersonateStore = (shop: any, token: string) => {
    sessionStorage.setItem('dukaan_auth_token', token);
    sessionStorage.setItem('dukaan_shop_id', String(shop.id));
    sessionStorage.setItem('dukaan_auth_user', JSON.stringify({
      shop_id: shop.id,
      shop_name: shop.shop_name,
      owner_name: shop.owner_name,
      phone: shop.phone,
      is_impersonating: true
    }));
    sessionStorage.setItem('is_logged_in', 'true');
    sessionStorage.setItem('dukaan_is_impersonating', 'true');
    setIsImpersonating(true);
    setIsSuperAdminOpen(false);
    setIsAuthenticated(true);
    // Clear in-memory state when switching stores
    setCustomers([]);
    setProducts([]);
    setMandiAlerts([]);
    setSelectedCustomer(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selected_customer_id');
    }
    setSettings(prev => ({
      ...prev,
      shop_name: shop.shop_name,
      owner_name: shop.owner_name,
      phone: shop.phone
    }));
    fetchAllData();
  };

  const handleExitImpersonation = () => {
    sessionStorage.removeItem('dukaan_is_impersonating');
    sessionStorage.removeItem('dukaan_auth_token');
    sessionStorage.removeItem('dukaan_shop_id');
    sessionStorage.removeItem('dukaan_auth_user');
    setIsImpersonating(false);
    setCustomers([]);
    setProducts([]);
    setMandiAlerts([]);
    setSelectedCustomer(null);
    setIsSuperAdminOpen(true);
  };

  const handleLogout = () => {
    if (confirm('क्या आप खाता लॉक / लॉगआउट करना चाहते हैं?')) {
      AuthEngine.clearSession();
      OfflineSyncEngine.clearLocalCache();
      setCustomers([]);
      setProducts([]);
      setSelectedCustomer(null);
      setSettings(DEFAULT_SHOP_SETTINGS);
      setIsAuthenticated(false);
      playSoundboxVoice('खाता सुरक्षित रूप से लॉक कर दिया गया है', soundboxEnabled);
    }
  };

  const handleToggleSoundbox = () => {
    const next = !soundboxEnabled;
    setSoundboxEnabled(next);
    localStorage.setItem('soundbox_enabled', String(next));
    if (next) {
      playSoundboxVoice('साउंडबॉक्स चालू है', true);
    }
  };

  const handleToggleLang = (target?: 'hi' | 'en') => {
    if (target) {
      setLang(target);
    } else {
      toggleLang();
    }
  };

  // Customers handlers
  const handleAddCustomer = async (cust: { name: string; phone?: string; address?: string }) => {
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cust)
      });
      const data = await res.json();
      if (data.success) {
        await fetchAllData();
        return data.data;
      }
      throw new Error(data.error || 'Failed to add customer');
    } catch (err: any) {
      // ONLY fall back to offline if network failed completely (offline)
      const isNetworkFailure = !navigator.onLine || err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('Failed to fetch');
      if (!isNetworkFailure) {
        // Validation / duplicate error from server -> do NOT enqueue offline!
        throw err;
      }
      // Offline fallback: save locally and queue sync
      const tempId = -Date.now();
      const localCust: Customer = {
        id: tempId,
        name: cust.name,
        phone: cust.phone || '',
        address: cust.address || '',
        total_udhaar: 0,
        total_jama: 0,
        net_balance: 0
      };
      const updated = [localCust, ...customers];
      setCustomers(updated);
      OfflineSyncEngine.saveLocalCache(updated, products, settings);
      OfflineSyncEngine.enqueue('/api/customers', 'POST', cust, `नया ग्राहक: ${cust.name}`);
      setPendingSyncCount(OfflineSyncEngine.getQueue().length);
      playSoundboxVoice(`${cust.name} ऑफलाइन जोड़ दिया गया है, नेटवर्क आने पर सिंक होगा`, soundboxEnabled);
      return localCust;
    }
  };

  const handleUpdateCustomer = async (id: number, updates: {
    name: string;
    phone?: string;
    address?: string;
    credit_limit?: number;
    credit_period_days?: number;
    due_date?: string;
  }) => {
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        await fetchAllData();
        if (selectedCustomer && selectedCustomer.id === id) {
          setSelectedCustomer(prev => prev ? { ...prev, ...updates } : null);
        }
        return true;
      }
      throw new Error(data.error || 'Failed to update customer');
    } catch (err: any) {
      // Offline fallback: update local customer in memory and queue sync
      const updated = customers.map(c => c.id === id ? { ...c, ...updates } : c);
      setCustomers(updated);
      if (selectedCustomer && selectedCustomer.id === id) {
        setSelectedCustomer(prev => prev ? { ...prev, ...updates } : null);
      }
      OfflineSyncEngine.saveLocalCache(updated, products, settings);
      OfflineSyncEngine.enqueue(`/api/customers/${id}`, 'PUT', updates, `ग्राहक विवरण अपडेट: ${updates.name}`);
      setPendingSyncCount(OfflineSyncEngine.getQueue().length);
      return true;
    }
  };

  // Quick transaction handler
  const handleAddTransaction = async (tx: {
    customer_id: number;
    type: 'udhaar' | 'jama';
    amount: number;
    notes: string;
    date: string;
    bill_image?: string;
  }) => {
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx)
      });
      const data = await res.json();
      if (data.success) {
        await fetchAllData();
        const c = customers.find(item => item.id === tx.customer_id);
        const cName = c ? c.name : 'ग्राहक';
        const phrase = tx.type === 'jama'
          ? `${cName} से ₹${tx.amount} प्राप्त हुए`
          : `${cName} के खाते में ₹${tx.amount} उधार दर्ज हुआ`;
        playSoundboxVoice(phrase, soundboxEnabled);
        return;
      }
      throw new Error(data.error || 'Server error');
    } catch {
      // Offline fallback: update local customer balance and queue sync
      const c = customers.find(item => item.id === tx.customer_id);
      const cName = c ? c.name : 'ग्राहक';

      const updatedCustomers = customers.map(item => {
        if (item.id === tx.customer_id) {
          const deltaUdhaar = tx.type === 'udhaar' ? tx.amount : 0;
          const deltaJama = tx.type === 'jama' ? tx.amount : 0;
          const newUdhaar = (item.total_udhaar || 0) + deltaUdhaar;
          const newJama = (item.total_jama || 0) + deltaJama;
          return {
            ...item,
            total_udhaar: newUdhaar,
            total_jama: newJama,
            net_balance: newUdhaar - newJama
          };
        }
        return item;
      });

      setCustomers(updatedCustomers);
      OfflineSyncEngine.saveLocalCache(updatedCustomers, products, settings);
      OfflineSyncEngine.enqueue('/api/transactions', 'POST', tx, `${cName} - ₹${tx.amount} ${tx.type === 'udhaar' ? 'उधार' : 'जमा'}`);
      setPendingSyncCount(OfflineSyncEngine.getQueue().length);

      const phrase = tx.type === 'jama'
        ? `${cName} से ₹${tx.amount} ऑफलाइन प्राप्त हुए`
        : `${cName} के खाते में ₹${tx.amount} उधार ऑफलाइन दर्ज हुआ`;
      playSoundboxVoice(phrase, soundboxEnabled);
    }
  };

  // Voice transaction & product handlers
  const handleSaveVoiceTransaction = async (tx: {
    customer_name: string;
    type: 'udhaar' | 'jama';
    amount: number;
    notes: string;
    bill_image?: string;
    credit_period_days?: number;
  }) => {
    // If credit period was extracted from voice (or set in preview)
    let calculatedDueDate: string | undefined = undefined;
    if (tx.type === 'udhaar' && tx.credit_period_days) {
      const d = new Date();
      d.setDate(d.getDate() + tx.credit_period_days);
      calculatedDueDate = d.toISOString().split('T')[0];
    }

    // Check if customer exists in current loaded list (case-insensitive)
    const cleanSpoken = tx.customer_name.toLowerCase().trim();
    const existingCust = customers.find(c => {
      const cName = c.name.toLowerCase().trim();
      return cName === cleanSpoken || cName.includes(cleanSpoken) || cleanSpoken.includes(cName);
    });

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: existingCust ? existingCust.id : undefined,
        customer_name: tx.customer_name,
        type: tx.type,
        amount: tx.amount,
        notes: tx.notes,
        voice_recorded: true,
        bill_image: tx.bill_image
      })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'लेन-देन सेव नहीं हो सका');
    }

    // If customer due date needs updating
    if (data.data?.customer_id && calculatedDueDate) {
      try {
        await fetch(`/api/customers/${data.data.customer_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            due_date: calculatedDueDate,
            credit_period_days: tx.credit_period_days
          })
        });
      } catch (e) {
        console.warn('Voice transaction due date update:', e);
      }
    }
    await fetchAllData();
  };

  const handleSaveVoiceProduct = async (prod: {
    name: string;
    purchase_price: number;
    selling_price: number;
    unit: string;
    stock_quantity: number;
  }) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...prod, force_upsert: true })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'सामान सेव नहीं हो सका');
    }
    await fetchAllData();
  };

  // Product handlers
  const handleSaveProduct = async (productData: {
    id?: number;
    name: string;
    category: string;
    unit: string;
    purchase_price: number;
    selling_price: number;
    stock_quantity: number;
    min_stock_alert: number;
  }) => {
    if (productData.id) {
      // Edit
      const res = await fetch(`/api/products/${productData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });
      const data = await res.json();
      if (data.success) {
        await fetchAllData();
      } else {
        throw new Error(data.error || 'Failed to update product');
      }
    } else {
      // Create
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });
      const data = await res.json();
      if (data.success) {
        await fetchAllData();
      } else {
        throw new Error(data.error || 'Failed to add product');
      }
    }
  };

  const handleUpdatePrice = async (id: number, purchasePrice: number, sellingPrice: number, wholesalePrice?: number) => {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchase_price: purchasePrice,
        selling_price: sellingPrice,
        ...(wholesalePrice !== undefined && { wholesale_price: wholesalePrice })
      })
    });
    const data = await res.json();
    if (data.success) {
      setProducts(prev =>
        prev.map(p =>
          p.id === id ? {
            ...p,
            purchase_price: purchasePrice,
            selling_price: sellingPrice,
            ...(wholesalePrice !== undefined && { wholesale_price: wholesalePrice })
          } : p
        )
      );
    }
  };

  const handleSaveKhataBill = async (customerId: number, amount: number, notes: string) => {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        type: 'udhaar',
        amount,
        notes,
        date: new Date().toISOString().split('T')[0]
      })
    });
    const data = await res.json();
    if (data.success) {
      await fetchAllData();
    }
  };

  const handleImportProducts = async (importedProducts: Partial<Product>[]) => {
    const res = await fetch('/api/products/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: importedProducts })
    });
    const data = await res.json();
    if (data.success) {
      await fetchAllData();
    }
  };

  const handleUpdateStock = async (id: number, newStock: number) => {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock_quantity: newStock })
    });
    const data = await res.json();
    if (data.success) {
      setProducts(prev =>
        prev.map(p => (p.id === id ? { ...p, stock_quantity: newStock } : p))
      );
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('क्या आप इस सामान को हटाना चाहते हैं?')) return;
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await fetchAllData();
    }
  };

  const handleSaveShopSettings = async (newSettings: Partial<ShopSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
    const data = await res.json();
    if (data.success) {
      setSettings(data.data);
    }
  };

  const handleSaveMandiAlert = async (alertData: any) => {
    const res = await fetch('/api/mandi/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertData)
    });
    const data = await res.json();
    if (data.success) {
      await fetchAllData();
      return data.data;
    }
    throw new Error(data.error || 'Failed to save mandi alert');
  };

  const handleDeleteMandiAlert = async (id: number) => {
    const res = await fetch(`/api/mandi/alerts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setMandiAlerts(prev => prev.filter(a => a.id !== id));
    }
  };

  // Customer Passbook View (Standalone, no merchant login required)
  if (passbookToken) {
    return <CustomerPassbookView token={passbookToken} />;
  }

  if (!isAuthenticated) {
    return (
      <>
        {/* 📢 Global Platform Broadcast Notice Banner on Login Screen */}
        {platformNotice && !noticeDismissed && (
          <div className={`fixed top-0 left-0 right-0 px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b shadow-md transition-all z-50 animate-in slide-in-from-top-2 duration-200 ${
            platformNotice.type === 'warning'
              ? 'bg-amber-500 text-slate-950 border-amber-600'
              : platformNotice.type === 'alert'
              ? 'bg-rose-600 text-white border-rose-700'
              : platformNotice.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-blue-600 text-white border-blue-700'
          }`}>
            <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1 text-center justify-center">
              <span className="text-base">📢</span>
              <span>{platformNotice.message}</span>
            </div>
            <button
              onClick={() => setNoticeDismissed(true)}
              className="p-1 rounded-lg hover:bg-black/20 text-current text-xs ml-2 cursor-pointer"
              title="बंद करें"
            >
              ✕
            </button>
          </div>
        )}
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          settings={settings}
          soundboxEnabled={soundboxEnabled}
          lang={lang}
          onToggleLang={handleToggleLang}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenAdmin={() => setIsSuperAdminOpen(true)}
        />
        {isSuperAdminOpen && (
          <SuperAdminPortal
            isOpen={isSuperAdminOpen}
            onClose={handleCloseSuperAdmin}
            lang={lang}
            onImpersonateStore={handleImpersonateStore}
          />
        )}
        {isInstallWizardOpen && (
          <InstallWizardModal
            isOpen={isInstallWizardOpen}
            onClose={() => setIsInstallWizardOpen(false)}
            onSuccess={() => window.location.reload()}
            onOpenAdmin={() => {
              setIsInstallWizardOpen(false);
              setIsSuperAdminOpen(true);
            }}
            lang={lang}
          />
        )}
      </>
    );
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} flex transition-colors duration-200`}>
      {/* 🖥️ Desktop Sidebar Navigation (Only visible on lg: and above) */}
      <DesktopSidebar
        activeTab={activeTab}
        onChangeTab={(tab) => handleChangeTab(tab)}
        settings={settings}
        soundboxEnabled={soundboxEnabled}
        onToggleSoundbox={handleToggleSoundbox}
        onOpenSettings={() => setIsShopSettingsOpen(true)}
        onLogout={handleLogout}
        lang={lang}
        onToggleLang={handleToggleLang}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        onOpenHotspotSync={() => setIsHotspotModalOpen(true)}
        onOpenMandiModal={() => {
          setMandiPrefill(null);
          setIsMandiModalOpen(true);
        }}
        onOpenVoice={() => setIsVoiceOpen(true)}
        customers={customers}
        productsCount={products.length}
      />

      {/* Main View Area: Expands gracefully on Desktop, native mobile layout on Mobile */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0 relative">
        {/* 📢 Global Platform Broadcast Notice Banner */}
        {platformNotice && !noticeDismissed && (
          <div className={`px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b shadow-xs transition-all z-40 ${
            platformNotice.type === 'warning'
              ? 'bg-amber-500 text-slate-950 border-amber-600'
              : platformNotice.type === 'alert'
              ? 'bg-rose-600 text-white border-rose-700'
              : platformNotice.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-blue-600 text-white border-blue-700'
          }`}>
            <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1">
              <span className="text-base">📢</span>
              <span>{platformNotice.message}</span>
            </div>
            <button
              onClick={() => setNoticeDismissed(true)}
              className="p-1 rounded-lg hover:bg-black/20 text-current text-xs ml-2 cursor-pointer"
              title="बंद करें"
            >
              ✕
            </button>
          </div>
        )}

        {/* ⚠️ Super Admin Impersonation Action Bar */}
        {isImpersonating && (
          <div className="bg-amber-400 text-slate-950 px-4 py-2 text-xs font-black flex items-center justify-between shadow-md border-b border-amber-500 sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <span className="text-base">👀</span>
              <span>सुपर एडमिन मोड: आप '{settings.shop_name}' (ID: #{AuthEngine.getShopId()}) का खाता देख रहे हैं।</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExitImpersonation}
                className="px-3 py-1 rounded-lg bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                ← वापस सुपर एडमिन में जाएं
              </button>
            </div>
          </div>
        )}

        {/* App Header (Desktop Top Action Bar & Mobile App Bar) */}
        <Header
          settings={settings}
          dbStatus={dbStatus}
          soundboxEnabled={soundboxEnabled}
          onToggleSoundbox={handleToggleSoundbox}
          onOpenVoice={() => setIsVoiceOpen(true)}
          onOpenSettings={() => setIsShopSettingsOpen(true)}
          onLogout={handleLogout}
          lang={lang}
          onToggleLang={handleToggleLang}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          isOnline={isOnline}
          pendingSyncCount={pendingSyncCount}
          onOpenHotspotSync={() => setIsHotspotModalOpen(true)}
          onOpenAddCustomer={() => setIsAddCustomerOpen(true)}
          onOpenQuickBill={() => handleChangeTab('products')}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-emerald-800 dark:text-emerald-400 text-xs space-y-3">
              <div className="w-9 h-9 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <p className="font-extrabold text-sm">{lang === 'en' ? 'Loading Dukaan Khaata...' : 'दुकान का खाता खुल रहा है...'}</p>
            </div>
          ) : activeTab === 'ledger' ? (
            <LedgerTab
              customers={customers}
              settings={settings}
              onSelectCustomer={(c) => handleSelectCustomer(c)}
              onOpenAddCustomer={() => setIsAddCustomerOpen(true)}
              onOpenQuickTx={(c, type) => {
                setQuickTxCustomer(c);
                setQuickTxType(type);
              }}
              onEditCustomer={(c) => setEditingCustomer(c)}
              lang={lang}
            />
          ) : (
            <ProductsTab
              products={products}
              customers={customers}
              settings={settings}
              soundboxEnabled={soundboxEnabled}
              onOpenAddProduct={(p) => {
                setProductToEdit(p || null);
                setIsAddProductOpen(true);
              }}
              onUpdateStock={handleUpdateStock}
              onUpdatePrice={handleUpdatePrice}
              onDeleteProduct={handleDeleteProduct}
              onSaveKhataTransaction={handleSaveKhataBill}
              onImportProducts={handleImportProducts}
              onOpenVoice={() => setIsVoiceOpen(true)}
              lang={lang}
              mandiAlerts={mandiAlerts}
              onOpenMandiModal={(prefill) => {
                setMandiPrefill(prefill || null);
                setIsMandiModalOpen(true);
              }}
              onDeleteMandiAlert={handleDeleteMandiAlert}
            />
          )}
        </main>

        {/* Android Native Bottom Navigation Bar */}
        <BottomNav
          activeTab={activeTab}
          onChangeTab={(tab) => handleChangeTab(tab)}
          onOpenVoice={() => setIsVoiceOpen(true)}
          lang={lang}
        />
      </div>

        {/* --- ALL MODALS --- */}

        {/* 1. Voice Assistant Modal */}
        <VoiceModal
          isOpen={isVoiceOpen}
          onClose={() => setIsVoiceOpen(false)}
          onSaveTransaction={handleSaveVoiceTransaction}
          onSaveProduct={handleSaveVoiceProduct}
          soundboxEnabled={soundboxEnabled}
          onOpenMandiAlert={(data) => {
            setMandiPrefill(data);
            setIsMandiModalOpen(true);
          }}
          customers={customers}
          products={products}
        />

        {/* 2. Customer Ledger Details Modal */}
        <CustomerDetailModal
          customer={selectedCustomer}
          settings={settings}
          isOpen={Boolean(selectedCustomer)}
          onClose={() => handleSelectCustomer(null)}
          onRefresh={fetchAllData}
          soundboxEnabled={soundboxEnabled}
          onUpdateCustomer={handleUpdateCustomer}
          existingCustomers={customers}
        />

        {/* 3. Add Customer Modal */}
        <AddCustomerModal
          isOpen={isAddCustomerOpen}
          onClose={() => setIsAddCustomerOpen(false)}
          onAddCustomer={handleAddCustomer}
          existingCustomers={customers}
          lang={lang}
        />

        {/* 3b. Edit Customer Modal (Direct from Ledger Tab) */}
        <EditCustomerModal
          isOpen={Boolean(editingCustomer)}
          onClose={() => setEditingCustomer(null)}
          customer={editingCustomer}
          onUpdateCustomer={handleUpdateCustomer}
          existingCustomers={customers}
          soundboxEnabled={soundboxEnabled}
          lang={lang}
        />

        {/* 4. Quick Add Transaction Modal */}
        <AddTransactionModal
          isOpen={Boolean(quickTxCustomer)}
          onClose={() => setQuickTxCustomer(null)}
          customer={quickTxCustomer}
          defaultType={quickTxType}
          settings={settings}
          soundboxEnabled={soundboxEnabled}
          onAddTransaction={handleAddTransaction}
        />

        {/* 5. Add / Edit Product Modal */}
        <AddProductModal
          isOpen={isAddProductOpen}
          onClose={() => {
            setIsAddProductOpen(false);
            setProductToEdit(null);
          }}
          productToEdit={productToEdit}
          existingProducts={products}
          onSaveProduct={handleSaveProduct}
        />

        {/* 6. Shop Profile & Voice Settings Modal */}
        <ShopSettingsModal
          isOpen={isShopSettingsOpen}
          onClose={() => setIsShopSettingsOpen(false)}
          settings={settings}
          soundboxEnabled={soundboxEnabled}
          onToggleSoundbox={handleToggleSoundbox}
          onSaveSettings={handleSaveShopSettings}
        />

        {/* 7. Mandi Price Alert Modal (Wholesale to Staff Broadcast) */}
        <MandiAlertModal
          isOpen={isMandiModalOpen}
          onClose={() => {
            setIsMandiModalOpen(false);
            setMandiPrefill(null);
          }}
          products={products}
          settings={settings}
          soundboxEnabled={soundboxEnabled}
          onSaveAlert={handleSaveMandiAlert}
          prefilledData={mandiPrefill}
        />

        {/* 8. Hotspot & Offline Sync Manager Modal */}
        <HotspotSyncModal
          isOpen={isHotspotModalOpen}
          onClose={() => setIsHotspotModalOpen(false)}
          lang={lang}
          isOnline={isOnline}
          pendingSyncCount={pendingSyncCount}
          onManualSync={triggerAutoSync}
          syncing={isSyncing}
        />

        {/* 9. Super Admin Portal Modal (Store Approvals & Multi-tenant Management) */}
        <SuperAdminPortal
          isOpen={isSuperAdminOpen}
          onClose={handleCloseSuperAdmin}
          lang={lang}
          onImpersonateStore={handleImpersonateStore}
        />

        {/* 10. Database Installation Wizard Modal */}
        {isInstallWizardOpen && (
          <InstallWizardModal
            isOpen={isInstallWizardOpen}
            onClose={() => setIsInstallWizardOpen(false)}
            onSuccess={() => window.location.reload()}
            onOpenAdmin={() => {
              setIsInstallWizardOpen(false);
              setIsSuperAdminOpen(true);
            }}
            lang={lang}
          />
        )}
    </div>
  );
}
