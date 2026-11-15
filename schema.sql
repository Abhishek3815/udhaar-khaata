-- ========================================================
-- Dukaan Khaata & Stock Manager - Multi-Tenant MySQL Schema
-- Supports multiple independent stores in a single database
-- Every store's ledger, customers & products are 100% isolated by shop_id
-- ========================================================

CREATE DATABASE IF NOT EXISTS `dukaan_khaata_db` 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `dukaan_khaata_db`;

-- 1. Table: Shop Settings / Tenant Store Registry (दुकान विवरण व खाता)
CREATE TABLE IF NOT EXISTS `shop_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `shop_name` VARCHAR(200) NOT NULL,
  `owner_name` VARCHAR(100) DEFAULT '',
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(150) DEFAULT '',
  `address` TEXT NULL,
  `upi_id` VARCHAR(100) DEFAULT '',
  `logo` LONGTEXT NULL,
  `staff_phones` TEXT NULL,
  `gdrive_webhook_url` TEXT NULL,
  `auto_backup_enabled` TINYINT(1) DEFAULT 0,
  `last_backup_time` VARCHAR(50) NULL,
  `last_backup_status` VARCHAR(50) NULL,
  `pin` VARCHAR(255) NOT NULL DEFAULT '',
  `password` VARCHAR(255) NOT NULL DEFAULT '',
  `status` VARCHAR(30) NOT NULL DEFAULT 'approved' COMMENT 'pending, approved, suspended, rejected',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_shop_phone` (`phone`),
  INDEX `idx_shop_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1b. Table: Super Platform Administrators (प्लेटफ़ॉर्म सुपर एडमिन)
CREATE TABLE IF NOT EXISTS `super_admins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) UNIQUE NOT NULL,
  `phone` VARCHAR(30) UNIQUE NOT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `password` VARCHAR(255) NOT NULL COMMENT 'Bcrypt Encrypted Hash',
  `name` VARCHAR(100) DEFAULT 'मुख्य व्यवस्थापक (Platform Admin)',
  `role` VARCHAR(50) DEFAULT 'superadmin',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Initial Super Admin (Password 'admin' is securely encrypted with Bcrypt)
INSERT INTO `super_admins` (`id`, `username`, `phone`, `email`, `password`, `name`, `role`)
VALUES (1, 'admin', '9999999999', 'admin@mkstore.in', '$2b$10$Pml5Y7YJYsM0SnJcFccKlu1tcM76u17JQqf6BSH8SsVgm5vQKzCd2', 'मुख्य व्यवस्थापक (Platform Admin)', 'superadmin')
ON DUPLICATE KEY UPDATE `username` = `username`;

-- 2. Table: Customers (दुकान के ग्राहक सूची - Scoped by shop_id)
CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `shop_id` INT NOT NULL DEFAULT 1,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(25) DEFAULT '',
  `address` VARCHAR(255) DEFAULT '',
  `due_date` VARCHAR(30) NULL,
  `credit_limit` DECIMAL(10, 2) DEFAULT 5000,
  `credit_period_days` INT DEFAULT 15,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_shop_id` (`shop_id`),
  INDEX `idx_shop_name` (`shop_id`, `name`),
  CONSTRAINT `fk_customers_shop`
    FOREIGN KEY (`shop_id`)
    REFERENCES `shop_settings` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Table: Transactions / Udhaar-Jama Ledger (लेन-देन - Scoped by shop_id)
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `shop_id` INT NOT NULL DEFAULT 1,
  `customer_id` INT NOT NULL,
  `type` ENUM('udhaar', 'jama') NOT NULL COMMENT 'udhaar: Customer owe money, jama: Customer paid money',
  `amount` DECIMAL(10, 2) NOT NULL,
  `notes` TEXT NULL,
  `bill_image` LONGTEXT NULL,
  `date` VARCHAR(30) NOT NULL,
  `voice_recorded` TINYINT(1) DEFAULT 0,
  `is_deleted` TINYINT(1) DEFAULT 0 COMMENT '1: Cancelled/Cut transaction, 0: Active',
  `deleted_at` TIMESTAMP NULL COMMENT 'Time when transaction was cancelled',
  `deleted_reason` VARCHAR(255) NULL COMMENT 'Reason for cancellation',
  `deleted_by` VARCHAR(100) NULL COMMENT 'User/Role who cancelled entry',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_shop_id` (`shop_id`),
  INDEX `idx_shop_customer` (`shop_id`, `customer_id`),
  INDEX `idx_date` (`date`),
  CONSTRAINT `fk_transactions_customer` 
    FOREIGN KEY (`customer_id`) 
    REFERENCES `customers` (`id`) 
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Table: Products (उत्पाद और खरीद/बिक्री मूल्य - Scoped by shop_id)
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `shop_id` INT NOT NULL DEFAULT 1,
  `name` VARCHAR(150) NOT NULL,
  `category` VARCHAR(100) DEFAULT 'General',
  `unit` VARCHAR(30) DEFAULT 'packet',
  `purchase_price` DECIMAL(10, 2) NOT NULL COMMENT 'Kharid daam',
  `selling_price` DECIMAL(10, 2) NOT NULL COMMENT 'Bikri daam',
  `wholesale_price` DECIMAL(10, 2) DEFAULT 0 COMMENT 'Thok daam',
  `stock_quantity` DECIMAL(10, 2) DEFAULT 0,
  `min_stock_alert` DECIMAL(10, 2) DEFAULT 5,
  `barcode` VARCHAR(100) DEFAULT '',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_shop_id` (`shop_id`),
  INDEX `idx_shop_prod_name` (`shop_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Table: Mandi Alerts (थोक मंडी भाव अलर्ट - Scoped by shop_id)
CREATE TABLE IF NOT EXISTS `mandi_alerts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `shop_id` INT NOT NULL DEFAULT 1,
  `product_name` VARCHAR(150) NOT NULL,
  `old_price` DECIMAL(10, 2) DEFAULT 0,
  `new_price` DECIMAL(10, 2) NOT NULL,
  `wholesale_price` DECIMAL(10, 2) DEFAULT 0,
  `unit` VARCHAR(30) DEFAULT 'पैकेट',
  `notes` TEXT NULL,
  `sender_name` VARCHAR(100) DEFAULT 'दुकानदार (मंडी)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_shop_id` (`shop_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
