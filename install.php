<?php
/**
 * Dukaan Khaata & Stock Manager - 1-Click Web Installation Wizard
 * Easily configure database, create tables, and set up shopkeeper account on any hosting.
 */

define('LOCK_FILE', __DIR__ . '/installed.lock');
define('LOCK_FILE_ALT', __DIR__ . '/install.lock');
define('CONFIG_FILE', __DIR__ . '/api/config.php');

$isAjax = isset($_GET['ajax']) || (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest');
$isLocked = file_exists(LOCK_FILE) || file_exists(LOCK_FILE_ALT);

// 🔒 STRICT SECURITY & AUTO-REDIRECT:
// If installation wizard has already run & completed all steps (installed.lock or install.lock exists),
// install.php must NEVER open! Redirect directly to main app.
if ($isLocked && !$isAjax && !isset($_GET['force'])) {
    header('Location: index.php');
    exit;
}

if ($isAjax && $isLocked && !isset($_GET['force'])) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error' => 'यह सिस्टम पहले से पूरी तरह इंस्टॉल हो चुका है। सुरक्षा कारणों से install.php लॉक है।'
    ]);
    exit;
}

// --- AJAX HANDLERS ---
if ($isAjax) {
    header('Content-Type: application/json; charset=utf-8');
    $action = $_POST['action'] ?? '';

    // Action 1: Test Database Connection
    if ($action === 'test_db') {
        $host = trim($_POST['db_host'] ?? 'localhost');
        $port = trim($_POST['db_port'] ?? '3306');
        $user = trim($_POST['db_user'] ?? 'root');
        $pass = $_POST['db_pass'] ?? '';
        $dbname = trim($_POST['db_name'] ?? '');

        try {
            // First try connecting to MySQL server directly
            $dsn = "mysql:host={$host};port={$port};charset=utf8mb4";
            $pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 5
            ]);

            // Check if database exists
            $dbExists = false;
            if (!empty($dbname)) {
                $stmt = $pdo->prepare("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?");
                $stmt->execute([$dbname]);
                $dbExists = (bool)$stmt->fetch();
            }

            echo json_encode([
                'success' => true,
                'message' => '✅ MySQL कनेक्शन सफल!',
                'dbExists' => $dbExists,
                'canCreateDb' => true
            ]);
            exit;
        } catch (PDOException $e) {
            echo json_encode([
                'success' => false,
                'error' => 'MySQL कनेक्शन असफल: ' . $e->getMessage()
            ]);
            exit;
        }
    }

    // Action 2: Perform Full Installation
    if ($action === 'install') {
        if (file_exists(LOCK_FILE)) {
            echo json_encode([
                'success' => false,
                'error' => 'यह सिस्टम पहले से इंस्टॉल है। दोबारा इंस्टॉल करने के लिए सर्वर से installed.lock फ़ाइल डिलीट करें।'
            ]);
            exit;
        }

        $host = trim($_POST['db_host'] ?? 'localhost');
        $port = trim($_POST['db_port'] ?? '3306');
        $user = trim($_POST['db_user'] ?? 'root');
        $pass = $_POST['db_pass'] ?? '';
        $dbname = trim($_POST['db_name'] ?? 'dukaan_khaata_db');

        $adminName = trim($_POST['admin_name'] ?? 'मुख्य व्यवस्थापक');
        $adminUsername = strtolower(trim($_POST['admin_username'] ?? 'admin'));
        if (empty($adminUsername)) $adminUsername = 'admin';
        $adminPhone = preg_replace('/[^0-9]/', '', trim($_POST['admin_phone'] ?? '9876543210'));
        if (empty($adminPhone)) $adminPhone = '9876543210';
        $adminEmail = strtolower(trim($_POST['admin_email'] ?? 'admin@dukaan.com'));
        if (empty($adminEmail)) $adminEmail = 'admin@dukaan.com';
        $adminPasswordRaw = trim($_POST['admin_password'] ?? 'admin123');
        if (empty($adminPasswordRaw)) $adminPasswordRaw = 'admin123';
        $platformName = trim($_POST['platform_name'] ?? 'दुकान खाता');

        try {
            // Step 1: Connect to server & create database
            $pdoServer = new PDO("mysql:host={$host};port={$port};charset=utf8mb4", $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);
            $pdoServer->exec("CREATE DATABASE IF NOT EXISTS `{$dbname}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");

            // Step 2: Connect to the specific database
            $pdo = new PDO("mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4", $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);

            // Step 3: Create Tables
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `customers` (
                  `id` INT AUTO_INCREMENT PRIMARY KEY,
                  `name` VARCHAR(150) NOT NULL,
                  `phone` VARCHAR(25) DEFAULT '',
                  `address` VARCHAR(255) DEFAULT '',
                  `due_date` VARCHAR(30) NULL,
                  `credit_limit` DECIMAL(10, 2) DEFAULT 5000,
                  `credit_period_days` INT DEFAULT 15,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `transactions` (
                  `id` INT AUTO_INCREMENT PRIMARY KEY,
                  `customer_id` INT NOT NULL,
                  `type` ENUM('udhaar', 'jama') NOT NULL,
                  `amount` DECIMAL(10, 2) NOT NULL,
                  `notes` TEXT NULL,
                  `bill_image` LONGTEXT NULL,
                  `date` VARCHAR(30) NOT NULL,
                  `voice_recorded` TINYINT(1) DEFAULT 0,
                  `is_deleted` TINYINT(1) DEFAULT 0,
                  `deleted_at` TIMESTAMP NULL,
                  `deleted_reason` VARCHAR(255) NULL,
                  `deleted_by` VARCHAR(100) NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  INDEX `idx_customer` (`customer_id`),
                  INDEX `idx_date` (`date`),
                  CONSTRAINT `fk_transactions_customer` 
                    FOREIGN KEY (`customer_id`) 
                    REFERENCES `customers` (`id`) 
                    ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `products` (
                  `id` INT AUTO_INCREMENT PRIMARY KEY,
                  `name` VARCHAR(150) NOT NULL,
                  `category` VARCHAR(100) DEFAULT 'General',
                  `unit` VARCHAR(30) DEFAULT 'पैकेट',
                  `purchase_price` DECIMAL(10, 2) NOT NULL,
                  `selling_price` DECIMAL(10, 2) NOT NULL,
                  `wholesale_price` DECIMAL(10, 2) DEFAULT 0,
                  `stock_quantity` DECIMAL(10, 2) DEFAULT 0,
                  `min_stock_alert` DECIMAL(10, 2) DEFAULT 5,
                  `barcode` VARCHAR(100) DEFAULT '',
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `shop_settings` (
                  `id` INT AUTO_INCREMENT PRIMARY KEY,
                  `shop_name` VARCHAR(200) NOT NULL,
                  `owner_name` VARCHAR(100) DEFAULT '',
                  `phone` VARCHAR(30) DEFAULT '',
                  `email` VARCHAR(150) DEFAULT '',
                  `address` TEXT NULL,
                  `upi_id` VARCHAR(100) DEFAULT '',
                  `logo` LONGTEXT NULL,
                  `staff_phones` TEXT NULL,
                  `gdrive_webhook_url` TEXT NULL,
                  `auto_backup_enabled` TINYINT(1) DEFAULT 0,
                  `last_backup_time` VARCHAR(50) NULL,
                  `last_backup_status` VARCHAR(50) NULL,
                  `pin` VARCHAR(255) DEFAULT '',
                  `password` VARCHAR(255) DEFAULT '',
                  `status` VARCHAR(30) DEFAULT 'approved',
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `super_admins` (
                  `id` INT AUTO_INCREMENT PRIMARY KEY,
                  `username` VARCHAR(100) UNIQUE NOT NULL,
                  `phone` VARCHAR(30) UNIQUE NOT NULL,
                  `email` VARCHAR(150) DEFAULT NULL,
                  `password` VARCHAR(255) NOT NULL,
                  `name` VARCHAR(100) DEFAULT 'Platform Admin',
                  `role` VARCHAR(50) DEFAULT 'superadmin',
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `mandi_alerts` (
                  `id` INT AUTO_INCREMENT PRIMARY KEY,
                  `product_name` VARCHAR(150) NOT NULL,
                  `old_price` DECIMAL(10, 2) DEFAULT 0,
                  `new_price` DECIMAL(10, 2) NOT NULL,
                  `wholesale_price` DECIMAL(10, 2) DEFAULT 0,
                  `unit` VARCHAR(30) DEFAULT 'पैकेट',
                  `notes` TEXT NULL,
                  `sender_name` VARCHAR(100) DEFAULT 'दुकानदार (मंडी)',
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            // Ensure email column exists in super_admins even if table was created in an older version
            try {
                $pdo->exec("ALTER TABLE `super_admins` ADD COLUMN `email` VARCHAR(150) DEFAULT NULL AFTER `phone`");
            } catch (Exception $e) {}

            $hashedAdminPassword = password_hash((string)$adminPasswordRaw, PASSWORD_BCRYPT);

            // Create initial Super Admin login (NO store is created - wizard is strictly for Super Admin setup)
            $adminStmt = $pdo->prepare("
                INSERT INTO `super_admins` (username, phone, email, password, name, role)
                VALUES (?, ?, ?, ?, ?, 'superadmin')
                ON DUPLICATE KEY UPDATE 
                  phone = VALUES(phone),
                  email = VALUES(email),
                  password = VALUES(password),
                  name = VALUES(name)
            ");
            $adminStmt->execute([$adminUsername, $adminPhone, $adminEmail, $hashedAdminPassword, $adminName]);

            // Step 6: Write api/config.php
            $configContent = "<?php\n" .
                "// Auto-generated by Dukaan Khaata Web Installer on " . date('d-M-Y H:i:s') . "\n" .
                "define('DB_HOST', " . var_export($host, true) . ");\n" .
                "define('DB_NAME', " . var_export($dbname, true) . ");\n" .
                "define('DB_USER', " . var_export($user, true) . ");\n" .
                "define('DB_PASS', " . var_export($pass, true) . ");\n" .
                "define('DB_PORT', " . var_export($port, true) . ");\n" .
                "define('GEMINI_API_KEY', '');\n\n" .
                "function getDB() {\n" .
                "    static \$pdo = null;\n" .
                "    if (\$pdo === null) {\n" .
                "        try {\n" .
                "            \$dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';\n" .
                "            \$pdo = new PDO(\$dsn, DB_USER, DB_PASS, [\n" .
                "                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,\n" .
                "                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,\n" .
                "                PDO::ATTR_EMULATE_PREPARES => false,\n" .
                "            ]);\n" .
                "        } catch (PDOException \$e) {\n" .
                "            http_response_code(500);\n" .
                "            echo json_encode([\n" .
                "                'success' => false,\n" .
                "                'error' => 'Database connection failed: ' . \$e->getMessage()\n" .
                "            ]);\n" .
                "            exit;\n" .
                "        }\n" .
                "    }\n" .
                "    return \$pdo;\n" .
                "}\n";

            if (!is_dir(dirname(CONFIG_FILE))) {
                mkdir(dirname(CONFIG_FILE), 0755, true);
            }
            file_put_contents(CONFIG_FILE, $configContent);

            // Step 7: Create Lock files
            $lockMsg = "Installed on " . date('Y-m-d H:i:s') . " by " . $adminName . "\n";
            file_put_contents(LOCK_FILE, $lockMsg);
            file_put_contents(LOCK_FILE_ALT, $lockMsg);

            echo json_encode([
                'success' => true,
                'message' => '🎉 बधाई हो! सर्वर डेटाबेस और मुख्य व्यवस्थापक खाता तैयार हो गया है।',
                'admin_login' => [
                    'name' => $adminName,
                    'username' => $adminUsername,
                    'phone' => $adminPhone,
                    'email' => $adminEmail,
                    'password' => $adminPasswordRaw
                ]
            ]);
            exit;
        } catch (Exception $e) {
            echo json_encode([
                'success' => false,
                'error' => 'इंस्टॉलेशन में त्रुटि: ' . $e->getMessage()
            ]);
            exit;
        }
    }
}

// Check system requirements
$phpVersion = phpversion();
$isPhpOk = version_compare($phpVersion, '7.4.0', '>=');
$hasPdo = extension_loaded('pdo') && extension_loaded('pdo_mysql');
$isConfigWritable = is_writable(__DIR__) || (file_exists(CONFIG_FILE) && is_writable(CONFIG_FILE));
$alreadyInstalled = file_exists(LOCK_FILE);
?>
<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>दुकान खाता - Installation Wizard (1-Click Setup)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Rozha+One&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    .brand-font { font-family: 'Rozha One', serif; }
  </style>
</head>
<body class="bg-slate-100 min-h-screen flex items-center justify-center p-3 sm:p-6 text-slate-800">
  <div class="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
    <!-- Header -->
    <div class="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 text-white p-6 text-center relative">
      <div class="inline-flex p-3 rounded-2xl bg-white/15 border border-white/20 mb-2 shadow-inner">
        <svg class="w-8 h-8 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
        </svg>
      </div>
      <h1 class="text-2xl font-black tracking-tight">दुकान खाता & स्टॉक मैनेजर</h1>
      <p class="text-xs text-teal-100 mt-1 font-semibold">1-Click Server Installation & Database Setup Wizard</p>
    </div>

    <!-- Installation Box -->
    <div class="p-6 sm:p-8 space-y-6">
      <?php if ($alreadyInstalled): ?>
        <div class="p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-center space-y-3">
          <div class="text-3xl">🔒</div>
          <h2 class="text-base font-extrabold">सिस्टम पहले से इंस्टॉल है!</h2>
          <p class="text-xs text-amber-800 leading-relaxed">
            सुरक्षा कारणों से इंस्टॉलर लॉक है। यदि आप दोबारा नया डेटाबेस सेटअप करना चाहते हैं, तो होस्टिंग से <code>installed.lock</code> फ़ाइल को हटा दें।
          </p>
          <div class="pt-2">
            <a href="index.html" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-md">
              <span>दुकान खाता खोलें (Open App) →</span>
            </a>
          </div>
        </div>
      <?php else: ?>
        <!-- Progress Steps -->
        <div class="flex items-center justify-between text-xs font-bold border-b border-slate-100 pb-4">
          <div id="step-ind-1" class="flex items-center gap-1.5 text-teal-700">
            <span class="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-[11px] font-black">1</span>
            <span>सर्वर चेक</span>
          </div>
          <div class="w-8 h-0.5 bg-slate-200"></div>
          <div id="step-ind-2" class="flex items-center gap-1.5 text-slate-400">
            <span class="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[11px] font-black">2</span>
            <span>डेटाबेस</span>
          </div>
          <div class="w-8 h-0.5 bg-slate-200"></div>
          <div id="step-ind-3" class="flex items-center gap-1.5 text-slate-400">
            <span class="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[11px] font-black">3</span>
            <span>एडमिन सेटअप</span>
          </div>
        </div>

        <!-- Alert messages container -->
        <div id="alert-box" class="hidden p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2"></div>

        <!-- STEP 1: Requirements -->
        <div id="step-1" class="space-y-4">
          <h3 class="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <span>📋 सर्वर आवश्यकताएं (System Check)</span>
          </h3>

          <div class="space-y-2 text-xs">
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span class="font-semibold text-slate-700">PHP संस्करण (>= 7.4): <strong>PHP <?php echo $phpVersion; ?></strong></span>
              <?php if ($isPhpOk): ?>
                <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">सफल (Passed)</span>
              <?php else: ?>
                <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">PHP 7.4+ चाहिए</span>
              <?php endif; ?>
            </div>

            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span class="font-semibold text-slate-700">PDO MySQL एक्सटेंशन</span>
              <?php if ($hasPdo): ?>
                <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">सक्रिय (Active)</span>
              <?php else: ?>
                <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">अनुपलब्ध (Missing)</span>
              <?php endif; ?>
            </div>

            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span class="font-semibold text-slate-700">फ़ाइल लिखने की अनुमति (Writable Config)</span>
              <?php if ($isConfigWritable): ?>
                <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">अनुमति है (Writable)</span>
              <?php else: ?>
                <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">चेतावनी (Check 0755)</span>
              <?php endif; ?>
            </div>
          </div>

          <div class="pt-2">
            <button
              type="button"
              onclick="goToStep(2)"
              class="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <span>डेटाबेस सेटअप शुरू करें (Next Step) →</span>
            </button>
          </div>
        </div>

        <!-- STEP 2: Database Settings -->
        <div id="step-2" class="space-y-4 hidden">
          <h3 class="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <span>🗄️ MySQL डेटाबेस जानकारी दर्ज करें</span>
          </h3>
          <p class="text-xs text-slate-500">
            अपने cPanel या सर्वर के MySQL डेटाबेस का विवरण भरें। यदि डेटाबेस नहीं बना है, तो यह विज़ार्ड अपने आप बना देगा।
          </p>

          <div class="space-y-3 text-xs">
            <div class="grid grid-cols-3 gap-2">
              <div class="col-span-2">
                <label class="font-bold text-slate-700 block mb-1">डेटाबेस होस्ट (Database Host)</label>
                <input type="text" id="db_host" value="localhost" class="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none">
              </div>
              <div>
                <label class="font-bold text-slate-700 block mb-1">पोर्ट (Port)</label>
                <input type="text" id="db_port" value="3306" class="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none">
              </div>
            </div>

            <div>
              <label class="font-bold text-slate-700 block mb-1">डेटाबेस नाम (Database Name) *</label>
              <input type="text" id="db_name" value="dukaan_khaata_db" placeholder="उदा: u12345_dukaan" class="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs font-bold text-teal-900 focus:ring-2 focus:ring-teal-500 focus:outline-none">
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="font-bold text-slate-700 block mb-1">यूज़रनेम (Username) *</label>
                <input type="text" id="db_user" value="root" placeholder="root या cPanel यूजर" class="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none">
              </div>
              <div>
                <label class="font-bold text-slate-700 block mb-1">पासवर्ड (Password)</label>
                <input type="password" id="db_pass" placeholder="डेटाबेस पासवर्ड" class="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none">
              </div>
            </div>

            <!-- Test Connection Button -->
            <div class="pt-1">
              <button
                type="button"
                id="btn-test-db"
                onclick="testDbConnection()"
                class="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <span>🔌 डेटाबेस कनेक्शन टेस्ट करें (Test Connection)</span>
              </button>
            </div>
          </div>

          <div class="flex gap-2 pt-2">
            <button
              type="button"
              onclick="goToStep(1)"
              class="w-1/3 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
            >
              ← वापस
            </button>
            <button
              type="button"
              id="btn-step-2-next"
              onclick="goToStep(3)"
              class="w-2/3 py-2.5 px-3 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs shadow-md cursor-pointer"
            >
              एडमिन सेटअप पर जाएं →
            </button>
          </div>
        </div>

        <!-- STEP 3: Super Admin Platform Setup -->
        <div id="step-3" class="space-y-4 hidden">
          <h3 class="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <span>🛡️ मुख्य व्यवस्थापक (Super Admin) खाता सेटअप</span>
          </h3>
          <p class="text-xs text-slate-500">
            पूरे प्लेटफ़ॉर्म को नियंत्रित करने हेतु मुख्य व्यवस्थापक क्रेडेंशियल दर्ज करें।
          </p>

          <div class="space-y-3 text-xs">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="font-bold text-slate-700 block mb-1">व्यवस्थापक का नाम *</label>
                <input type="text" id="admin_name" value="मुख्य व्यवस्थापक" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" required>
              </div>
              <div>
                <label class="font-bold text-slate-700 block mb-1">एडमिन यूज़रनेम (लॉगिन) *</label>
                <input type="text" id="admin_username" value="admin" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500 focus:outline-none" required>
              </div>
            </div>

            <!-- Admin Email ID (Prominent) -->
            <div class="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200">
              <label class="font-bold text-indigo-950 block mb-1 flex items-center justify-between text-xs">
                <span class="flex items-center gap-1.5">
                  <span>📧</span>
                  <span>एडमिन ईमेल आईडी (Admin Email ID) *</span>
                </span>
                <span class="text-[10px] text-indigo-700 font-semibold bg-indigo-100 px-2 py-0.5 rounded-full">OTP व रिकवरी हेतु</span>
              </label>
              <input type="email" id="admin_email" placeholder="admin@mkstore.in या आपका Gmail" value="admin@mkstore.in" class="w-full px-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" required>
              <p class="text-[10px] text-indigo-800 mt-1">पासवर्ड भूलने पर OTP कोड और बैकअप नोटिफिकेशन इसी ईमेल पर भेजे जाएंगे।</p>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="font-bold text-slate-700 block mb-1">मोबाइल नंबर (10 अंक) *</label>
                <input type="tel" id="admin_phone" maxlength="10" value="9876543210" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none" required>
              </div>
              <div>
                <label class="font-bold text-slate-700 block mb-1">एडमिन पोर्टल पासवर्ड *</label>
                <input type="text" id="admin_password" value="admin123" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none" required>
              </div>
            </div>

            <div>
              <label class="font-bold text-slate-700 block mb-1">ऐप / प्लेटफ़ॉर्म का नाम</label>
              <input type="text" id="platform_name" value="दुकान खाता" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            </div>

            <div class="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-[11px] text-indigo-900 leading-snug flex items-start gap-2">
              <span class="text-base leading-none">🏬</span>
              <span><strong>स्टोर सेटअप:</strong> दुकान का सेटअप इंस्टॉलेशन के बाद आप एडमिन पोर्टल खोलकर <strong>'दुकान जोड़ें (Add Store)'</strong> से या दुकान रजिस्ट्रेशन पेज से कभी भी कर सकते हैं।</span>
            </div>
          </div>

          <div class="flex gap-2 pt-2">
            <button
              type="button"
              onclick="goToStep(2)"
              class="w-1/3 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
            >
              ← वापस
            </button>
            <button
              type="button"
              id="btn-install"
              onclick="executeInstall()"
              class="w-2/3 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-700 to-teal-700 hover:from-indigo-800 hover:to-teal-800 text-white font-extrabold text-xs shadow-lg shadow-indigo-700/25 flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
            >
              <span>🚀 1-क्लिक में इंस्टॉल करें (Install Now)</span>
            </button>
          </div>
        </div>

        <!-- STEP 4: Success Celebration -->
        <div id="step-4" class="space-y-4 hidden text-center py-4">
          <div class="inline-flex p-4 rounded-full bg-emerald-100 text-emerald-600 mb-2 shadow-inner">
            <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
          </div>

          <h2 class="text-xl font-black text-slate-900">🎉 बधाई हो! सर्वर डेटाबेस तैयार है</h2>
          <p class="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
            सभी MySQL टेबल्स और मुख्य व्यवस्थापक (Super Admin) खाता सफलतापूर्वक बन चुका है। कोई भी दुकान अभी नहीं जोड़ी गई है — आप सीधे एडमिन पोर्टल से अपनी पहली दुकान जोड़ सकते हैं।
          </p>

          <div class="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl max-w-sm mx-auto text-xs text-left space-y-2 font-mono">
            <div class="font-extrabold text-indigo-950 flex justify-between border-b border-indigo-200 pb-1 font-sans">
              <span>🛡️ मुख्य व्यवस्थापक लॉगिन:</span>
              <span id="res-admin-user" class="font-mono text-indigo-700 font-bold">admin</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div>👤 <strong>यूज़रनेम:</strong> <span id="res-admin-u" class="font-bold text-indigo-700">admin</span></div>
              <div>🔐 <strong>पासवर्ड:</strong> <span id="res-admin-pass" class="font-bold text-indigo-700">admin123</span></div>
              <div>📲 <strong>मोबाइल:</strong> <span id="res-phone" class="font-bold">9876543210</span></div>
              <div>📧 <strong>ईमेल:</strong> <span id="res-email" class="font-bold truncate">admin@dukaan.com</span></div>
            </div>
          </div>

          <p id="redirect-timer" class="text-[11px] text-teal-600 font-bold pt-2">
            ⏳ 3 सेकंड में एडमिन पोर्टल स्वतः खुल रहा है...
          </p>

          <div class="pt-2">
            <a
              href="./#admin"
              class="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-700 to-teal-700 hover:from-indigo-800 hover:to-teal-800 text-white font-extrabold text-sm shadow-xl shadow-indigo-700/25 active:scale-98 transition-all"
            >
              <span>🛡️ एडमिन पोर्टल खोलें (Open Admin Portal) →</span>
            </a>
          </div>
        </div>
      <?php endif; ?>
    </div>
  </div>

  <script>
    function showAlert(msg, isSuccess = false) {
      const b = document.getElementById('alert-box');
      b.className = 'p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ' + 
        (isSuccess ? 'bg-emerald-50 border border-emerald-300 text-emerald-900' : 'bg-rose-50 border border-rose-300 text-rose-900');
      b.innerHTML = (isSuccess ? '✅ ' : '⚠️ ') + msg;
      b.classList.remove('hidden');
    }

    function hideAlert() {
      document.getElementById('alert-box').classList.add('hidden');
    }

    function goToStep(step) {
      hideAlert();
      [1, 2, 3, 4].forEach(s => {
        const el = document.getElementById('step-' + s);
        if (el) el.classList.add('hidden');
        const ind = document.getElementById('step-ind-' + s);
        if (ind) {
          if (s === step) {
            ind.className = 'flex items-center gap-1.5 text-teal-700 font-extrabold';
            ind.querySelector('span').className = 'w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-[11px] font-black';
          } else if (s < step) {
            ind.className = 'flex items-center gap-1.5 text-emerald-700 font-bold';
            ind.querySelector('span').className = 'w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px] font-black';
          } else {
            ind.className = 'flex items-center gap-1.5 text-slate-400 font-normal';
            ind.querySelector('span').className = 'w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[11px] font-black';
          }
        }
      });
      const target = document.getElementById('step-' + step);
      if (target) target.classList.remove('hidden');
    }

    async function testDbConnection() {
      hideAlert();
      const btn = document.getElementById('btn-test-db');
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ कनेक्शन चेक हो रहा है...';
      btn.disabled = true;

      const fd = new FormData();
      fd.append('action', 'test_db');
      fd.append('db_host', document.getElementById('db_host').value);
      fd.append('db_port', document.getElementById('db_port').value);
      fd.append('db_user', document.getElementById('db_user').value);
      fd.append('db_pass', document.getElementById('db_pass').value);
      fd.append('db_name', document.getElementById('db_name').value);

      try {
        const res = await fetch('install.php?ajax=1', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
          showAlert(data.message + (data.dbExists ? ' (डेटाबेस मौजूद है)' : ' (डेटाबेस नया बनाया जाएगा)'), true);
        } else {
          showAlert(data.error || 'डेटाबेस कनेक्शन असफल!', false);
        }
      } catch (err) {
        showAlert('सर्वर से संपर्क नहीं हो सका: ' + err.message, false);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    async function executeInstall() {
      const emailVal = document.getElementById('admin_email').value.trim();
      if (!emailVal || !emailVal.includes('@') || !emailVal.includes('.')) {
        showAlert('कृपया व्यवस्थापक का मान्य ईमेल आईडी दर्ज करें (यह OTP व पासवर्ड रिकवरी हेतु अति आवश्यक है)।', false);
        return;
      }

      const mobileVal = document.getElementById('admin_phone').value.replace(/[^0-9]/g, '');
      if (mobileVal.length < 10) {
        showAlert('कृपया व्यवस्थापक का सही 10-अंकों का मोबाइल नंबर दर्ज करें।', false);
        return;
      }

      const passVal = document.getElementById('admin_password').value.trim();
      if (passVal.length < 4) {
        showAlert('एडमिन पासवर्ड कम से कम 4 अक्षरों का होना चाहिए।', false);
        return;
      }

      hideAlert();
      const btn = document.getElementById('btn-install');
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ इंस्टॉलेशन चल रहा है, कृपया प्रतीक्षा करें...';
      btn.disabled = true;

      const fd = new FormData();
      fd.append('action', 'install');
      fd.append('db_host', document.getElementById('db_host').value);
      fd.append('db_port', document.getElementById('db_port').value);
      fd.append('db_user', document.getElementById('db_user').value);
      fd.append('db_pass', document.getElementById('db_pass').value);
      fd.append('db_name', document.getElementById('db_name').value);

      fd.append('admin_name', document.getElementById('admin_name').value.trim());
      fd.append('admin_username', document.getElementById('admin_username').value.trim().toLowerCase());
      fd.append('admin_phone', mobileVal);
      fd.append('admin_email', emailVal);
      fd.append('admin_password', passVal);
      fd.append('platform_name', document.getElementById('platform_name').value.trim());

      try {
        const res = await fetch('install.php?ajax=1', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
          if (data.admin_login) {
            document.getElementById('res-admin-user').innerText = data.admin_login.username;
            document.getElementById('res-admin-u').innerText = data.admin_login.username;
            document.getElementById('res-admin-pass').innerText = data.admin_login.password;
            document.getElementById('res-phone').innerText = data.admin_login.phone;
            document.getElementById('res-email').innerText = data.admin_login.email;
          }
          goToStep(4);
          let countdown = 3;
          const timerEl = document.getElementById('redirect-timer');
          const interval = setInterval(() => {
            countdown--;
            if (timerEl) timerEl.innerText = `⏳ ${countdown} सेकंड में एडमिन पोर्टल स्वतः खुल रहा है...`;
            if (countdown <= 0) {
              clearInterval(interval);
              window.location.href = './#admin';
            }
          }, 1000);
        } else {
          showAlert(data.error || 'इंस्टॉलेशन में त्रुटि आई!', false);
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      } catch (err) {
        showAlert('इंस्टॉलेशन में त्रुटि: ' + err.message, false);
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>
