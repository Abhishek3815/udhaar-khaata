export interface Customer {
  id: number;
  shop_id?: number;
  name: string;
  phone: string;
  address: string;
  due_date?: string;
  credit_limit?: number;
  credit_period_days?: number; // Days granted for udhaar (e.g. 7, 15, 30 days)
  created_at?: string;
  total_udhaar?: number;
  total_jama?: number;
  net_balance?: number;
  passbook_token?: string;
}

export interface Transaction {
  id: number;
  shop_id?: number;
  customer_id: number;
  customer_name?: string;
  customer_phone?: string;
  type: 'udhaar' | 'jama';
  amount: number;
  notes: string;
  date: string;
  voice_recorded?: boolean;
  bill_image?: string;
  created_at?: string;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_reason?: string;
  deleted_by?: string;
}

export interface Product {
  id: number;
  shop_id?: number;
  name: string;
  category: string;
  unit: string;
  purchase_price: number;
  selling_price: number;
  wholesale_price?: number;
  stock_quantity: number;
  min_stock_alert: number;
  barcode?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MandiAlert {
  id: number;
  shop_id?: number;
  product_name: string;
  old_price: number;
  new_price: number;
  wholesale_price?: number;
  unit: string;
  notes?: string;
  sender_name?: string;
  created_at: string;
}

export interface ShopSettings {
  shop_name: string;
  owner_name: string;
  phone: string;
  email?: string;
  address: string;
  upi_id: string;
  logo?: string | null;
  staff_phones?: string | null;
  gdrive_webhook_url?: string | null;
  auto_backup_enabled?: boolean | number;
  last_backup_time?: string | null;
  last_backup_status?: string | null;
  pin?: string;
  password?: string;
}

export interface PlatformBackupSettings {
  gdrive_webhook_url?: string | null;
  auto_backup_enabled: boolean;
  auto_backup_interval_hours: number;
  sync_on_any_store_entry: boolean;
  last_backup_time?: string | null;
  last_backup_status?: string | null;
}

export interface DbStatus {
  success: boolean;
  dbType: string;
  isMySQLConnected: boolean;
  connectionError: string | null;
  env: {
    host: string;
    port: string;
    database: string;
    user: string;
    serverPort: number;
    serverHost: string;
    geminiConfigured: boolean;
  };
  stats: {
    totalCustomers: number;
    totalUdhaar: number;
    totalJama: number;
    totalProducts: number;
    totalStockValuePurchase: number;
    totalStockValueSelling: number;
    potentialProfit: number;
    lowStockCount: number;
    lowStockProducts: Product[];
  };
}

export interface VoiceParseResult {
  intent: 'transaction' | 'product' | 'mandi_alert' | 'unknown';
  customerName?: string;
  customerId?: number;
  type?: 'udhaar' | 'jama';
  amount?: number;
  creditPeriodDays?: number;
  notes?: string;
  name?: string;
  productName?: string;
  productId?: number;
  product?: Product;
  productAction?: 'add_stock' | 'reduce_stock' | 'update_price' | 'delete' | 'inquiry';
  currentStock?: number;
  targetStock?: number;
  oldPrice?: number;
  newPrice?: number;
  wholesalePrice?: number;
  category?: string;
  unit?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  quantity?: number;
  confidence?: number;
  confirmationSpeech?: string;
  rawText?: string;
  suggestion?: string;
  customer?: Customer;
  candidateCustomers?: Customer[];
  candidateProducts?: Product[];
}
