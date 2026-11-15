import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { Customer, Transaction, Product, MandiAlert, ShopSettings, DbStatus } from '../src/types';

export type { Customer, Transaction, Product, MandiAlert, ShopSettings, DbStatus };

const DATA_DIR = path.resolve(process.cwd(), 'data');
const JSON_DB_FILE = path.join(DATA_DIR, 'dukaan_db.json');

// Initial seed data
const initialData = {
  customers: [
    { id: 1, name: 'रमेश शर्मा (Ramesh)', phone: '9876543210', address: 'मेन मार्केट, दुकान नं 4', created_at: new Date().toISOString() },
    { id: 2, name: 'सुरेश वर्मा (Suresh)', phone: '9812345678', address: 'वार्ड नं 3, गली नं 2', created_at: new Date().toISOString() },
    { id: 3, name: 'अनीता गुप्ता (Anita)', phone: '9898989898', address: 'शांति नगर', created_at: new Date().toISOString() },
    { id: 4, name: 'विकास यादव (Vikas)', phone: '9765432109', address: 'सब्जी मंडी के पास', created_at: new Date().toISOString() }
  ],
  transactions: [
    { id: 1, customer_id: 1, type: 'udhaar', amount: 850, notes: 'राशन सामान (आटा, तेल, चीनी)', date: new Date().toISOString().split('T')[0], voice_recorded: true, created_at: new Date().toISOString() },
    { id: 2, customer_id: 1, type: 'jama', amount: 300, notes: 'कैश जमा किया', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() },
    { id: 3, customer_id: 2, type: 'udhaar', amount: 1250, notes: 'महीने का किराना', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() },
    { id: 4, customer_id: 3, type: 'udhaar', amount: 450, notes: 'दाल और मसाले', date: new Date().toISOString().split('T')[0], voice_recorded: true, created_at: new Date().toISOString() },
    { id: 5, customer_id: 3, type: 'jama', amount: 450, notes: 'फोनपे द्वारा पूरा भुगतान', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() },
    { id: 6, customer_id: 4, type: 'udhaar', amount: 620, notes: 'ड्राई फ्रूट्स और बिस्कुट', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() }
  ],
  products: [
    { id: 1, name: 'आशीर्वाद आटा (Aashirvaad Aata 5kg)', category: 'अनाज/किराना', unit: 'पैकेट', purchase_price: 210, selling_price: 245, stock_quantity: 25, min_stock_alert: 5 },
    { id: 2, name: 'फॉर्च्यून सरसों तेल (Fortune Mustard Oil 1L)', category: 'तेल/घी', unit: 'बोतल', purchase_price: 135, selling_price: 155, stock_quantity: 18, min_stock_alert: 6 },
    { id: 3, name: 'टाटा नमक (Tata Salt 1kg)', category: 'किराना', unit: 'पैकेट', purchase_price: 23, selling_price: 28, stock_quantity: 40, min_stock_alert: 10 },
    { id: 4, name: 'मैगी नूडल्स (Maggi 4-Pack)', category: 'स्नैक्स', unit: 'पैकेट', purchase_price: 50, selling_price: 60, stock_quantity: 32, min_stock_alert: 8 },
    { id: 5, name: 'पारले-जी बिस्कुट (Parle-G Family Pack)', category: 'बिस्कुट', unit: 'पैकेट', purchase_price: 28, selling_price: 35, stock_quantity: 50, min_stock_alert: 15 },
    { id: 6, name: 'सर्फ एक्सेल बार (Surf Excel Soap 250g)', category: 'साबुन/सर्फ', unit: 'पीस', purchase_price: 32, selling_price: 38, stock_quantity: 12, min_stock_alert: 5 },
    { id: 7, name: 'ताज महल चाय (Taj Mahal Tea 250g)', category: 'चाय/कॉफी', unit: 'डिब्बा', purchase_price: 125, selling_price: 145, stock_quantity: 8, min_stock_alert: 3 }
  ],
  settings: {
    shop_name: process.env.SHOP_NAME || 'Mohit Kirana Store',
    owner_name: process.env.SHOP_OWNER || 'मोहित कुमार',
    phone: process.env.SHOP_PHONE || '9876543210',
    address: 'मेन चौक, बाजार',
    upi_id: 'mohitdukaan@okaxis'
  }
};

class DatabaseManager {
  private pool: mysql.Pool | null = null;
  public isMySQLConnected = false;
  public connectionError: string | null = null;
  public dbType = 'json_fallback';

  public getPool(): mysql.Pool | null {
    return this.pool;
  }

  constructor() {
    this.ensureLocalDir();
  }

  private ensureLocalDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(JSON_DB_FILE)) {
      fs.writeFileSync(JSON_DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
    }
  }

  private readLocalData() {
    this.ensureLocalDir();
    try {
      const content = fs.readFileSync(JSON_DB_FILE, 'utf8');
      return JSON.parse(content);
    } catch {
      return initialData;
    }
  }

  private writeLocalData(data: typeof initialData) {
    this.ensureLocalDir();
    fs.writeFileSync(JSON_DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  }

  public async init() {
    let host = process.env.MYSQL_HOST || 'localhost';
    const port = parseInt(process.env.MYSQL_PORT || '3306', 10);
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || '';
    const database = process.env.MYSQL_DATABASE || 'dukaan_khaata_db';
    const ssl = process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

    console.log(`[DB] Attempting MySQL connection to ${user}@${host}:${port}/${database}...`);

    let connected = false;
    let lastErr: any = null;

    const tryConnect = async (targetHost: string) => {
      const tempConnection = await mysql.createConnection({
        host: targetHost,
        port,
        user,
        password,
        ssl,
        connectTimeout: 3000
      });

      await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await tempConnection.end();

      this.pool = mysql.createPool({
        host: targetHost,
        port,
        user,
        password,
        database,
        ssl,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 4000
      });

      const testConn = await this.pool.getConnection();
      testConn.release();
    };

    try {
      await tryConnect(host);
      connected = true;
    } catch (err: any) {
      lastErr = err;
      // If localhost failed (common in XAMPP on Windows due to IPv6 ::1 resolution), retry with 127.0.0.1
      if (host === 'localhost') {
        try {
          console.log('[DB] Retrying connection with 127.0.0.1 for XAMPP...');
          await tryConnect('127.0.0.1');
          connected = true;
          host = '127.0.0.1';
        } catch (err2: any) {
          lastErr = err2;
        }
      }
    }

    if (connected) {
      this.isMySQLConnected = true;
      this.dbType = 'mysql';
      this.connectionError = null;
      console.log(`✅ [DB] Successfully connected to MySQL database: ${database} at ${host}`);
      await this.initMySQLTables();
    } else {
      this.isMySQLConnected = false;
      this.dbType = 'json_fallback';
      this.connectionError = lastErr?.message || 'Unable to connect to MySQL';
      console.warn(`⚠️ [DB] MySQL connection notice: ${this.connectionError}`);
      console.log('ℹ️ [DB] Running with local persistent data storage. All dukaan data is safely preserved.');
    }
  }

  private async initMySQLTables() {
    if (!this.pool) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS \`customers\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`name\` VARCHAR(150) NOT NULL,
          \`phone\` VARCHAR(25) DEFAULT '',
          \`address\` VARCHAR(255) DEFAULT '',
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS \`transactions\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`customer_id\` INT NOT NULL,
          \`type\` ENUM('udhaar', 'jama') NOT NULL,
          \`amount\` DECIMAL(10, 2) NOT NULL,
          \`notes\` TEXT NULL,
          \`bill_image\` LONGTEXT NULL,
          \`date\` VARCHAR(30) NOT NULL,
          \`voice_recorded\` TINYINT(1) DEFAULT 0,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX \`idx_customer\` (\`customer_id\`),
          INDEX \`idx_date\` (\`date\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Platform Global Settings for Super Admin (Google Drive & Auto-Backup)
      try {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS \`platform_settings\` (
            \`id\` INT PRIMARY KEY DEFAULT 1,
            \`gdrive_webhook_url\` TEXT NULL,
            \`auto_backup_enabled\` TINYINT(1) DEFAULT 0,
            \`auto_backup_interval_hours\` INT DEFAULT 2,
            \`sync_on_any_store_entry\` TINYINT(1) DEFAULT 0,
            \`last_backup_time\` VARCHAR(100) NULL,
            \`last_backup_status\` VARCHAR(100) NULL,
            \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        const [plRows]: any = await this.pool.query('SELECT COUNT(*) as cnt FROM platform_settings WHERE id = 1');
        if (plRows[0]?.cnt === 0) {
          await this.pool.query('INSERT INTO platform_settings (id, auto_backup_enabled, auto_backup_interval_hours, sync_on_any_store_entry) VALUES (1, 0, 2, 0)');
        }
      } catch (errPl) {
        console.warn('[DB] platform_settings table notice:', errPl);
      }

      // Migration: Add bill_image column if it doesn't exist yet
      try {
        await this.pool.query('ALTER TABLE `transactions` ADD COLUMN `bill_image` LONGTEXT NULL AFTER `notes`');
      } catch {
        // column already exists
      }

      // Security Migration: Add soft-delete & audit columns to transactions
      try {
        await this.pool.query('ALTER TABLE `transactions` ADD COLUMN `is_deleted` TINYINT(1) DEFAULT 0 AFTER `voice_recorded`, ADD COLUMN `deleted_at` TIMESTAMP NULL AFTER `is_deleted`, ADD COLUMN `deleted_reason` VARCHAR(255) NULL AFTER `deleted_at`, ADD COLUMN `deleted_by` VARCHAR(100) NULL AFTER `deleted_reason`');
      } catch {
        try {
          await this.pool.query('ALTER TABLE `transactions` ADD COLUMN `is_deleted` TINYINT(1) DEFAULT 0');
          await this.pool.query('ALTER TABLE `transactions` ADD COLUMN `deleted_at` TIMESTAMP NULL');
          await this.pool.query('ALTER TABLE `transactions` ADD COLUMN `deleted_reason` VARCHAR(255) NULL');
          await this.pool.query('ALTER TABLE `transactions` ADD COLUMN `deleted_by` VARCHAR(100) NULL');
        } catch {
          // columns already exist
        }
      }

      try {
        await this.pool.query('ALTER TABLE `customers` ADD COLUMN `due_date` VARCHAR(30) NULL, ADD COLUMN `credit_limit` DECIMAL(10,2) DEFAULT 5000, ADD COLUMN `credit_period_days` INT DEFAULT 15');
      } catch {
        try {
          await this.pool.query('ALTER TABLE `customers` ADD COLUMN `credit_period_days` INT DEFAULT 15');
        } catch {
          // column already exists
        }
      }

      try {
        await this.pool.query('ALTER TABLE `products` ADD COLUMN `wholesale_price` DECIMAL(10,2) DEFAULT 0 AFTER `selling_price`');
      } catch {
        // column already exists
      }

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS \`products\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`name\` VARCHAR(150) NOT NULL,
          \`category\` VARCHAR(100) DEFAULT 'General',
          \`unit\` VARCHAR(30) DEFAULT 'पैकेट',
          \`purchase_price\` DECIMAL(10, 2) NOT NULL,
          \`selling_price\` DECIMAL(10, 2) NOT NULL,
          \`stock_quantity\` DECIMAL(10, 2) DEFAULT 0,
          \`min_stock_alert\` DECIMAL(10, 2) DEFAULT 5,
          \`barcode\` VARCHAR(100) DEFAULT '',
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS \`shop_settings\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`shop_name\` VARCHAR(200) NOT NULL,
          \`owner_name\` VARCHAR(100) DEFAULT '',
          \`phone\` VARCHAR(30) DEFAULT '',
          \`address\` TEXT NULL,
          \`upi_id\` VARCHAR(100) DEFAULT '',
          \`logo\` LONGTEXT NULL,
          \`gdrive_webhook_url\` TEXT NULL,
          \`auto_backup_enabled\` TINYINT(1) DEFAULT 0,
          \`last_backup_time\` VARCHAR(50) NULL,
          \`last_backup_status\` VARCHAR(50) NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      try {
        await this.pool.query('ALTER TABLE `shop_settings` ADD COLUMN `gdrive_webhook_url` TEXT NULL, ADD COLUMN `auto_backup_enabled` TINYINT(1) DEFAULT 0, ADD COLUMN `last_backup_time` VARCHAR(50) NULL, ADD COLUMN `last_backup_status` VARCHAR(50) NULL');
      } catch {
        // columns already exist
      }

      try {
        await this.pool.query('ALTER TABLE `shop_settings` ADD COLUMN `logo` LONGTEXT NULL');
      } catch {
        // column already exists
      }

      try {
        await this.pool.query('ALTER TABLE `shop_settings` ADD COLUMN `staff_phones` TEXT NULL');
      } catch {
        // column already exists
      }

      try {
        await this.pool.query('ALTER TABLE `shop_settings` ADD COLUMN `email` VARCHAR(150) DEFAULT ""');
      } catch {
        // column already exists
      }

      try {
        await this.pool.query('ALTER TABLE `shop_settings` ADD COLUMN `pin` VARCHAR(255) DEFAULT "1234", ADD COLUMN `password` VARCHAR(255) DEFAULT "admin"');
      } catch {
        // columns already exist
      }

      // Multi-tenant SaaS columns & Super Admin table
      try {
        await this.pool.query('ALTER TABLE `shop_settings` ADD COLUMN `status` VARCHAR(30) DEFAULT "approved" AFTER `password`');
      } catch {}

      try {
        await this.pool.query('ALTER TABLE `customers` ADD COLUMN `shop_id` INT NOT NULL DEFAULT 1 AFTER `id`');
      } catch {}

      try {
        await this.pool.query('ALTER TABLE `transactions` ADD COLUMN `shop_id` INT NOT NULL DEFAULT 1 AFTER `id`');
      } catch {}

      try {
        await this.pool.query('ALTER TABLE `products` ADD COLUMN `shop_id` INT NOT NULL DEFAULT 1 AFTER `id`');
      } catch {}

      try {
        await this.pool.query('ALTER TABLE `mandi_alerts` ADD COLUMN `shop_id` INT NOT NULL DEFAULT 1 AFTER `id`');
      } catch {}

      try {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS \`super_admins\` (
            \`id\` INT AUTO_INCREMENT PRIMARY KEY,
            \`username\` VARCHAR(100) UNIQUE NOT NULL,
            \`phone\` VARCHAR(30) UNIQUE NOT NULL,
            \`email\` VARCHAR(150) DEFAULT NULL,
            \`password\` VARCHAR(255) NOT NULL,
            \`name\` VARCHAR(100) DEFAULT 'Platform Admin',
            \`role\` VARCHAR(50) DEFAULT 'superadmin',
            \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        try {
          await this.pool.query('ALTER TABLE `super_admins` ADD COLUMN `email` VARCHAR(150) DEFAULT NULL AFTER `phone`');
        } catch {}

        const [admRows]: any = await this.pool.query('SELECT COUNT(*) as cnt FROM super_admins');
        if (admRows[0].cnt === 0) {
          const hashedAdminPass = bcrypt.hashSync('admin', 10);
          await this.pool.query(
            "INSERT INTO super_admins (username, phone, email, password, name, role) VALUES ('admin', '9999999999', 'admin@dukaan.local', ?, 'Super Admin', 'superadmin')",
            [hashedAdminPass]
          );
        } else {
          // Auto-fill email from shop 1 if admin email is null
          try {
            await this.pool.query('UPDATE super_admins sa JOIN shop_settings ss ON ss.id = 1 SET sa.email = ss.email WHERE (sa.email IS NULL OR sa.email = "") AND ss.email IS NOT NULL AND ss.email != ""');
          } catch {}
          // Encrypt any existing plain-text admin passwords in database
          const [allAdmins]: any = await this.pool.query('SELECT id, password FROM super_admins');
          for (const adm of allAdmins) {
            const passStr = String(adm.password || '');
            if (!passStr.startsWith('$2')) {
              const encrypted = bcrypt.hashSync(passStr || 'admin', 10);
              await this.pool.query('UPDATE super_admins SET password = ? WHERE id = ?', [encrypted, adm.id]);
              console.log(`[DB] 🔒 Encrypted admin password for admin ID ${adm.id} with Bcrypt`);
            }
          }
        }

        // Encrypt any existing plain-text shop pins or passwords
        const [allShops]: any = await this.pool.query('SELECT id, pin, password FROM shop_settings');
        for (const s of allShops) {
          const pinStr = String(s.pin || '');
          const passStr = String(s.password || '');
          let updatePin = null;
          let updatePass = null;
          if (pinStr && !pinStr.startsWith('$2')) {
            updatePin = bcrypt.hashSync(pinStr, 10);
          }
          if (passStr && !passStr.startsWith('$2')) {
            updatePass = bcrypt.hashSync(passStr, 10);
          }
          if (updatePin || updatePass) {
            await this.pool.query(
              'UPDATE shop_settings SET pin = COALESCE(?, pin), password = COALESCE(?, password) WHERE id = ?',
              [updatePin, updatePass, s.id]
            );
            console.log(`[DB] 🔒 Encrypted PIN/Password for shop ID ${s.id} with Bcrypt`);
          }
        }
      } catch (errAdm) {
        console.warn('[DB] super_admins table notice:', errAdm);
      }

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS \`mandi_alerts\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`product_name\` VARCHAR(150) NOT NULL,
          \`old_price\` DECIMAL(10, 2) DEFAULT 0,
          \`new_price\` DECIMAL(10, 2) NOT NULL,
          \`wholesale_price\` DECIMAL(10, 2) DEFAULT 0,
          \`unit\` VARCHAR(30) DEFAULT 'पैकेट',
          \`notes\` VARCHAR(255) DEFAULT '',
          \`sender_name\` VARCHAR(100) DEFAULT 'दुकानदार (मंडी से)',
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Platform Global Settings for Super Admin (Google Drive & Auto-Backup)
      try {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS \`platform_settings\` (
            \`id\` INT PRIMARY KEY DEFAULT 1,
            \`gdrive_webhook_url\` TEXT NULL,
            \`auto_backup_enabled\` TINYINT(1) DEFAULT 0,
            \`auto_backup_interval_hours\` INT DEFAULT 2,
            \`sync_on_any_store_entry\` TINYINT(1) DEFAULT 0,
            \`last_backup_time\` VARCHAR(100) NULL,
            \`last_backup_status\` VARCHAR(100) NULL,
            \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        const [plRows]: any = await this.pool.query('SELECT COUNT(*) as cnt FROM platform_settings WHERE id = 1');
        if (plRows[0]?.cnt === 0) {
          await this.pool.query('INSERT INTO platform_settings (id, auto_backup_enabled, auto_backup_interval_hours, sync_on_any_store_entry) VALUES (1, 0, 2, 0)');
        }
      } catch (errPl) {
        console.warn('[DB] platform_settings table notice:', errPl);
      }

      // Auto-deduplicate any legacy customer or product duplicates in database
      await this.deduplicateRecords();
    } catch (e) {
      console.error('[DB] Error initializing MySQL tables:', e);
    }
  }

  // --- AUTOMATIC DEDUPLICATION ENGINE ---
  public async deduplicateRecords(): Promise<void> {
    if (!this.isMySQLConnected || !this.pool) return;
    try {
      // 1. Merge duplicate customers (same shop_id and same non-empty 10-digit phone)
      const [dupPhones]: any = await this.pool.query(`
        SELECT shop_id, phone, COUNT(*) as cnt, MIN(id) as primary_id, GROUP_CONCAT(id ORDER BY id ASC) as all_ids
        FROM customers
        WHERE phone IS NOT NULL AND phone != '' AND LENGTH(phone) >= 10
        GROUP BY shop_id, phone
        HAVING cnt > 1
      `);
      for (const row of dupPhones) {
        const primaryId = Number(row.primary_id);
        const allIds = String(row.all_ids).split(',').map(Number);
        const dupIds = allIds.filter((id: number) => id !== primaryId);
        for (const dId of dupIds) {
          await this.pool.query('UPDATE transactions SET customer_id = ? WHERE customer_id = ?', [primaryId, dId]);
          await this.pool.query('DELETE FROM customers WHERE id = ?', [dId]);
          console.log(`[DB] 🧹 Merged duplicate customer ID ${dId} into primary ID ${primaryId} (Phone: ${row.phone})`);
        }
      }

      // 2. Merge duplicate customers (same shop_id and exact same trimmed name)
      const [dupNames]: any = await this.pool.query(`
        SELECT shop_id, LOWER(TRIM(name)) as clean_name, COUNT(*) as cnt, MIN(id) as primary_id, GROUP_CONCAT(id ORDER BY id ASC) as all_ids
        FROM customers
        GROUP BY shop_id, clean_name
        HAVING cnt > 1
      `);
      for (const row of dupNames) {
        const primaryId = Number(row.primary_id);
        const allIds = String(row.all_ids).split(',').map(Number);
        const dupIds = allIds.filter((id: number) => id !== primaryId);
        for (const dId of dupIds) {
          await this.pool.query('UPDATE transactions SET customer_id = ? WHERE customer_id = ?', [primaryId, dId]);
          await this.pool.query('DELETE FROM customers WHERE id = ?', [dId]);
          console.log(`[DB] 🧹 Merged duplicate customer ID ${dId} into primary ID ${primaryId} (Name: ${row.clean_name})`);
        }
      }

      // 3. Merge duplicate products (same shop_id, same clean name and same unit)
      const [dupProds]: any = await this.pool.query(`
        SELECT shop_id, LOWER(TRIM(name)) as clean_name, LOWER(TRIM(unit)) as clean_unit, COUNT(*) as cnt, MIN(id) as primary_id, GROUP_CONCAT(id ORDER BY id ASC) as all_ids
        FROM products
        GROUP BY shop_id, clean_name, clean_unit
        HAVING cnt > 1
      `);
      for (const row of dupProds) {
        const primaryId = Number(row.primary_id);
        const allIds = String(row.all_ids).split(',').map(Number);
        const dupIds = allIds.filter((id: number) => id !== primaryId);
        const [sumRow]: any = await this.pool.query(
          'SELECT SUM(stock_quantity) as total_stock, MAX(selling_price) as max_sell, MAX(purchase_price) as max_purch, MAX(wholesale_price) as max_whole FROM products WHERE id IN (?)',
          [allIds]
        );
        if (sumRow && sumRow.length > 0) {
          await this.pool.query(
            'UPDATE products SET stock_quantity = ?, selling_price = ?, purchase_price = ?, wholesale_price = COALESCE(?, wholesale_price) WHERE id = ?',
            [sumRow[0].total_stock || 0, sumRow[0].max_sell || 0, sumRow[0].max_purch || 0, sumRow[0].max_whole || null, primaryId]
          );
        }
        for (const dId of dupIds) {
          await this.pool.query('DELETE FROM products WHERE id = ?', [dId]);
          console.log(`[DB] 🧹 Merged duplicate product ID ${dId} into primary ID ${primaryId} (Product: ${row.clean_name})`);
        }
      }
    } catch (dedupErr: any) {
      console.warn('[DB] Deduplication notice:', dedupErr.message);
    }
  }

  // --- CUSTOMER METHODS ---
  public async getCustomers(shopId: number = 1): Promise<Customer[]> {
    if (this.isMySQLConnected && this.pool) {
      const [rows]: any = await this.pool.query(`
        SELECT c.*,
          COALESCE(SUM(CASE WHEN t.type = 'udhaar' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) as total_udhaar,
          COALESCE(SUM(CASE WHEN t.type = 'jama' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) as total_jama,
          (COALESCE(SUM(CASE WHEN t.type = 'udhaar' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN t.type = 'jama' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0)) as net_balance
        FROM customers c
        LEFT JOIN transactions t ON (c.id = t.customer_id AND t.shop_id = ?)
        WHERE c.shop_id = ?
        GROUP BY c.id
        ORDER BY net_balance DESC, c.name ASC
      `, [shopId, shopId]);
      return rows.map((r: any) => ({
        ...r,
        due_date: r.due_date || undefined,
        credit_limit: r.credit_limit !== undefined && r.credit_limit !== null ? Number(r.credit_limit) : 5000,
        credit_period_days: r.credit_period_days !== undefined && r.credit_period_days !== null ? Number(r.credit_period_days) : 15,
        total_udhaar: Number(r.total_udhaar),
        total_jama: Number(r.total_jama),
        net_balance: Number(r.net_balance)
      }));
    }

    // Local fallback
    const data = this.readLocalData();
    const custs = data.customers.filter((c: any) => (c.shop_id ? c.shop_id === shopId : shopId === 1));
    return custs.map((c: any) => {
      const custTx = data.transactions.filter((t: any) => t.customer_id === c.id && !t.is_deleted && (t.shop_id ? t.shop_id === shopId : shopId === 1));
      const total_udhaar = custTx.filter((t: any) => t.type === 'udhaar').reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const total_jama = custTx.filter((t: any) => t.type === 'jama').reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      return {
        ...c,
        due_date: c.due_date || undefined,
        credit_limit: c.credit_limit !== undefined ? Number(c.credit_limit) : 5000,
        total_udhaar,
        total_jama,
        net_balance: total_udhaar - total_jama
      };
    }).sort((a: any, b: any) => b.net_balance - a.net_balance);
  }

  public async getCustomerById(id: number, shopId: number = 1): Promise<Customer | null> {
    const list = await this.getCustomers(shopId);
    return list.find(c => c.id === id) || null;
  }

  public async addCustomer(customer: { name: string; phone?: string; address?: string; due_date?: string; credit_limit?: number; credit_period_days?: number }, shopId: number = 1): Promise<Customer> {
    const cleanName = customer.name.trim();
    const cleanPhone = (customer.phone || '').trim().replace(/[^0-9]/g, '');
    const creditLimit = customer.credit_limit !== undefined ? Number(customer.credit_limit) : 5000;
    const creditPeriodDays = customer.credit_period_days !== undefined ? Number(customer.credit_period_days) : 15;
    let dueDate = customer.due_date || null;

    // If dueDate not specified but creditPeriodDays is, calculate default dueDate
    if (!dueDate && creditPeriodDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() + creditPeriodDays);
      dueDate = d.toISOString().split('T')[0];
    }

    if (this.isMySQLConnected && this.pool) {
      // 1. Check if duplicate customer exists in this shop (by 10-digit phone OR by exact name)
      let checkSql = 'SELECT id, name, phone FROM customers WHERE shop_id = ? AND (';
      const checkParams: any[] = [shopId];
      if (cleanPhone && cleanPhone.length >= 10) {
        checkSql += 'phone = ? OR ';
        checkParams.push(cleanPhone);
      }
      checkSql += 'LOWER(TRIM(name)) = LOWER(TRIM(?))) LIMIT 1';
      checkParams.push(cleanName);

      const [existing]: any = await this.pool.query(checkSql, checkParams);
      if (existing && existing.length > 0) {
        const found = existing[0];
        const isPhoneMatch = cleanPhone && cleanPhone.length >= 10 && found.phone && found.phone.replace(/[^0-9]/g, '') === cleanPhone;
        const errMsg = isPhoneMatch
          ? `इस मोबाइल नंबर (${cleanPhone}) का खाता पहले से मौजूद है: "${found.name}"`
          : `"${cleanName}" नाम का ग्राहक खाता पहले से मौजूद है! कृपया पहचान के लिए उपनाम जोड़ें (उदा. ${cleanName} (मास्टर जी))।`;
        const err: any = new Error(errMsg);
        err.isDuplicate = true;
        err.existingId = found.id;
        throw err;
      }

      const [res]: any = await this.pool.query(
        'INSERT INTO customers (shop_id, name, phone, address, due_date, credit_limit, credit_period_days) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [shopId, cleanName, cleanPhone, customer.address?.trim() || '', dueDate, creditLimit, creditPeriodDays]
      );
      return {
        id: res.insertId,
        shop_id: shopId,
        name: cleanName,
        phone: cleanPhone,
        address: customer.address?.trim() || '',
        due_date: dueDate || undefined,
        credit_limit: creditLimit,
        credit_period_days: creditPeriodDays,
        total_udhaar: 0,
        total_jama: 0,
        net_balance: 0
      };
    }

    const data = this.readLocalData();
    const duplicate = data.customers.find((c: any) =>
      c.shop_id === shopId && (
        (cleanPhone && cleanPhone.length >= 10 && (c.phone || '').replace(/[^0-9]/g, '') === cleanPhone) ||
        c.name.trim().toLowerCase() === cleanName.toLowerCase()
      )
    );
    if (duplicate) {
      const isPhoneMatch = cleanPhone && (duplicate.phone || '').replace(/[^0-9]/g, '') === cleanPhone;
      const errMsg = isPhoneMatch
        ? `इस मोबाइल नंबर (${cleanPhone}) का खाता पहले से मौजूद है: "${duplicate.name}"`
        : `"${cleanName}" नाम का ग्राहक खाता पहले से मौजूद है! कृपया पहचान के लिए उपनाम जोड़ें।`;
      const err: any = new Error(errMsg);
      err.isDuplicate = true;
      err.existingId = duplicate.id;
      throw err;
    }

    const newId = data.customers.length > 0 ? Math.max(...data.customers.map((c: any) => c.id)) + 1 : 1;
    const newCust = {
      id: newId,
      shop_id: shopId,
      name: cleanName,
      phone: cleanPhone,
      address: customer.address?.trim() || '',
      due_date: dueDate || undefined,
      credit_limit: creditLimit,
      credit_period_days: creditPeriodDays,
      created_at: new Date().toISOString()
    };
    data.customers.push(newCust);
    this.writeLocalData(data);
    return { ...newCust, total_udhaar: 0, total_jama: 0, net_balance: 0 };
  }

  public async updateCustomer(id: number, customer: { name?: string; phone?: string; address?: string; due_date?: string; credit_limit?: number; credit_period_days?: number }, shopId: number = 1): Promise<boolean> {
    if (this.isMySQLConnected && this.pool) {
      const fields: string[] = [];
      const values: any[] = [];
      if (customer.name !== undefined) { fields.push('name = ?'); values.push(customer.name); }
      if (customer.phone !== undefined) { fields.push('phone = ?'); values.push(customer.phone); }
      if (customer.address !== undefined) { fields.push('address = ?'); values.push(customer.address); }
      if (customer.due_date !== undefined) { fields.push('due_date = ?'); values.push(customer.due_date); }
      if (customer.credit_limit !== undefined) { fields.push('credit_limit = ?'); values.push(customer.credit_limit); }
      if (customer.credit_period_days !== undefined) { fields.push('credit_period_days = ?'); values.push(customer.credit_period_days); }

      if (fields.length > 0) {
        values.push(id, shopId);
        await this.pool.query(`UPDATE customers SET ${fields.join(', ')} WHERE id = ? AND shop_id = ?`, values);
      }
      return true;
    }

    const data = this.readLocalData();
    const idx = data.customers.findIndex((c: any) => c.id === id && (c.shop_id ? c.shop_id === shopId : shopId === 1));
    if (idx !== -1) {
      if (customer.name !== undefined) data.customers[idx].name = customer.name;
      if (customer.phone !== undefined) data.customers[idx].phone = customer.phone;
      if (customer.address !== undefined) data.customers[idx].address = customer.address;
      if (customer.due_date !== undefined) data.customers[idx].due_date = customer.due_date;
      if (customer.credit_limit !== undefined) data.customers[idx].credit_limit = customer.credit_limit;
      if (customer.credit_period_days !== undefined) data.customers[idx].credit_period_days = customer.credit_period_days;
      this.writeLocalData(data);
      return true;
    }
    return false;
  }

  public async deleteCustomer(id: number, shopId: number = 1): Promise<boolean> {
    if (this.isMySQLConnected && this.pool) {
      await this.pool.query('DELETE FROM customers WHERE id = ? AND shop_id = ?', [id, shopId]);
      await this.pool.query('DELETE FROM transactions WHERE customer_id = ? AND shop_id = ?', [id, shopId]);
      return true;
    }

    const data = this.readLocalData();
    data.customers = data.customers.filter((c: any) => !(c.id === id && (c.shop_id ? c.shop_id === shopId : shopId === 1)));
    data.transactions = data.transactions.filter((t: any) => !(t.customer_id === id && (t.shop_id ? t.shop_id === shopId : shopId === 1)));
    this.writeLocalData(data);
    return true;
  }

  // --- TRANSACTIONS (UDHAAR / JAMA) ---
  public async getTransactions(customerId?: number, shopId: number = 1): Promise<Transaction[]> {
    if (this.isMySQLConnected && this.pool) {
      let query = `
        SELECT t.*, c.name as customer_name, c.phone as customer_phone
        FROM transactions t
        JOIN customers c ON (t.customer_id = c.id AND c.shop_id = ?)
        WHERE t.shop_id = ?
      `;
      const params: any[] = [shopId, shopId];
      if (customerId) {
        query += ' AND t.customer_id = ?';
        params.push(customerId);
      }
      query += ' ORDER BY t.id DESC';
      const [rows]: any = await this.pool.query(query, params);
      return rows.map((r: any) => ({
        ...r,
        amount: Number(r.amount),
        voice_recorded: Boolean(r.voice_recorded),
        is_deleted: Boolean(r.is_deleted),
        deleted_at: r.deleted_at || undefined,
        deleted_reason: r.deleted_reason || undefined,
        deleted_by: r.deleted_by || undefined
      }));
    }

    const data = this.readLocalData();
    let txs = data.transactions.filter((t: any) => (t.shop_id ? t.shop_id === shopId : shopId === 1));
    if (customerId) {
      txs = txs.filter((t: any) => t.customer_id === customerId);
    }
    return txs.map((t: any) => {
      const cust = data.customers.find((c: any) => c.id === t.customer_id);
      return {
        ...t,
        customer_name: cust ? cust.name : 'Unknown',
        customer_phone: cust ? cust.phone : '',
        amount: Number(t.amount),
        is_deleted: Boolean(t.is_deleted),
        deleted_at: t.deleted_at || undefined,
        deleted_reason: t.deleted_reason || undefined,
        deleted_by: t.deleted_by || undefined
      };
    }).sort((a: any, b: any) => b.id - a.id);
  }

  public async addTransaction(tx: { customer_id: number; type: 'udhaar' | 'jama'; amount: number; notes?: string; date?: string; voice_recorded?: boolean; bill_image?: string }, shopId: number = 1): Promise<Transaction> {
    const formattedDate = tx.date || new Date().toISOString().split('T')[0];
    const notes = tx.notes || (tx.type === 'udhaar' ? 'उधार माल' : 'जमा रकम');
    const isVoice = tx.voice_recorded ? 1 : 0;
    const billImage = tx.bill_image || null;

    if (this.isMySQLConnected && this.pool) {
      const [res]: any = await this.pool.query(
        'INSERT INTO transactions (shop_id, customer_id, type, amount, notes, bill_image, date, voice_recorded) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [shopId, tx.customer_id, tx.type, tx.amount, notes, billImage, formattedDate, isVoice]
      );
      const [custRows]: any = await this.pool.query('SELECT name, phone FROM customers WHERE id = ? AND shop_id = ?', [tx.customer_id, shopId]);
      return {
        id: res.insertId,
        customer_id: tx.customer_id,
        customer_name: custRows[0]?.name || '',
        customer_phone: custRows[0]?.phone || '',
        type: tx.type,
        amount: Number(tx.amount),
        notes,
        bill_image: billImage || undefined,
        date: formattedDate,
        voice_recorded: Boolean(isVoice),
        created_at: new Date().toISOString()
      };
    }

    const data = this.readLocalData();
    const newId = data.transactions.length > 0 ? Math.max(...data.transactions.map((t: any) => t.id)) + 1 : 1;
    const cust = data.customers.find((c: any) => c.id === tx.customer_id);
    const newTx: Transaction = {
      id: newId,
      customer_id: tx.customer_id,
      customer_name: cust ? cust.name : '',
      customer_phone: cust ? cust.phone : '',
      type: tx.type,
      amount: Number(tx.amount),
      notes,
      bill_image: billImage || undefined,
      date: formattedDate,
      voice_recorded: Boolean(tx.voice_recorded),
      created_at: new Date().toISOString()
    };
    data.transactions.push(newTx);
    this.writeLocalData(data);
    return newTx;
  }

  public async updateTransaction(id: number, updates: Partial<{ type: 'udhaar' | 'jama'; amount: number; notes: string; date: string; bill_image: string }>, shopId: number = 1): Promise<Transaction | null> {
    if (this.isMySQLConnected && this.pool) {
      const fields: string[] = [];
      const values: any[] = [];
      if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type); }
      if (updates.amount !== undefined) { fields.push('amount = ?'); values.push(updates.amount); }
      if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
      if (updates.date !== undefined) { fields.push('date = ?'); values.push(updates.date); }
      if (updates.bill_image !== undefined) { fields.push('bill_image = ?'); values.push(updates.bill_image); }

      if (fields.length > 0) {
        values.push(id, shopId);
        await this.pool.query(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ? AND shop_id = ?`, values);
      }

      const [rows]: any = await this.pool.query(
        'SELECT t.*, c.name as customer_name, c.phone as customer_phone FROM transactions t JOIN customers c ON (t.customer_id = c.id AND c.shop_id = ?) WHERE t.id = ? AND t.shop_id = ?',
        [shopId, id, shopId]
      );
      if (rows.length === 0) return null;
      return {
        ...rows[0],
        amount: Number(rows[0].amount),
        voice_recorded: Boolean(rows[0].voice_recorded)
      };
    }

    const data = this.readLocalData();
    const idx = data.transactions.findIndex((t: any) => t.id === id && (t.shop_id ? t.shop_id === shopId : shopId === 1));
    if (idx === -1) return null;
    data.transactions[idx] = {
      ...data.transactions[idx],
      ...updates
    };
    this.writeLocalData(data);
    return data.transactions[idx];
  }

  public async softDeleteTransaction(id: number, reason?: string, deletedBy?: string, shopId: number = 1): Promise<boolean> {
    const delReason = reason || 'दुकानदार द्वारा रद्द (Cancelled by Dukandar)';
    const delBy = deletedBy || 'मालिक (Owner)';
    if (this.isMySQLConnected && this.pool) {
      await this.pool.query(
        'UPDATE transactions SET is_deleted = 1, deleted_at = NOW(), deleted_reason = ?, deleted_by = ? WHERE id = ? AND shop_id = ?',
        [delReason, delBy, id, shopId]
      );
      return true;
    }
    const data = this.readLocalData();
    const tx = data.transactions.find((t: any) => t.id === id && (t.shop_id ? t.shop_id === shopId : shopId === 1));
    if (tx) {
      tx.is_deleted = true;
      tx.deleted_at = new Date().toISOString();
      tx.deleted_reason = delReason;
      tx.deleted_by = delBy;
      this.writeLocalData(data);
      return true;
    }
    return false;
  }

  public async restoreTransaction(id: number, shopId: number = 1): Promise<boolean> {
    if (this.isMySQLConnected && this.pool) {
      await this.pool.query(
        'UPDATE transactions SET is_deleted = 0, deleted_at = NULL, deleted_reason = NULL, deleted_by = NULL WHERE id = ? AND shop_id = ?',
        [id, shopId]
      );
      return true;
    }
    const data = this.readLocalData();
    const tx = data.transactions.find((t: any) => t.id === id && (t.shop_id ? t.shop_id === shopId : shopId === 1));
    if (tx) {
      tx.is_deleted = false;
      delete tx.deleted_at;
      delete tx.deleted_reason;
      delete tx.deleted_by;
      this.writeLocalData(data);
      return true;
    }
    return false;
  }

  public async deleteTransaction(id: number, reason?: string, deletedBy?: string, shopId: number = 1): Promise<boolean> {
    return this.softDeleteTransaction(id, reason, deletedBy, shopId);
  }

  // --- PRODUCTS (PURCHASE PRICE / SELLING PRICE) ---
  public async getProducts(shopId: number = 1): Promise<Product[]> {
    if (this.isMySQLConnected && this.pool) {
      const [rows]: any = await this.pool.query('SELECT * FROM products WHERE shop_id = ? ORDER BY name ASC', [shopId]);
      return rows.map((r: any) => ({
        ...r,
        purchase_price: Number(r.purchase_price),
        selling_price: Number(r.selling_price),
        wholesale_price: Number(r.wholesale_price || 0),
        stock_quantity: Number(r.stock_quantity),
        min_stock_alert: Number(r.min_stock_alert)
      }));
    }

    const data = this.readLocalData();
    const prods = data.products.filter((p: any) => (p.shop_id ? p.shop_id === shopId : shopId === 1));
    return prods.map((p: any) => ({
      ...p,
      purchase_price: Number(p.purchase_price),
      selling_price: Number(p.selling_price),
      wholesale_price: Number(p.wholesale_price || 0),
      stock_quantity: Number(p.stock_quantity),
      min_stock_alert: Number(p.min_stock_alert)
    }));
  }

  public async addProduct(product: {
    name: string;
    category?: string;
    unit?: string;
    purchase_price: number;
    selling_price: number;
    wholesale_price?: number;
    stock_quantity?: number;
    min_stock_alert?: number;
    barcode?: string;
    force_upsert?: boolean;
  }, shopId: number = 1): Promise<Product> {
    const cleanName = product.name.trim();
    const category = product.category?.trim() || 'General';
    const unit = product.unit?.trim() || 'पैकेट';
    const stock_qty = product.stock_quantity !== undefined ? Number(product.stock_quantity) : 0;
    const min_alert = product.min_stock_alert !== undefined ? Number(product.min_stock_alert) : 5;
    const barcode = (product.barcode || '').trim();
    const wholesale_price = product.wholesale_price !== undefined ? Number(product.wholesale_price) : 0;

    if (this.isMySQLConnected && this.pool) {
      // 1. Check if product already exists in this shop (by barcode OR by clean name + unit)
      let existingProd: any = null;
      if (barcode) {
        const [bRows]: any = await this.pool.query(
          'SELECT * FROM products WHERE shop_id = ? AND barcode = ? LIMIT 1',
          [shopId, barcode]
        );
        if (bRows && bRows.length > 0) existingProd = bRows[0];
      }
      if (!existingProd) {
        const [nRows]: any = await this.pool.query(
          'SELECT * FROM products WHERE shop_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(unit)) = LOWER(TRIM(?)) LIMIT 1',
          [shopId, cleanName, unit]
        );
        if (nRows && nRows.length > 0) existingProd = nRows[0];
      }

      if (existingProd) {
        // If force_upsert is true (or from batch/CSV import), update the existing product instead of creating duplicate
        if (product.force_upsert) {
          const newStock = Number(existingProd.stock_quantity) + stock_qty;
          await this.pool.query(
            'UPDATE products SET category = ?, purchase_price = ?, selling_price = ?, wholesale_price = COALESCE(?, wholesale_price), stock_quantity = ?, min_stock_alert = COALESCE(?, min_stock_alert) WHERE id = ?',
            [category, product.purchase_price, product.selling_price, wholesale_price, newStock, min_alert, existingProd.id]
          );
          return {
            id: existingProd.id,
            shop_id: shopId,
            name: existingProd.name,
            category,
            unit: existingProd.unit,
            purchase_price: Number(product.purchase_price),
            selling_price: Number(product.selling_price),
            wholesale_price,
            stock_quantity: newStock,
            min_stock_alert: min_alert,
            barcode: existingProd.barcode || barcode
          };
        } else {
          const err: any = new Error(`सामान "${cleanName}" (${unit}) पहले से इन्वेंट्री में मौजूद है! (रेट: ₹${existingProd.selling_price})`);
          err.isDuplicate = true;
          err.existingId = existingProd.id;
          throw err;
        }
      }

      const [res]: any = await this.pool.query(
        'INSERT INTO products (shop_id, name, category, unit, purchase_price, selling_price, wholesale_price, stock_quantity, min_stock_alert, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [shopId, cleanName, category, unit, product.purchase_price, product.selling_price, wholesale_price, stock_qty, min_alert, barcode]
      );
      return {
        id: res.insertId,
        shop_id: shopId,
        name: cleanName,
        category,
        unit,
        purchase_price: Number(product.purchase_price),
        selling_price: Number(product.selling_price),
        wholesale_price,
        stock_quantity: stock_qty,
        min_stock_alert: min_alert,
        barcode
      };
    }

    const data = this.readLocalData();
    const existing = data.products.find((p: any) =>
      (p.shop_id ? p.shop_id === shopId : shopId === 1) &&
      ((barcode && p.barcode === barcode) || (p.name.trim().toLowerCase() === cleanName.toLowerCase() && (p.unit || '').trim().toLowerCase() === unit.toLowerCase()))
    );

    if (existing) {
      if (product.force_upsert) {
        existing.purchase_price = Number(product.purchase_price);
        existing.selling_price = Number(product.selling_price);
        if (wholesale_price) existing.wholesale_price = wholesale_price;
        existing.stock_quantity = (existing.stock_quantity || 0) + stock_qty;
        this.writeLocalData(data);
        return existing;
      } else {
        const err: any = new Error(`सामान "${cleanName}" (${unit}) पहले से इन्वेंट्री में मौजूद है!`);
        err.isDuplicate = true;
        err.existingId = existing.id;
        throw err;
      }
    }

    const newId = data.products.length > 0 ? Math.max(...data.products.map((p: any) => p.id)) + 1 : 1;
    const newProd: Product = {
      id: newId,
      shop_id: shopId,
      name: cleanName,
      category,
      unit,
      purchase_price: Number(product.purchase_price),
      selling_price: Number(product.selling_price),
      wholesale_price,
      stock_quantity: stock_qty,
      min_stock_alert: min_alert,
      barcode
    };
    data.products.push(newProd);
    this.writeLocalData(data);
    return newProd;
  }

  public async updateProduct(id: number, product: Partial<Product>, shopId: number = 1): Promise<boolean> {
    if (this.isMySQLConnected && this.pool) {
      const fields: string[] = [];
      const values: any[] = [];
      if (product.name !== undefined) { fields.push('name = ?'); values.push(product.name); }
      if (product.category !== undefined) { fields.push('category = ?'); values.push(product.category); }
      if (product.unit !== undefined) { fields.push('unit = ?'); values.push(product.unit); }
      if (product.purchase_price !== undefined) { fields.push('purchase_price = ?'); values.push(product.purchase_price); }
      if (product.selling_price !== undefined) { fields.push('selling_price = ?'); values.push(product.selling_price); }
      if (product.wholesale_price !== undefined) { fields.push('wholesale_price = ?'); values.push(product.wholesale_price); }
      if (product.stock_quantity !== undefined) { fields.push('stock_quantity = ?'); values.push(product.stock_quantity); }
      if (product.min_stock_alert !== undefined) { fields.push('min_stock_alert = ?'); values.push(product.min_stock_alert); }
      if (product.barcode !== undefined) { fields.push('barcode = ?'); values.push(product.barcode); }

      if (fields.length === 0) return true;
      values.push(id, shopId);
      await this.pool.query(`UPDATE products SET ${fields.join(', ')} WHERE id = ? AND shop_id = ?`, values);
      return true;
    }

    const data = this.readLocalData();
    const idx = data.products.findIndex((p: any) => p.id === id && (p.shop_id ? p.shop_id === shopId : shopId === 1));
    if (idx !== -1) {
      data.products[idx] = {
        ...data.products[idx],
        ...product,
        purchase_price: product.purchase_price !== undefined ? Number(product.purchase_price) : data.products[idx].purchase_price,
        selling_price: product.selling_price !== undefined ? Number(product.selling_price) : data.products[idx].selling_price,
        stock_quantity: product.stock_quantity !== undefined ? Number(product.stock_quantity) : data.products[idx].stock_quantity
      };
      this.writeLocalData(data);
      return true;
    }
    return false;
  }

  public async deleteProduct(id: number, shopId: number = 1): Promise<boolean> {
    if (this.isMySQLConnected && this.pool) {
      await this.pool.query('DELETE FROM products WHERE id = ? AND shop_id = ?', [id, shopId]);
      return true;
    }
    const data = this.readLocalData();
    data.products = data.products.filter((p: any) => !(p.id === id && (p.shop_id ? p.shop_id === shopId : shopId === 1)));
    this.writeLocalData(data);
    return true;
  }

  // --- SETTINGS & STATS ---
  public async getSettings(shopId: number = 1): Promise<ShopSettings> {
    if (this.isMySQLConnected && this.pool) {
      const [rows]: any = await this.pool.query('SELECT shop_name, owner_name, phone, email, address, upi_id, logo, staff_phones, gdrive_webhook_url, auto_backup_enabled, last_backup_time, last_backup_status, pin, password FROM shop_settings WHERE id = ? LIMIT 1', [shopId]);
      if (rows.length > 0) {
        const r = rows[0];
        return {
          shop_name: r.shop_name && r.shop_name.trim() ? r.shop_name : 'Mohit Kirana Store',
          owner_name: r.owner_name && r.owner_name.trim() ? r.owner_name : 'मोहित कुमार',
          phone: r.phone && r.phone.trim() ? r.phone : '9876543210',
          email: r.email || '',
          address: r.address && r.address.trim() ? r.address : 'मेन चौक, बाजार',
          upi_id: r.upi_id && r.upi_id.trim() ? r.upi_id : 'mohitdukaan@okaxis',
          logo: r.logo || null,
          staff_phones: r.staff_phones || '',
          gdrive_webhook_url: r.gdrive_webhook_url || null,
          auto_backup_enabled: Boolean(r.auto_backup_enabled),
          last_backup_time: r.last_backup_time || null,
          last_backup_status: r.last_backup_status || null,
          pin: r.pin || '1234',
          password: r.password || 'admin'
        };
      }
    }
    const data = this.readLocalData();
    const s = data.settings || initialData.settings;
    return {
      ...s,
      shop_name: s.shop_name && s.shop_name.trim() ? s.shop_name : 'Mohit Kirana Store',
      owner_name: s.owner_name && s.owner_name.trim() ? s.owner_name : 'मोहित कुमार',
      phone: s.phone && s.phone.trim() ? s.phone : '9876543210',
      email: s.email || '',
      address: s.address && s.address.trim() ? s.address : 'मेन चौक, बाजार',
      upi_id: s.upi_id && s.upi_id.trim() ? s.upi_id : 'mohitdukaan@okaxis',
      logo: s.logo || null,
      staff_phones: s.staff_phones || '',
      pin: s.pin || '1234',
      password: s.password || 'admin'
    };
  }

  public async updateSettings(settings: Partial<ShopSettings>, shopId: number = 1): Promise<ShopSettings> {
    const current = await this.getSettings(shopId);

    const merged: ShopSettings = {
      shop_name: (settings.shop_name !== undefined && settings.shop_name !== null && settings.shop_name.trim() !== '')
        ? settings.shop_name.trim()
        : current.shop_name,
      owner_name: (settings.owner_name !== undefined && settings.owner_name !== null && settings.owner_name.trim() !== '')
        ? settings.owner_name.trim()
        : current.owner_name,
      phone: (settings.phone !== undefined && settings.phone !== null && settings.phone.trim() !== '')
        ? settings.phone.trim()
        : current.phone,
      email: (settings.email !== undefined)
        ? settings.email.trim()
        : (current.email || ''),
      address: (settings.address !== undefined && settings.address !== null && settings.address.trim() !== '')
        ? settings.address.trim()
        : current.address,
      upi_id: (settings.upi_id !== undefined && settings.upi_id !== null && settings.upi_id.trim() !== '')
        ? settings.upi_id.trim()
        : current.upi_id,
      logo: (settings.logo !== undefined)
        ? settings.logo
        : (current.logo || null),
      staff_phones: (settings.staff_phones !== undefined)
        ? settings.staff_phones
        : (current.staff_phones || ''),
      gdrive_webhook_url: (settings.gdrive_webhook_url !== undefined)
        ? (settings.gdrive_webhook_url ? settings.gdrive_webhook_url.trim() : null)
        : (current.gdrive_webhook_url || null),
      auto_backup_enabled: (settings.auto_backup_enabled !== undefined)
        ? Boolean(settings.auto_backup_enabled)
        : Boolean(current.auto_backup_enabled),
      last_backup_time: (settings.last_backup_time !== undefined)
        ? settings.last_backup_time
        : (current.last_backup_time || null),
      last_backup_status: (settings.last_backup_status !== undefined)
        ? settings.last_backup_status
        : (current.last_backup_status || null),
      pin: (settings.pin !== undefined && settings.pin !== null && settings.pin.trim() !== '')
        ? (settings.pin.trim().startsWith('$2') ? settings.pin.trim() : bcrypt.hashSync(settings.pin.trim(), 10))
        : (current.pin || bcrypt.hashSync('1234', 10)),
      password: (settings.password !== undefined && settings.password !== null && settings.password.trim() !== '')
        ? (settings.password.trim().startsWith('$2') ? settings.password.trim() : bcrypt.hashSync(settings.password.trim(), 10))
        : (current.password || bcrypt.hashSync('admin', 10))
    };

    if (this.isMySQLConnected && this.pool) {
      await this.pool.query(`
        INSERT INTO shop_settings (id, shop_name, owner_name, phone, email, address, upi_id, logo, staff_phones, gdrive_webhook_url, auto_backup_enabled, last_backup_time, last_backup_status, pin, password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          shop_name = VALUES(shop_name),
          owner_name = VALUES(owner_name),
          phone = VALUES(phone),
          email = VALUES(email),
          address = VALUES(address),
          upi_id = VALUES(upi_id),
          logo = VALUES(logo),
          staff_phones = VALUES(staff_phones),
          gdrive_webhook_url = VALUES(gdrive_webhook_url),
          auto_backup_enabled = VALUES(auto_backup_enabled),
          last_backup_time = VALUES(last_backup_time),
          last_backup_status = VALUES(last_backup_status),
          pin = VALUES(pin),
          password = VALUES(password)
      `, [
        shopId,
        merged.shop_name,
        merged.owner_name,
        merged.phone,
        merged.email || '',
        merged.address,
        merged.upi_id,
        merged.logo,
        merged.staff_phones,
        merged.gdrive_webhook_url,
        merged.auto_backup_enabled ? 1 : 0,
        merged.last_backup_time,
        merged.last_backup_status,
        merged.pin || '1234',
        merged.password || 'admin'
      ]);
    }

    const data = this.readLocalData();
    data.settings = merged;
    this.writeLocalData(data);
    return merged;
  }

  // --- COMPLETE BACKUP & RESTORE METHODS ---
  public async getFullBackupData(shopId: number = 1) {
    const customers = await this.getCustomers(shopId);
    const transactions = await this.getTransactions(undefined, shopId);
    const products = await this.getProducts(shopId);
    const settings = await this.getSettings(shopId);
    const mandiAlerts = await this.getMandiAlerts(shopId);

    return {
      version: '2.5-isolated-store',
      backup_type: 'INDIVIDUAL_STORE_BACKUP',
      is_platform_backup: false,
      timestamp: new Date().toISOString(),
      shop_id: shopId,
      shop_name: settings.shop_name || `Store_${shopId}`,
      data: {
        customers,
        transactions,
        products,
        settings,
        mandi_alerts: mandiAlerts
      }
    };
  }

  // --- GLOBAL PLATFORM BACKUP & GOOGLE DRIVE AUTO-SYNC METHODS ---
  public async getPlatformBackupSettings() {
    if (this.isMySQLConnected && this.pool) {
      try {
        const [rows]: any = await this.pool.query('SELECT gdrive_webhook_url, auto_backup_enabled, auto_backup_interval_hours, sync_on_any_store_entry, last_backup_time, last_backup_status FROM platform_settings WHERE id = 1 LIMIT 1');
        if (rows && rows.length > 0) {
          const r = rows[0];
          return {
            gdrive_webhook_url: r.gdrive_webhook_url || null,
            auto_backup_enabled: Boolean(r.auto_backup_enabled),
            auto_backup_interval_hours: Number(r.auto_backup_interval_hours || 2),
            sync_on_any_store_entry: Boolean(r.sync_on_any_store_entry),
            last_backup_time: r.last_backup_time || null,
            last_backup_status: r.last_backup_status || null
          };
        }
      } catch {}
    }
    const data = this.readLocalData();
    const pl = (data as any).platform_settings || {};
    return {
      gdrive_webhook_url: pl.gdrive_webhook_url || null,
      auto_backup_enabled: Boolean(pl.auto_backup_enabled),
      auto_backup_interval_hours: Number(pl.auto_backup_interval_hours || 2),
      sync_on_any_store_entry: Boolean(pl.sync_on_any_store_entry),
      last_backup_time: pl.last_backup_time || null,
      last_backup_status: pl.last_backup_status || null
    };
  }

  public async updatePlatformBackupSettings(settings: Partial<{
    gdrive_webhook_url: string | null;
    auto_backup_enabled: boolean | number;
    auto_backup_interval_hours: number;
    sync_on_any_store_entry: boolean | number;
    last_backup_time: string | null;
    last_backup_status: string | null;
  }>) {
    const current = await this.getPlatformBackupSettings();
    const merged = {
      gdrive_webhook_url: settings.gdrive_webhook_url !== undefined ? settings.gdrive_webhook_url : current.gdrive_webhook_url,
      auto_backup_enabled: settings.auto_backup_enabled !== undefined ? Boolean(settings.auto_backup_enabled) : current.auto_backup_enabled,
      auto_backup_interval_hours: settings.auto_backup_interval_hours !== undefined ? Number(settings.auto_backup_interval_hours) : current.auto_backup_interval_hours,
      sync_on_any_store_entry: settings.sync_on_any_store_entry !== undefined ? Boolean(settings.sync_on_any_store_entry) : current.sync_on_any_store_entry,
      last_backup_time: settings.last_backup_time !== undefined ? settings.last_backup_time : current.last_backup_time,
      last_backup_status: settings.last_backup_status !== undefined ? settings.last_backup_status : current.last_backup_status
    };

    if (this.isMySQLConnected && this.pool) {
      try {
        await this.pool.query(`
          INSERT INTO platform_settings (id, gdrive_webhook_url, auto_backup_enabled, auto_backup_interval_hours, sync_on_any_store_entry, last_backup_time, last_backup_status)
          VALUES (1, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            gdrive_webhook_url = VALUES(gdrive_webhook_url),
            auto_backup_enabled = VALUES(auto_backup_enabled),
            auto_backup_interval_hours = VALUES(auto_backup_interval_hours),
            sync_on_any_store_entry = VALUES(sync_on_any_store_entry),
            last_backup_time = VALUES(last_backup_time),
            last_backup_status = VALUES(last_backup_status)
        `, [
          merged.gdrive_webhook_url,
          merged.auto_backup_enabled ? 1 : 0,
          merged.auto_backup_interval_hours,
          merged.sync_on_any_store_entry ? 1 : 0,
          merged.last_backup_time,
          merged.last_backup_status
        ]);
      } catch (e) {
        console.warn('[DB] Failed to update platform_settings in MySQL:', e);
      }
    }

    const data = this.readLocalData();
    (data as any).platform_settings = merged;
    this.writeLocalData(data);
    return merged;
  }

  public async getFullPlatformBackupData() {
    let shops: any[] = [];
    let customers: any[] = [];
    let transactions: any[] = [];
    let products: any[] = [];
    let mandiAlerts: any[] = [];
    let superAdmins: any[] = [];
    let notices: any[] = [];

    if (this.isMySQLConnected && this.pool) {
      try {
        const [sRows]: any = await this.pool.query('SELECT id, shop_name, owner_name, phone, email, address, upi_id, status, created_at FROM shop_settings ORDER BY id ASC');
        shops = sRows || [];

        const [cRows]: any = await this.pool.query('SELECT * FROM customers ORDER BY id ASC');
        customers = cRows || [];

        const [tRows]: any = await this.pool.query('SELECT * FROM transactions ORDER BY id ASC');
        transactions = tRows || [];

        const [pRows]: any = await this.pool.query('SELECT * FROM products ORDER BY id ASC');
        products = pRows || [];

        const [mRows]: any = await this.pool.query('SELECT * FROM mandi_alerts ORDER BY id ASC');
        mandiAlerts = mRows || [];

        const [aRows]: any = await this.pool.query('SELECT id, username, phone, name, role, created_at FROM super_admins ORDER BY id ASC');
        superAdmins = aRows || [];

        const [nRows]: any = await this.pool.query('SELECT * FROM platform_notices ORDER BY id ASC');
        notices = nRows || [];
      } catch (errPl) {
        console.warn('[DB] getFullPlatformBackupData MySQL error:', errPl);
      }
    } else {
      const local = this.readLocalData();
      shops = [{ id: 1, ...(local.settings || initialData.settings) }];
      customers = local.customers || [];
      transactions = local.transactions || [];
      products = local.products || [];
      mandiAlerts = local.mandi_alerts || [];
      superAdmins = [{ id: 1, username: 'admin', role: 'superadmin' }];
    }

    return {
      version: '2.5-saas-platform-complete',
      backup_type: 'FULL_PROJECT_MASTER_BACKUP',
      is_platform_backup: true,
      timestamp: new Date().toISOString(),
      stats: {
        total_shops: shops.length,
        total_customers: customers.length,
        total_transactions: transactions.length,
        total_products: products.length,
        total_mandi_alerts: mandiAlerts.length
      },
      data: {
        shops,
        customers,
        transactions,
        products,
        mandi_alerts: mandiAlerts,
        super_admins: superAdmins,
        notices
      }
    };
  }

  public async restoreFullBackup(backup: any, shopId: number = 1): Promise<boolean> {
    if (!backup || !backup.data) return false;
    const currentShopId = shopId || 1;
    const { customers, transactions, products, settings, mandi_alerts } = backup.data;

    if (this.isMySQLConnected && this.pool) {
      await this.pool.query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        await this.pool.query('DELETE FROM transactions WHERE shop_id = ?', [currentShopId]);
        await this.pool.query('DELETE FROM customers WHERE shop_id = ?', [currentShopId]);
        await this.pool.query('DELETE FROM products WHERE shop_id = ?', [currentShopId]);
        await this.pool.query('DELETE FROM mandi_alerts WHERE shop_id = ?', [currentShopId]);

        if (Array.isArray(customers)) {
          for (const c of customers) {
            await this.pool.query(
              'INSERT INTO customers (id, shop_id, name, phone, address, due_date, credit_limit, credit_period_days) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [c.id, currentShopId, c.name, c.phone || '', c.address || '', c.due_date || null, c.credit_limit || 5000, c.credit_period_days || 15]
            );
          }
        }

        if (Array.isArray(transactions)) {
          for (const t of transactions) {
            await this.pool.query(
              'INSERT INTO transactions (id, shop_id, customer_id, type, amount, notes, bill_image, date, voice_recorded, is_deleted, deleted_at, deleted_reason, deleted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                t.id,
                currentShopId,
                t.customer_id,
                t.type,
                t.amount,
                t.notes || '',
                t.bill_image || null,
                t.date,
                t.voice_recorded ? 1 : 0,
                t.is_deleted ? 1 : 0,
                t.deleted_at || null,
                t.deleted_reason || null,
                t.deleted_by || null
              ]
            );
          }
        }

        if (Array.isArray(products)) {
          for (const p of products) {
            await this.pool.query(
              'INSERT INTO products (id, shop_id, name, category, unit, purchase_price, selling_price, wholesale_price, stock_quantity, min_stock_alert, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [p.id, currentShopId, p.name, p.category || 'General', p.unit || 'पैकेट', p.purchase_price, p.selling_price, p.wholesale_price || 0, p.stock_quantity || 100, p.min_stock_alert || 0, p.barcode || '']
            );
          }
        }

        if (Array.isArray(mandi_alerts)) {
          for (const m of mandi_alerts) {
            await this.pool.query(
              'INSERT INTO mandi_alerts (id, shop_id, product_name, old_price, new_price, wholesale_price, unit, notes, sender_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [m.id, currentShopId, m.product_name, m.old_price || 0, m.new_price, m.wholesale_price || 0, m.unit || 'पैकेट', m.notes || null, m.sender_name || 'दुकानदार', m.created_at || new Date().toISOString()]
            );
          }
        }

        if (settings) {
          await this.updateSettings(settings, currentShopId);
        }
      } finally {
        await this.pool.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    }

    const localData = {
      customers: customers || [],
      transactions: transactions || [],
      products: products || [],
      settings: settings || {}
    };
    this.writeLocalData(localData);
    return true;
  }

  public async getDashboardStats(shopId: number = 1) {
    const customers = await this.getCustomers(shopId);
    const products = await this.getProducts(shopId);
    const transactions = await this.getTransactions(undefined, shopId);

    const totalUdhaar = customers.reduce((sum, c) => sum + (c.net_balance && c.net_balance > 0 ? c.net_balance : 0), 0);
    const totalJama = transactions.filter(t => t.type === 'jama' && !t.is_deleted).reduce((sum, t) => sum + t.amount, 0);

    const totalStockValuePurchase = products.reduce((sum, p) => sum + (p.purchase_price * p.stock_quantity), 0);
    const totalStockValueSelling = products.reduce((sum, p) => sum + (p.selling_price * p.stock_quantity), 0);
    const potentialProfit = totalStockValueSelling - totalStockValuePurchase;

    const lowStockProducts = products.filter(p => p.stock_quantity <= p.min_stock_alert);

    return {
      shopId,
      totalCustomers: customers.length,
      totalUdhaar, // Market me dukandaar ka baaki paisa
      totalJama, // Total collection
      totalProducts: products.length,
      totalStockValuePurchase, // Kul kharid lagat
      totalStockValueSelling, // Kul bikri anuman
      potentialProfit, // Anumanit munafa
      lowStockCount: lowStockProducts.length,
      lowStockProducts
    };
  }

  public async resetToDemo(): Promise<void> {
    const demoData = {
      customers: [
        { id: 1, name: 'रमेश शर्मा (Ramesh)', phone: '9876543210', address: 'मेन मार्केट, दुकान नं 4', created_at: new Date().toISOString() },
        { id: 2, name: 'सुरेश वर्मा (Suresh)', phone: '9812345678', address: 'वार्ड नं 3, गली नं 2', created_at: new Date().toISOString() },
        { id: 3, name: 'अनीता गुप्ता (Anita)', phone: '9898989898', address: 'शांति नगर, मकान नं 12', created_at: new Date().toISOString() },
        { id: 4, name: 'विकास यादव (Vikas)', phone: '9765432109', address: 'सब्जी मंडी के पास', created_at: new Date().toISOString() },
        { id: 5, name: 'राहुल सिंह (Rahul Singh)', phone: '9823456781', address: 'रेलवे स्टेशन रोड', created_at: new Date().toISOString() },
        { id: 6, name: 'पूजा शर्मा (Pooja)', phone: '9834567812', address: 'आदर्श नगर, ब्लॉक सी', created_at: new Date().toISOString() },
        { id: 7, name: 'दीपक कुमार (Deepak)', phone: '9845678123', address: 'चौपाल के पीछे', created_at: new Date().toISOString() }
      ],
      transactions: [
        { id: 1, customer_id: 1, type: 'udhaar', amount: 850, notes: 'राशन सामान (आटा, तेल, चीनी)', date: new Date().toISOString().split('T')[0], voice_recorded: true, created_at: new Date().toISOString() },
        { id: 2, customer_id: 1, type: 'jama', amount: 300, notes: 'कैश जमा किया', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() },
        { id: 3, customer_id: 2, type: 'udhaar', amount: 1250, notes: 'महीने का किराना', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() },
        { id: 4, customer_id: 3, type: 'udhaar', amount: 450, notes: 'दाल और मसाले', date: new Date().toISOString().split('T')[0], voice_recorded: true, created_at: new Date().toISOString() },
        { id: 5, customer_id: 3, type: 'jama', amount: 450, notes: 'फोनपे द्वारा पूरा भुगतान चुकता', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() },
        { id: 6, customer_id: 4, type: 'udhaar', amount: 620, notes: 'ड्राई फ्रूट्स और बिस्कुट', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() },
        { id: 7, customer_id: 5, type: 'udhaar', amount: 890, notes: 'देसी घी 1L व बासमती चावल', date: new Date().toISOString().split('T')[0], voice_recorded: true, created_at: new Date().toISOString() },
        { id: 8, customer_id: 6, type: 'udhaar', amount: 340, notes: 'मसाले और साबुन', date: new Date().toISOString().split('T')[0], voice_recorded: true, created_at: new Date().toISOString() },
        { id: 9, customer_id: 7, type: 'udhaar', amount: 500, notes: 'किराना उधार', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() },
        { id: 10, customer_id: 7, type: 'jama', amount: 500, notes: 'कैश देकर हिसाब बराबर किया', date: new Date().toISOString().split('T')[0], voice_recorded: false, created_at: new Date().toISOString() }
      ],
      products: [
        { id: 1, name: 'आशीर्वाद आटा (Aashirvaad Aata 5kg)', category: 'अनाज/किराना', unit: 'पैकेट', purchase_price: 210, selling_price: 245, stock_quantity: 25, min_stock_alert: 5 },
        { id: 2, name: 'फॉर्च्यून सरसों तेल (Fortune Mustard Oil 1L)', category: 'तेल/घी', unit: 'बोतल', purchase_price: 135, selling_price: 155, stock_quantity: 18, min_stock_alert: 6 },
        { id: 3, name: 'टाटा नमक (Tata Salt 1kg)', category: 'किराना', unit: 'पैकेट', purchase_price: 23, selling_price: 28, stock_quantity: 40, min_stock_alert: 10 },
        { id: 4, name: 'मैगी नूडल्स (Maggi 4-Pack)', category: 'स्नैक्स', unit: 'पैकेट', purchase_price: 50, selling_price: 60, stock_quantity: 32, min_stock_alert: 8 },
        { id: 5, name: 'पारले-जी बिस्कुट (Parle-G Family Pack)', category: 'बिस्कुट', unit: 'पैकेट', purchase_price: 28, selling_price: 35, stock_quantity: 50, min_stock_alert: 15 },
        { id: 6, name: 'अमूल गाय घी (Amul Cow Ghee 1L)', category: 'तेल/घी', unit: 'डिब्बा', purchase_price: 580, selling_price: 640, stock_quantity: 10, min_stock_alert: 3 },
        { id: 7, name: 'इंडिया गेट बासमती चावल (Basmati Rice 5kg)', category: 'अनाज/किराना', unit: 'पैकेट', purchase_price: 420, selling_price: 490, stock_quantity: 15, min_stock_alert: 4 },
        { id: 8, name: 'सर्फ एक्सेल बार (Surf Excel Soap 250g)', category: 'साबुन/सर्फ', unit: 'पीस', purchase_price: 32, selling_price: 38, stock_quantity: 4, min_stock_alert: 8 },
        { id: 9, name: 'ताज महल चाय (Taj Mahal Tea 250g)', category: 'चाय/कॉफी', unit: 'डिब्बा', purchase_price: 125, selling_price: 145, stock_quantity: 3, min_stock_alert: 5 },
        { id: 10, name: 'हल्दीराम आलू भुजिया (Bhujia 400g)', category: 'स्नैक्स', unit: 'पैकेट', purchase_price: 95, selling_price: 115, stock_quantity: 22, min_stock_alert: 6 },
        { id: 11, name: 'कोलगेट मैक्सफ्रेश (Colgate MaxFresh 150g)', category: 'किराना', unit: 'पीस', purchase_price: 78, selling_price: 92, stock_quantity: 14, min_stock_alert: 5 },
        { id: 12, name: 'डाबर हनी शहद (Dabur Honey 500g)', category: 'किराना', unit: 'बोतल', purchase_price: 190, selling_price: 230, stock_quantity: 6, min_stock_alert: 3 }
      ],
      settings: {
        shop_name: 'अभिषेक किराना एवं सुपरमार्ट',
        owner_name: 'अभिषेक गुप्ता (दुकानदार)',
        phone: '9876543210',
        address: 'दुकान नं. 15, मेन चौक चौराहा, बाजार',
        upi_id: 'abhishek.dukaan@okaxis'
      }
    };

    if (this.isMySQLConnected && this.pool) {
      await this.pool.query('DELETE FROM transactions');
      await this.pool.query('DELETE FROM customers');
      await this.pool.query('DELETE FROM products');
      for (const c of demoData.customers) {
        await this.pool.query('INSERT INTO customers (id, name, phone, address) VALUES (?, ?, ?, ?)', [c.id, c.name, c.phone, c.address]);
      }
      for (const t of demoData.transactions) {
        await this.pool.query('INSERT INTO transactions (customer_id, type, amount, notes, date, voice_recorded) VALUES (?, ?, ?, ?, ?, ?)', [t.customer_id, t.type, t.amount, t.notes, t.date, t.voice_recorded ? 1 : 0]);
      }
      for (const p of demoData.products) {
        await this.pool.query('INSERT INTO products (id, name, category, unit, purchase_price, selling_price, stock_quantity, min_stock_alert) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [p.id, p.name, p.category, p.unit, p.purchase_price, p.selling_price, p.stock_quantity, p.min_stock_alert]);
      }
      const s = demoData.settings;
      await this.pool.query('UPDATE shop_settings SET shop_name = ?, owner_name = ?, phone = ?, address = ?, upi_id = ? WHERE id = 1', [s.shop_name, s.owner_name, s.phone, s.address, s.upi_id]);
    }

    this.writeLocalData(demoData as any);
  }

  public async clearAllData(shopId: number = 1): Promise<void> {
    if (this.isMySQLConnected && this.pool) {
      await this.pool.query('DELETE FROM transactions WHERE shop_id = ?', [shopId]);
      await this.pool.query('DELETE FROM customers WHERE shop_id = ?', [shopId]);
      await this.pool.query('DELETE FROM products WHERE shop_id = ?', [shopId]);
      await this.pool.query('DELETE FROM mandi_alerts WHERE shop_id = ?', [shopId]);
    }

    const currentSettings = await this.getSettings(shopId);
    const data = this.readLocalData();
    const filteredCustomers = (data.customers || []).filter((c: any) => (c.shop_id ? c.shop_id !== shopId : shopId !== 1));
    const filteredTransactions = (data.transactions || []).filter((t: any) => (t.shop_id ? t.shop_id !== shopId : shopId !== 1));
    const filteredProducts = (data.products || []).filter((p: any) => (p.shop_id ? p.shop_id !== shopId : shopId !== 1));
    const filteredAlerts = (data.mandi_alerts || []).filter((a: any) => (a.shop_id ? a.shop_id !== shopId : shopId !== 1));

    data.customers = filteredCustomers;
    data.transactions = filteredTransactions;
    data.products = filteredProducts;
    data.mandi_alerts = filteredAlerts;
    if (shopId === 1) data.settings = currentSettings;

    this.writeLocalData(data as any);
  }
  // --- MANDI PRICE ALERTS & STAFF BROADCAST ---
  public async getMandiAlerts(shopId: number = 1): Promise<MandiAlert[]> {
    if (this.isMySQLConnected && this.pool) {
      const [rows]: any = await this.pool.query('SELECT * FROM mandi_alerts WHERE shop_id = ? ORDER BY id DESC LIMIT 25', [shopId]);
      return rows.map((r: any) => ({
        ...r,
        old_price: Number(r.old_price),
        new_price: Number(r.new_price),
        wholesale_price: Number(r.wholesale_price || 0)
      }));
    }
    const data = this.readLocalData();
    const alerts = (data.mandi_alerts || []).filter((a: any) => (a.shop_id ? a.shop_id === shopId : shopId === 1));
    return alerts.sort((a: any, b: any) => b.id - a.id).slice(0, 25);
  }

  public async addMandiAlert(alert: {
    product_name: string;
    old_price: number;
    new_price: number;
    wholesale_price?: number;
    unit?: string;
    notes?: string;
    sender_name?: string;
    update_product?: boolean;
  }, shopId: number = 1): Promise<MandiAlert> {
    const unit = alert.unit || 'पैकेट';
    const notes = alert.notes || '';
    const sender_name = alert.sender_name || 'दुकानदार (मंडी से)';

    let newAlert: MandiAlert;

    if (this.isMySQLConnected && this.pool) {
      const [res]: any = await this.pool.query(`
        INSERT INTO mandi_alerts (shop_id, product_name, old_price, new_price, wholesale_price, unit, notes, sender_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [shopId, alert.product_name, alert.old_price, alert.new_price, alert.wholesale_price || 0, unit, notes, sender_name]);

      newAlert = {
        id: res.insertId,
        product_name: alert.product_name,
        old_price: alert.old_price,
        new_price: alert.new_price,
        wholesale_price: alert.wholesale_price || 0,
        unit,
        notes,
        sender_name,
        created_at: new Date().toISOString()
      };

      if (alert.update_product !== false) {
        await this.pool.query(`
          UPDATE products 
          SET selling_price = ?,
              wholesale_price = CASE WHEN ? > 0 THEN ? ELSE wholesale_price END
          WHERE shop_id = ? AND (LOWER(TRIM(name)) = LOWER(TRIM(?)) OR LOWER(name) LIKE CONCAT('%', LOWER(TRIM(?)), '%'))
        `, [alert.new_price, alert.wholesale_price || 0, alert.wholesale_price || 0, shopId, alert.product_name, alert.product_name]);
      }
    } else {
      const data = this.readLocalData();
      if (!data.mandi_alerts) data.mandi_alerts = [];
      const newId = data.mandi_alerts.length > 0 ? Math.max(...data.mandi_alerts.map((a: any) => a.id)) + 1 : 1;
      newAlert = {
        id: newId,
        product_name: alert.product_name,
        old_price: alert.old_price,
        new_price: alert.new_price,
        wholesale_price: alert.wholesale_price || 0,
        unit,
        notes,
        sender_name,
        created_at: new Date().toISOString()
      };
      (newAlert as any).shop_id = shopId;
      data.mandi_alerts.push(newAlert);

      if (alert.update_product !== false) {
        const prod = (data.products || []).find((p: any) => (p.shop_id ? p.shop_id === shopId : shopId === 1) && p.name.toLowerCase().trim() === alert.product_name.toLowerCase().trim());
        if (prod) {
          prod.selling_price = alert.new_price;
          if (alert.wholesale_price) prod.wholesale_price = alert.wholesale_price;
        }
      }

      this.writeLocalData(data);
    }

    return newAlert;
  }

  public async deleteMandiAlert(id: number, shopId: number = 1): Promise<boolean> {
    if (this.isMySQLConnected && this.pool) {
      await this.pool.query('DELETE FROM mandi_alerts WHERE id = ? AND shop_id = ?', [id, shopId]);
      return true;
    }
    const data = this.readLocalData();
    if (data.mandi_alerts) {
      data.mandi_alerts = data.mandi_alerts.filter((a: any) => !(a.id === id && (a.shop_id ? a.shop_id === shopId : shopId === 1)));
      this.writeLocalData(data);
    }
    return true;
  }
}

export const db = new DatabaseManager();
