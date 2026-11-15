<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Shop-PIN, X-Shop-Id, X-Shop-Token, X-Admin-Token');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config.php';

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// ========================================================
// 1. Automatic Multi-Tenant Schema Migration
// ========================================================
function ensureMultiTenantSchema($pdo) {
    static $done = false;
    if ($done) return;
    $done = true;

    try {
        $pdo->exec("ALTER TABLE `shop_settings` ADD COLUMN `email` VARCHAR(150) DEFAULT ''");
    } catch (\Exception $e) {}

    // Customers shop_id
    try {
        $cCheck = $pdo->query("SHOW COLUMNS FROM `customers` LIKE 'shop_id'")->fetch();
        if (!$cCheck) {
            $pdo->exec("ALTER TABLE `customers` ADD COLUMN `shop_id` INT NOT NULL DEFAULT 1 AFTER `id`, ADD INDEX `idx_shop_id` (`shop_id`)");
        }
    } catch (\Exception $e) {}

    // Transactions shop_id
    try {
        $tCheck = $pdo->query("SHOW COLUMNS FROM `transactions` LIKE 'shop_id'")->fetch();
        if (!$tCheck) {
            $pdo->exec("ALTER TABLE `transactions` ADD COLUMN `shop_id` INT NOT NULL DEFAULT 1 AFTER `id`, ADD INDEX `idx_shop_id` (`shop_id`)");
            // Backfill transaction shop_id from parent customer's shop_id
            $pdo->exec("UPDATE `transactions` t JOIN `customers` c ON t.customer_id = c.id SET t.shop_id = c.shop_id WHERE t.shop_id = 1");
        }
    } catch (\Exception $e) {}

    // Products shop_id
    try {
        $pCheck = $pdo->query("SHOW COLUMNS FROM `products` LIKE 'shop_id'")->fetch();
        if (!$pCheck) {
            $pdo->exec("ALTER TABLE `products` ADD COLUMN `shop_id` INT NOT NULL DEFAULT 1 AFTER `id`, ADD INDEX `idx_shop_id` (`shop_id`)");
        }
    } catch (\Exception $e) {}

    // Mandi alerts shop_id
    try {
        $mCheck = $pdo->query("SHOW COLUMNS FROM `mandi_alerts` LIKE 'shop_id'")->fetch();
        if (!$mCheck) {
            $pdo->exec("ALTER TABLE `mandi_alerts` ADD COLUMN `shop_id` INT NOT NULL DEFAULT 1 AFTER `id`, ADD INDEX `idx_shop_id` (`shop_id`)");
        }
    } catch (\Exception $e) {}

    // Ensure PIN & password columns are VARCHAR(255) for Bcrypt encrypted hashes
    try {
        $pdo->exec("ALTER TABLE `shop_settings` MODIFY COLUMN `pin` VARCHAR(255) DEFAULT '', MODIFY COLUMN `password` VARCHAR(255) DEFAULT ''");
    } catch (\Exception $e) {}

    // Check status column on shop_settings (pending, approved, suspended, rejected)
    try {
        $stCheck = $pdo->query("SHOW COLUMNS FROM `shop_settings` LIKE 'status'")->fetch();
        if (!$stCheck) {
            $pdo->exec("ALTER TABLE `shop_settings` ADD COLUMN `status` VARCHAR(30) DEFAULT 'approved' AFTER `password`");
            $pdo->exec("UPDATE `shop_settings` SET `status` = 'approved' WHERE `status` IS NULL OR `status` = ''");
        }
    } catch (\Exception $e) {}

    // Check super_admins table
    try {
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
        try {
            $pdo->exec("ALTER TABLE `super_admins` ADD COLUMN `email` VARCHAR(150) DEFAULT NULL AFTER `phone`");
        } catch (\Exception $e) {}

        $adminCnt = (int)($pdo->query("SELECT COUNT(*) as cnt FROM super_admins")->fetch()['cnt'] ?? 0);
        if ($adminCnt === 0) {
            $s1 = $pdo->query("SELECT phone, email, password, owner_name FROM shop_settings WHERE id = 1 LIMIT 1")->fetch();
            $admPhone = !empty($s1['phone']) ? $s1['phone'] : '9999999999';
            $admEmail = !empty($s1['email']) ? $s1['email'] : 'admin@dukaan.local';
            $rawPass = !empty($s1['password']) ? $s1['password'] : 'admin123';
            $admPass = (strpos((string)$rawPass, '$2') === 0) ? $rawPass : password_hash((string)$rawPass, PASSWORD_BCRYPT);
            $admName = !empty($s1['owner_name']) ? $s1['owner_name'] : 'Super Admin';
            $insAdm = $pdo->prepare("INSERT INTO super_admins (username, phone, email, password, name, role) VALUES ('admin', ?, ?, ?, ?, 'superadmin')");
            $insAdm->execute([$admPhone, $admEmail, $admPass, $admName]);
        } else {
            // Auto-upgrade any plain text admin passwords to Bcrypt in super_admins table
            $allAdms = $pdo->query("SELECT id, password, email FROM super_admins")->fetchAll();
            foreach ($allAdms as $ad) {
                $p = (string)($ad['password'] ?? '');
                if (!empty($p) && strpos($p, '$2') !== 0) {
                    $pdo->prepare("UPDATE super_admins SET password = ? WHERE id = ?")->execute([password_hash($p, PASSWORD_BCRYPT), $ad['id']]);
                }
            }
            try {
                $pdo->exec("UPDATE super_admins sa JOIN shop_settings ss ON ss.id = 1 SET sa.email = ss.email WHERE (sa.email IS NULL OR sa.email = '') AND ss.email IS NOT NULL AND ss.email != ''");
            } catch (\Exception $e) {}
        }
    } catch (\Exception $e) {}

    // Check platform_settings table
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `platform_settings` (
                `id` INT PRIMARY KEY DEFAULT 1,
                `gdrive_webhook_url` TEXT DEFAULT NULL,
                `auto_backup_enabled` TINYINT(1) DEFAULT 0,
                `auto_backup_interval_hours` INT DEFAULT 2,
                `sync_on_any_store_entry` TINYINT(1) DEFAULT 1,
                `last_backup_time` VARCHAR(50) DEFAULT NULL,
                `last_backup_status` VARCHAR(255) DEFAULT NULL,
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
        $hasPlat = (int)($pdo->query("SELECT COUNT(*) as cnt FROM platform_settings WHERE id = 1")->fetch()['cnt'] ?? 0);
        if ($hasPlat === 0) {
            $pdo->exec("INSERT INTO platform_settings (id, auto_backup_enabled, auto_backup_interval_hours, sync_on_any_store_entry) VALUES (1, 0, 2, 1)");
        }
    } catch (\Exception $e) {}
}

ensureMultiTenantSchema($pdo);

// Bilingual English <-> Hindi Phonetic Matcher (Prevents duplicate customers/products)
function devanagariToLatinPHP($str) {
    static $map = [
        'अ'=>'a', 'आ'=>'aa', 'इ'=>'i', 'ई'=>'ee', 'उ'=>'u', 'ऊ'=>'oo',
        'ए'=>'e', 'ऐ'=>'ai', 'ओ'=>'o', 'औ'=>'au',
        'क'=>'k', 'ख'=>'kh', 'ग'=>'g', 'घ'=>'gh',
        'च'=>'ch', 'छ'=>'chh', 'ज'=>'j', 'झ'=>'jh',
        'ट'=>'t', 'ठ'=>'th', 'ड'=>'d', 'ढ'=>'dh', 'ण'=>'n',
        'त'=>'t', 'थ'=>'th', 'द'=>'d', 'ध'=>'dh', 'न'=>'n',
        'प'=>'p', 'फ'=>'f', 'ब'=>'b', 'भ'=>'bh', 'म'=>'m',
        'य'=>'y', 'र'=>'r', 'ल'=>'l', 'व'=>'v',
        'श'=>'sh', 'ष'=>'sh', 'स'=>'s', 'ह'=>'h',
        'ा'=>'a', 'ि'=>'i', 'ी'=>'i', 'ु'=>'u', 'ू'=>'u',
        'े'=>'e', 'ै'=>'ai', 'ो'=>'o', 'ौ'=>'au', 'ं'=>'n', 'ँ'=>'n', '्'=>'',
        'ॉ'=>'o', 'ॅ'=>'e'
    ];
    $consonants = 'कखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह';
    $chars = preg_split('//u', (string)$str, -1, PREG_SPLIT_NO_EMPTY);
    $out = '';
    $len = count($chars);
    for ($i = 0; $i < $len; $i++) {
        $ch = $chars[$i];
        $next = ($i + 1 < $len) ? $chars[$i + 1] : '';
        if (isset($map[$ch])) {
            $out .= $map[$ch];
            if (mb_strpos($consonants, $ch) !== false && $next !== '' && mb_strpos($consonants, $next) !== false) {
                $out .= 'a';
            }
        } else {
            $out .= $ch;
        }
    }
    return strtolower((string)preg_replace('/[^a-zA-Z0-9\s]/', '', $out));
}

function phoneticNormalizePHP($str) {
    $s = strtolower((string)preg_replace('/[^a-zA-Z0-9]/', '', (string)$str));
    $s = str_replace(['ee', 'oo', 'aa', 'sh', 'w', 'ph'], ['i', 'u', 'a', 's', 'v', 'f'], $s);
    return (string)preg_replace('/(.)\\1+/', '$1', $s);
}

function areNamesEquivalentPHP($a, $b) {
    if (empty($a) || empty($b)) return false;
    $cleanA = trim(mb_strtolower((string)$a, 'UTF-8'));
    $cleanB = trim(mb_strtolower((string)$b, 'UTF-8'));
    if ($cleanA === $cleanB) return true;

    $dict = [
        [['sugar', 'chini', 'cheeni', 'shakkar'], ['चीनी', 'शक्कर']],
        [['oil', 'tel', 'mustard', 'sarson', 'refined'], ['तेल', 'सरसों तेल', 'रिफाइंड']],
        [['salt', 'namak'], ['नमक', 'टाटा नमक']],
        [['flour', 'atta', 'aata', 'wheat'], ['आटा', 'गेहूं का आटा']],
        [['rice', 'chawal'], ['चावल']],
        [['maggi', 'maggie'], ['मैगी', 'मैगी नूडल्स']],
        [['fortune'], ['फॉर्च्यून']],
        [['biscuit', 'biscuits'], ['बिस्कुट', 'बिस्किट']],
        [['soap', 'sabun'], ['साबुन']],
        [['surf', 'detergent'], ['सर्फ', 'डिटर्जेंट']],
        [['tea', 'chai'], ['चाय']],
        [['milk', 'doodh'], ['दूध']]
    ];
    foreach ($dict as $pair) {
        $matchAEn = false; foreach ($pair[0] as $e) { if (strpos($cleanA, $e) !== false) $matchAEn = true; }
        $matchBHi = false; foreach ($pair[1] as $h) { if (mb_strpos($cleanB, $h) !== false) $matchBHi = true; }
        if ($matchAEn && $matchBHi) return true;

        $matchAHi = false; foreach ($pair[1] as $h) { if (mb_strpos($cleanA, $h) !== false) $matchAHi = true; }
        $matchBEn = false; foreach ($pair[0] as $e) { if (strpos($cleanB, $e) !== false) $matchBEn = true; }
        if ($matchAHi && $matchBEn) return true;
    }

    $latA = preg_match('/[\x{0900}-\x{097F}]/u', (string)$a) ? devanagariToLatinPHP($a) : $cleanA;
    $latB = preg_match('/[\x{0900}-\x{097F}]/u', (string)$b) ? devanagariToLatinPHP($b) : $cleanB;

    $normA = phoneticNormalizePHP($latA);
    $normB = phoneticNormalizePHP($latB);

    if ($normA === $normB) return true;
    if (strlen($normA) >= 3 && strlen($normB) >= 3) {
        if (str_starts_with($normA, $normB) || str_starts_with($normB, $normA) || strpos($normA, $normB) !== false || strpos($normB, $normA) !== false) {
            return true;
        }
    }
    return false;
}

// Fast debounced auto-sync trigger to Google Drive on new store entries (Non-blocking)
function triggerStoreAutoBackupOnEntryPHP($pdo, $shopId) {
    if (!$pdo || empty($shopId)) return;
    try {
        $stmt = $pdo->prepare("SELECT gdrive_webhook_url, auto_backup_enabled FROM shop_settings WHERE id = ?");
        $stmt->execute([$shopId]);
        $row = $stmt->fetch();
        if (!$row || empty($row['auto_backup_enabled']) || empty($row['gdrive_webhook_url'])) {
            return;
        }
        $url = trim($row['gdrive_webhook_url']);
        if (!filter_var($url, FILTER_VALIDATE_URL)) return;

        $cStmt = $pdo->prepare("SELECT id, name, phone, address, due_date, credit_limit, credit_period_days FROM customers WHERE shop_id = ? ORDER BY id ASC");
        $cStmt->execute([$shopId]);
        $tStmt = $pdo->prepare("SELECT * FROM transactions WHERE shop_id = ? ORDER BY id ASC");
        $tStmt->execute([$shopId]);
        $pStmt = $pdo->prepare("SELECT * FROM products WHERE shop_id = ? ORDER BY id ASC");
        $pStmt->execute([$shopId]);
        $mStmt = $pdo->prepare("SELECT * FROM mandi_alerts WHERE shop_id = ? ORDER BY id ASC");
        $mStmt->execute([$shopId]);

        $sNameStmt = $pdo->prepare("SELECT shop_name FROM shop_settings WHERE id = ?");
        $sNameStmt->execute([$shopId]);
        $shopName = $sNameStmt->fetchColumn() ?: ('Store_' . $shopId);

        $backupData = [
            'version' => '2.5-isolated-store',
            'backup_type' => 'INDIVIDUAL_STORE_BACKUP',
            'is_platform_backup' => false,
            'timestamp' => date('c'),
            'shop_id' => $shopId,
            'shop_name' => $shopName,
            'data' => [
                'customers' => $cStmt->fetchAll(),
                'transactions' => $tStmt->fetchAll(),
                'products' => $pStmt->fetchAll(),
                'mandi_alerts' => $mStmt->fetchAll()
            ]
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($backupData));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3); // Quick timeout
        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $timeStr = date('h:i A (d/m/Y)');
        if ($httpCode >= 200 && $httpCode < 400) {
            $pdo->prepare("UPDATE shop_settings SET last_backup_time = ?, last_backup_status = 'सफल (Success)' WHERE id = ?")->execute([$timeStr, $shopId]);
        }
    } catch (\Throwable $e) {}
}

// ========================================================
// Password & PIN Encryption Engine (Bcrypt Hashing)
// ========================================================
function hashSecret($plain) {
    if ($plain === null || $plain === '') return '';
    return password_hash((string)$plain, PASSWORD_BCRYPT);
}

function verifySecret($plain, $hash) {
    if ($hash === null || $hash === '' || $plain === null || $plain === '') return false;
    // 1. Check Bcrypt hash
    if (password_verify((string)$plain, (string)$hash)) {
        return true;
    }
    // 2. Backward compatibility: if existing database record was plain-text
    if ((string)$plain === (string)$hash) {
        return true;
    }
    return false;
}

// ========================================================
// 2. Token Authentication & Multi-Tenant Isolation
// ========================================================
define('AUTH_SECRET_KEY', 'dukaan_saas_multi_tenant_secret_2026_x89a');

function generateShopToken($shopId, $phone) {
    $payload = [
        'shop_id' => (int)$shopId,
        'phone' => (string)$phone,
        'created_at' => time()
    ];
    $b64 = base64_encode(json_encode($payload));
    $sig = hash_hmac('sha256', $b64, AUTH_SECRET_KEY);
    return $b64 . '.' . $sig;
}

function verifyShopToken($token) {
    if (empty($token) || strpos($token, '.') === false) return null;
    list($b64, $sig) = explode('.', $token, 2);
    $expected = hash_hmac('sha256', $b64, AUTH_SECRET_KEY);
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(base64_decode($b64), true);
    if (!$data || empty($data['shop_id'])) return null;
    return (int)$data['shop_id'];
}

function generateAdminToken($adminId, $username) {
    $payload = [
        'admin_id' => (int)$adminId,
        'username' => (string)$username,
        'role' => 'superadmin',
        'created_at' => time()
    ];
    $b64 = base64_encode(json_encode($payload));
    $sig = hash_hmac('sha256', $b64, AUTH_SECRET_KEY);
    return $b64 . '.' . $sig;
}

function verifyAdminToken($token) {
    if (empty($token) || strpos($token, '.') === false) return null;
    list($b64, $sig) = explode('.', $token, 2);
    $expected = hash_hmac('sha256', $b64, AUTH_SECRET_KEY);
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(base64_decode($b64), true);
    if (!$data || empty($data['admin_id']) || ($data['role'] ?? '') !== 'superadmin') return null;
    // Enforce 7-day token expiration
    if (!empty($data['created_at']) && (time() - (int)$data['created_at']) > (7 * 86400)) return null;
    return (int)$data['admin_id'];
}

function getAuthSuperAdmin($pdo) {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $h = [];
    foreach ($headers as $k => $v) $h[strtolower($k)] = $v;

    $token = '';
    if (!empty($h['authorization']) && preg_match('/Bearer\s+(.*)$/i', $h['authorization'], $m)) {
        $token = trim($m[1]);
    }
    if (empty($token) && !empty($h['x-admin-token'])) {
        $token = trim($h['x-admin-token']);
    }

    $adminId = verifyAdminToken($token);
    if ($adminId) {
        $st = $pdo->prepare("SELECT id, username, phone, name, role FROM super_admins WHERE id = ?");
        $st->execute([$adminId]);
        $admin = $st->fetch();
        if ($admin) return $admin;
    }

    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'अनाधिकृत अनुरोध! केवल सुपर एडमिन ही इस पोर्टल को एक्सेस कर सकते हैं।']);
    exit;
}

function getRequestShopId($pdo, $required = true) {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $h = [];
    foreach ($headers as $k => $v) {
        $h[strtolower($k)] = $v;
    }

    $token = '';
    if (!empty($h['authorization'])) {
        if (preg_match('/Bearer\s+(.*)$/i', $h['authorization'], $m)) {
            $token = trim($m[1]);
        }
    }
    if (empty($token) && !empty($h['x-shop-token'])) {
        $token = trim($h['x-shop-token']);
    }
    if (empty($token) && !empty($_GET['shop_token'])) {
        $token = trim($_GET['shop_token']);
    }

    $shopId = null;
    if (!empty($token)) {
        $shopId = verifyShopToken($token);
    }

    if ($shopId) {
        $stmt = $pdo->prepare("SELECT id FROM shop_settings WHERE id = ?");
        $stmt->execute([$shopId]);
        if ($stmt->fetch()) {
            return $shopId;
        }
    }

    // Direct X-Shop-Id header check (validated against database)
    if (!empty($h['x-shop-id']) && is_numeric($h['x-shop-id'])) {
        $potentialId = (int)$h['x-shop-id'];
        $stmt = $pdo->prepare("SELECT id FROM shop_settings WHERE id = ?");
        $stmt->execute([$potentialId]);
        if ($stmt->fetch()) {
            return $potentialId;
        }
    }

    // Single shop backward compatibility: if exactly one shop exists, fallback to it
    try {
        $allShops = $pdo->query("SELECT id FROM shop_settings LIMIT 2")->fetchAll();
        if (count($allShops) === 1) {
            return (int)$allShops[0]['id'];
        }
    } catch (\Exception $e) {}

    if ($required) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'need_login' => true,
            'error' => 'कृपया अपनी दुकान के खाते में लॉगिन करें (Authentication required)'
        ]);
        exit;
    }

    return null;
}

// Get route path
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pos = strpos($uri, '/api');
if ($pos !== false) {
    $path = substr($uri, $pos + 4);
} else {
    $path = $uri;
}
$path = trim($path, '/');
$segments = explode('/', $path);
$resource = $segments[0] ?? '';
$resourceId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;

function getJsonInput() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?: [];
}

function getCustomerPassbookToken($id, $phone) {
    return substr(hash_hmac('sha256', "cust_{$id}_{$phone}", 'dukaan_khaata_secure_salt_789'), 0, 24);
}

try {
    // ========================================================
    // 0. /api/install/status (Checks whether install lock exists)
    // ========================================================
    if ($resource === 'install') {
        if (($segments[1] ?? '') === 'status' && $method === 'GET') {
            $root = dirname(__DIR__);
            $l1 = file_exists($root . '/installed.lock') || file_exists(__DIR__ . '/../installed.lock') || file_exists(__DIR__ . '/installed.lock');
            $l2 = file_exists($root . '/install.lock') || file_exists(__DIR__ . '/../install.lock') || file_exists(__DIR__ . '/install.lock');
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'success' => true,
                'installed' => ($l1 || $l2)
            ]);
            exit;
        }
    }

    // ========================================================
    // 1. /api/db/status (Scoped by shop_id)
    // ========================================================
    if ($resource === 'db' && ($segments[1] ?? '') === 'status') {
        $shopId = getRequestShopId($pdo, false);

        if (!$shopId) {
            echo json_encode([
                'success' => true,
                'dbType' => 'mysql (multi-tenant saas)',
                'shop_id' => null,
                'isMySQLConnected' => true,
                'connectionError' => null,
                'env' => [
                    'host' => '127.0.0.1',
                    'port' => DB_PORT,
                    'database' => substr(DB_NAME, 0, 2) . '***' . substr(DB_NAME, -2),
                    'user' => substr(DB_USER, 0, 2) . '***',
                    'serverPort' => 80,
                    'serverHost' => $_SERVER['HTTP_HOST'] ?? 'localhost',
                    'geminiConfigured' => defined('GEMINI_API_KEY') && !empty(GEMINI_API_KEY)
                ],
                'stats' => [
                    'totalCustomers' => 0,
                    'totalTransactions' => 0,
                    'totalProducts' => 0,
                    'totalUdhaarAmount' => 0,
                    'totalJamaAmount' => 0,
                    'netMarketDue' => 0
                ]
            ]);
            exit;
        }

        $cStmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM customers WHERE shop_id = ?");
        $cStmt->execute([$shopId]);
        $tStmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM transactions WHERE shop_id = ?");
        $tStmt->execute([$shopId]);
        $pStmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM products WHERE shop_id = ?");
        $pStmt->execute([$shopId]);

        $uStmt = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE shop_id = ? AND type = 'udhaar' AND (is_deleted IS NULL OR is_deleted = 0)");
        $uStmt->execute([$shopId]);
        $jStmt = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE shop_id = ? AND type = 'jama' AND (is_deleted IS NULL OR is_deleted = 0)");
        $jStmt->execute([$shopId]);

        $totalUdhaar = (float)$uStmt->fetch()['total'];
        $totalJama = (float)$jStmt->fetch()['total'];

        echo json_encode([
            'success' => true,
            'dbType' => 'mysql (multi-tenant saas)',
            'shop_id' => $shopId,
            'isMySQLConnected' => true,
            'connectionError' => null,
            'env' => [
                'host' => '127.0.0.1',
                'port' => DB_PORT,
                'database' => substr(DB_NAME, 0, 2) . '***' . substr(DB_NAME, -2),
                'user' => substr(DB_USER, 0, 2) . '***',
                'serverPort' => 80,
                'serverHost' => $_SERVER['HTTP_HOST'] ?? 'localhost',
                'geminiConfigured' => defined('GEMINI_API_KEY') && !empty(GEMINI_API_KEY)
            ],
            'stats' => [
                'totalCustomers' => (int)$cStmt->fetch()['cnt'],
                'totalTransactions' => (int)$tStmt->fetch()['cnt'],
                'totalProducts' => (int)$pStmt->fetch()['cnt'],
                'totalUdhaarAmount' => $totalUdhaar,
                'totalJamaAmount' => $totalJama,
                'netMarketDue' => $totalUdhaar - $totalJama
            ]
        ]);
        exit;
    }

    // ========================================================
    // 2. /api/customers (Scoped by shop_id)
    // ========================================================
    if ($resource === 'customers') {
        $shopId = getRequestShopId($pdo, true);

        if ($method === 'GET') {
            if ($resourceId) {
                $stmt = $pdo->prepare("SELECT * FROM customers WHERE id = ? AND shop_id = ?");
                $stmt->execute([$resourceId, $shopId]);
                $c = $stmt->fetch();
                if ($c) {
                    $c['passbook_token'] = getCustomerPassbookToken($c['id'], $c['phone']);
                }
                echo json_encode(['success' => true, 'data' => $c]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT c.*,
                      COALESCE(SUM(CASE WHEN t.type = 'udhaar' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) as total_udhaar,
                      COALESCE(SUM(CASE WHEN t.type = 'jama' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) as total_jama,
                      (COALESCE(SUM(CASE WHEN t.type = 'udhaar' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN t.type = 'jama' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0)) as net_balance
                    FROM customers c
                    LEFT JOIN transactions t ON (c.id = t.customer_id AND t.shop_id = ?)
                    WHERE c.shop_id = ?
                    GROUP BY c.id
                    ORDER BY net_balance DESC, c.name ASC
                ");
                $stmt->execute([$shopId, $shopId]);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$r) {
                    $r['total_udhaar'] = (float)$r['total_udhaar'];
                    $r['total_jama'] = (float)$r['total_jama'];
                    $r['net_balance'] = (float)$r['net_balance'];
                    $r['passbook_token'] = getCustomerPassbookToken($r['id'], $r['phone']);
                }
                echo json_encode(['success' => true, 'data' => $rows]);
            }
            exit;
        }

        if ($method === 'POST') {
            $input = getJsonInput();
            $name = trim($input['name'] ?? '');
            if (!$name) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Customer name is required']);
                exit;
            }
            $phone = preg_replace('/[^0-9]/', '', trim($input['phone'] ?? ''));
            $address = trim($input['address'] ?? '');
            $dueDate = !empty($input['due_date']) ? $input['due_date'] : null;
            $creditLimit = isset($input['credit_limit']) ? (float)$input['credit_limit'] : 5000;
            $creditPeriodDays = isset($input['credit_period_days']) ? (int)$input['credit_period_days'] : 15;

            // Prevent duplicate customer within the same shop
            $checkParams = [$shopId];
            $sqlCheck = "SELECT id, name, phone FROM customers WHERE shop_id = ? AND (";
            if (!empty($phone) && strlen($phone) >= 10) {
                $sqlCheck .= "phone = ? OR ";
                $checkParams[] = $phone;
            }
            $sqlCheck .= "LOWER(TRIM(name)) = LOWER(TRIM(?))) LIMIT 1";
            $checkParams[] = $name;

            $stmtCheck = $pdo->prepare($sqlCheck);
            $stmtCheck->execute($checkParams);
            $existingCust = $stmtCheck->fetch();

            // Check bilingual English <-> Hindi customer equivalence
            if (!$existingCust) {
                $allCustStmt = $pdo->prepare("SELECT id, name, phone FROM customers WHERE shop_id = ?");
                $allCustStmt->execute([$shopId]);
                $allShopCusts = $allCustStmt->fetchAll();
                foreach ($allShopCusts as $sc) {
                    if (areNamesEquivalentPHP($sc['name'], $name)) {
                        $existingCust = $sc;
                        break;
                    }
                }
            }

            if ($existingCust) {
                http_response_code(409);
                $isPhoneMatch = !empty($phone) && strlen($phone) >= 10 && !empty($existingCust['phone']) && preg_replace('/[^0-9]/', '', $existingCust['phone']) === $phone;
                $errMsg = $isPhoneMatch
                    ? "इस मोबाइल नंबर ({$phone}) का ग्राहक पहले से मौजूद है: \"{$existingCust['name']}\""
                    : "\"{$name}\" ({$existingCust['name']}) नाम का ग्राहक खाता पहले से मौजूद है!";
                echo json_encode([
                    'success' => false,
                    'duplicate' => true,
                    'existing_id' => (int)$existingCust['id'],
                    'error' => $errMsg
                ]);
                exit;
            }

            $stmt = $pdo->prepare("
                INSERT INTO customers (shop_id, name, phone, address, due_date, credit_limit, credit_period_days)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$shopId, $name, $phone, $address, $dueDate, $creditLimit, $creditPeriodDays]);
            $newId = (int)$pdo->lastInsertId();
            triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);

            echo json_encode([
                'success' => true,
                'data' => [
                    'id' => $newId,
                    'shop_id' => $shopId,
                    'name' => $name,
                    'phone' => $phone,
                    'address' => $address,
                    'due_date' => $dueDate,
                    'credit_limit' => $creditLimit,
                    'credit_period_days' => $creditPeriodDays,
                    'total_udhaar' => 0,
                    'total_jama' => 0,
                    'net_balance' => 0,
                    'passbook_token' => getCustomerPassbookToken($newId, $phone)
                ]
            ]);
            exit;
        }

        if ($method === 'PUT' && $resourceId) {
            $input = getJsonInput();
            $fields = [];
            $values = [];

            if (isset($input['name'])) {
                $fields[] = "name = ?";
                $values[] = trim($input['name']);
            }
            if (isset($input['phone'])) {
                $fields[] = "phone = ?";
                $values[] = trim($input['phone']);
            }
            if (isset($input['address'])) {
                $fields[] = "address = ?";
                $values[] = trim($input['address']);
            }
            if (array_key_exists('due_date', $input)) {
                $fields[] = "due_date = ?";
                $values[] = !empty($input['due_date']) ? $input['due_date'] : null;
            }
            if (array_key_exists('credit_limit', $input)) {
                $fields[] = "credit_limit = ?";
                $values[] = ($input['credit_limit'] !== null && $input['credit_limit'] !== '') ? (float)$input['credit_limit'] : null;
            }
            if (array_key_exists('credit_period_days', $input)) {
                $fields[] = "credit_period_days = ?";
                $values[] = ($input['credit_period_days'] !== null && $input['credit_period_days'] !== '') ? (int)$input['credit_period_days'] : null;
            }

            if (!empty($fields)) {
                $values[] = $resourceId;
                $values[] = $shopId;
                $stmt = $pdo->prepare("UPDATE customers SET " . implode(', ', $fields) . " WHERE id = ? AND shop_id = ?");
                $stmt->execute($values);
                triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
            }

            echo json_encode(['success' => true]);
            exit;
        }

        if ($method === 'DELETE' && $resourceId) {
            $stmt = $pdo->prepare("DELETE FROM customers WHERE id = ? AND shop_id = ?");
            $stmt->execute([$resourceId, $shopId]);
            triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
            echo json_encode(['success' => true]);
            exit;
        }
    }

    // ========================================================
    // 3. /api/transactions (Scoped by shop_id)
    // ========================================================
    if ($resource === 'transactions') {
        $shopId = getRequestShopId($pdo, true);

        if ($method === 'GET') {
            $customerId = isset($_GET['customerId']) ? (int)$_GET['customerId'] : null;
            if ($customerId) {
                $stmt = $pdo->prepare("
                    SELECT t.*, c.name as customer_name, c.phone as customer_phone
                    FROM transactions t
                    JOIN customers c ON (t.customer_id = c.id AND c.shop_id = ?)
                    WHERE t.shop_id = ? AND t.customer_id = ?
                    ORDER BY t.date DESC, t.id DESC
                ");
                $stmt->execute([$shopId, $shopId, $customerId]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT t.*, c.name as customer_name, c.phone as customer_phone
                    FROM transactions t
                    JOIN customers c ON (t.customer_id = c.id AND c.shop_id = ?)
                    WHERE t.shop_id = ?
                    ORDER BY t.date DESC, t.id DESC
                    LIMIT 200
                ");
                $stmt->execute([$shopId, $shopId]);
            }
            $rows = $stmt->fetchAll();
            foreach ($rows as &$r) {
                $r['amount'] = (float)$r['amount'];
                $r['voice_recorded'] = (bool)$r['voice_recorded'];
                $r['is_deleted'] = (bool)($r['is_deleted'] ?? false);
            }
            echo json_encode(['success' => true, 'data' => $rows]);
            exit;
        }

        if ($method === 'POST') {
            $input = getJsonInput();
            $customerId = (int)($input['customer_id'] ?? 0);
            $customerName = trim($input['customer_name'] ?? '');
            $type = $input['type'] ?? 'udhaar';
            $amount = (float)($input['amount'] ?? 0);
            $notes = trim($input['notes'] ?? '');
            $date = $input['date'] ?? date('Y-m-d');
            $voiceRecorded = !empty($input['voice_recorded']) ? 1 : 0;
            $billImage = !empty($input['bill_image']) ? $input['bill_image'] : null;

            if ($amount <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'कृपया मान्य राशि (Amount) दर्ज करें']);
                exit;
            }

            // If customer_id is missing (e.g. from Voice input), match by name or bilingual equivalent or auto-create
            if (!$customerId && !empty($customerName)) {
                $cFind = $pdo->prepare("SELECT id, name, phone FROM customers WHERE shop_id = ?");
                $cFind->execute([$shopId]);
                $allCusts = $cFind->fetchAll();
                $foundCust = null;
                foreach ($allCusts as $c) {
                    if (areNamesEquivalentPHP($c['name'], $customerName)) {
                        $foundCust = $c;
                        break;
                    }
                }
                if ($foundCust) {
                    $customerId = (int)$foundCust['id'];
                } else {
                    $insCust = $pdo->prepare("INSERT INTO customers (shop_id, name, phone, address, credit_limit, credit_period_days) VALUES (?, ?, '', '', 5000, 15)");
                    $insCust->execute([$shopId, $customerName]);
                    $customerId = (int)$pdo->lastInsertId();
                }
            }

            if (!$customerId) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'ग्राहक का नाम या चयन आवश्यक है']);
                exit;
            }

            // Verify customer belongs to this shop
            $custStmt = $pdo->prepare("SELECT name, phone FROM customers WHERE id = ? AND shop_id = ?");
            $custStmt->execute([$customerId, $shopId]);
            $cust = $custStmt->fetch();
            if (!$cust) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'यह ग्राहक आपकी दुकान में पंजीकृत नहीं है']);
                exit;
            }

            $stmt = $pdo->prepare("
                INSERT INTO transactions (shop_id, customer_id, type, amount, notes, bill_image, date, voice_recorded)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$shopId, $customerId, $type, $amount, $notes, $billImage, $date, $voiceRecorded]);
            $newId = (int)$pdo->lastInsertId();
            triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);

            echo json_encode([
                'success' => true,
                'data' => [
                    'id' => $newId,
                    'shop_id' => $shopId,
                    'customer_id' => $customerId,
                    'customer_name' => $cust['name'] ?? $customerName,
                    'customer_phone' => $cust['phone'] ?? '',
                    'type' => $type,
                    'amount' => $amount,
                    'notes' => $notes,
                    'bill_image' => $billImage,
                    'date' => $date,
                    'voice_recorded' => (bool)$voiceRecorded
                ]
            ]);
            exit;
        }

        if ($method === 'DELETE' && $resourceId) {
            $input = getJsonInput();
            $reason = trim($input['reason'] ?? ($_GET['reason'] ?? 'दुकानदार द्वारा रद्द'));
            $pin = trim($input['pin'] ?? ($_GET['pin'] ?? ''));

            $setStmt = $pdo->prepare("SELECT pin FROM shop_settings WHERE id = ?");
            $setStmt->execute([$shopId]);
            $shopSet = $setStmt ? $setStmt->fetch() : null;
            if ($shopSet && !empty($shopSet['pin']) && !verifySecret($pin, $shopSet['pin'])) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'गलत सुरक्षा पिन (Invalid Security PIN)']);
                exit;
            }

            $stmt = $pdo->prepare("UPDATE transactions SET is_deleted = 1, deleted_at = NOW(), deleted_reason = ? WHERE id = ? AND shop_id = ?");
            $stmt->execute([$reason, $resourceId, $shopId]);
            triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
            echo json_encode(['success' => true]);
            exit;
        }

        if ($method === 'POST' && $resourceId && (isset($_GET['restore']) || (isset($input['action']) && $input['action'] === 'restore'))) {
            $stmt = $pdo->prepare("UPDATE transactions SET is_deleted = 0, deleted_at = NULL, deleted_reason = NULL WHERE id = ? AND shop_id = ?");
            $stmt->execute([$resourceId, $shopId]);
            triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
            echo json_encode(['success' => true, 'restored' => true]);
            exit;
        }
    }

    // ========================================================
    // 4. /api/products (Scoped by shop_id)
    // ========================================================
    if ($resource === 'products') {
        $shopId = getRequestShopId($pdo, true);

        if ($method === 'GET') {
            $stmt = $pdo->prepare("SELECT * FROM products WHERE shop_id = ? ORDER BY name ASC");
            $stmt->execute([$shopId]);
            $rows = $stmt->fetchAll();
            foreach ($rows as &$r) {
                $r['purchase_price'] = (float)$r['purchase_price'];
                $r['selling_price'] = (float)$r['selling_price'];
                $r['stock_quantity'] = (float)$r['stock_quantity'];
                $r['min_stock_alert'] = (float)$r['min_stock_alert'];
            }
            echo json_encode(['success' => true, 'data' => $rows]);
            exit;
        }

        if ($method === 'POST') {
            $input = getJsonInput();

            // 1. Batch / Bulk Import Handler (/api/products/batch)
            if ($resourceId === 'batch' || isset($input['products'])) {
                $productsList = $input['products'] ?? [];
                $addedCount = 0;
                foreach ($productsList as $p) {
                    $pName = trim($p['name'] ?? '');
                    if (!$pName) continue;
                    $pCat = trim($p['category'] ?? 'General');
                    $pUnit = trim($p['unit'] ?? 'पैकेट');
                    $pPurchase = (float)($p['purchase_price'] ?? 0);
                    $pSelling = (float)($p['selling_price'] ?? 0);
                    $pWholesale = (isset($p['wholesale_price']) && $p['wholesale_price'] !== '') ? (float)$p['wholesale_price'] : null;
                    $pStock = (float)($p['stock_quantity'] ?? 0);
                    $pAlert = (float)($p['min_stock_alert'] ?? 5);
                    $pBarcode = trim($p['barcode'] ?? '');

                    // Check if product already exists in shop
                    $pExist = null;
                    if (!empty($pBarcode)) {
                        $pSt = $pdo->prepare("SELECT id FROM products WHERE shop_id = ? AND barcode = ? LIMIT 1");
                        $pSt->execute([$shopId, $pBarcode]);
                        $pExist = $pSt->fetch();
                    }
                    if (!$pExist) {
                        $pSt = $pdo->prepare("SELECT id FROM products WHERE shop_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(unit)) = LOWER(TRIM(?)) LIMIT 1");
                        $pSt->execute([$shopId, $pName, $pUnit]);
                        $pExist = $pSt->fetch();
                    }

                    if ($pExist) {
                        // Update existing rather than creating duplicate
                        $upSt = $pdo->prepare("UPDATE products SET category = ?, purchase_price = ?, selling_price = ?, wholesale_price = COALESCE(?, wholesale_price), stock_quantity = stock_quantity + ?, min_stock_alert = COALESCE(?, min_stock_alert) WHERE id = ?");
                        $upSt->execute([$pCat, $pPurchase, $pSelling, $pWholesale, $pStock, $pAlert, $pExist['id']]);
                    } else {
                        $insSt = $pdo->prepare("INSERT INTO products (shop_id, name, category, unit, purchase_price, selling_price, wholesale_price, stock_quantity, min_stock_alert, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                        $insSt->execute([$shopId, $pName, $pCat, $pUnit, $pPurchase, $pSelling, $pWholesale, $pStock, $pAlert, $pBarcode]);
                    }
                    $addedCount++;
                }
                triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
                echo json_encode(['success' => true, 'count' => $addedCount]);
                exit;
            }

            // 2. Single Product Addition
            $pName = trim($input['name'] ?? '');
            $pCat = trim($input['category'] ?? 'General');
            $pUnit = trim($input['unit'] ?? 'पैकेट');
            $pBarcode = trim($input['barcode'] ?? '');
            $forceUpsert = !empty($input['force_upsert']);

            // Duplicate check
            $pExist = null;
            if (!empty($pBarcode)) {
                $pSt = $pdo->prepare("SELECT id, name, unit, selling_price FROM products WHERE shop_id = ? AND barcode = ? LIMIT 1");
                $pSt->execute([$shopId, $pBarcode]);
                $pExist = $pSt->fetch();
            }
            if (!$pExist && !empty($pName)) {
                $pSt = $pdo->prepare("SELECT id, name, unit, selling_price FROM products WHERE shop_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(unit)) = LOWER(TRIM(?)) LIMIT 1");
                $pSt->execute([$shopId, $pName, $pUnit]);
                $pExist = $pSt->fetch();
            }
            if (!$pExist && !empty($pName)) {
                $allPSt = $pdo->prepare("SELECT id, name, unit, selling_price FROM products WHERE shop_id = ?");
                $allPSt->execute([$shopId]);
                $existingProds = $allPSt->fetchAll();
                foreach ($existingProds as $ep) {
                    if (areNamesEquivalentPHP($ep['name'], $pName)) {
                        $pExist = $ep;
                        break;
                    }
                }
            }

            if ($pExist && !$forceUpsert) {
                http_response_code(409);
                echo json_encode([
                    'success' => false,
                    'duplicate' => true,
                    'existing_id' => (int)$pExist['id'],
                    'error' => "सामान '{$pName}' ({$pUnit}) पहले से इन्वेंट्री में मौजूद है! (रेट: ₹{$pExist['selling_price']})"
                ]);
                exit;
            }

            if ($pExist && $forceUpsert) {
                $upSt = $pdo->prepare("UPDATE products SET category = ?, purchase_price = ?, selling_price = ?, wholesale_price = COALESCE(?, wholesale_price), stock_quantity = stock_quantity + ?, min_stock_alert = COALESCE(?, min_stock_alert) WHERE id = ?");
                $upSt->execute([
                    $pCat,
                    (float)($input['purchase_price'] ?? 0),
                    (float)($input['selling_price'] ?? 0),
                    (isset($input['wholesale_price']) && $input['wholesale_price'] !== '') ? (float)$input['wholesale_price'] : null,
                    (float)($input['stock_quantity'] ?? 0),
                    (float)($input['min_stock_alert'] ?? 5),
                    $pExist['id']
                ]);
                $input['id'] = (int)$pExist['id'];
                $input['shop_id'] = $shopId;
                triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
                echo json_encode(['success' => true, 'updated' => true, 'data' => $input]);
                exit;
            }

            $stmt = $pdo->prepare("
                INSERT INTO products (shop_id, name, category, unit, purchase_price, selling_price, wholesale_price, stock_quantity, min_stock_alert, barcode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $shopId,
                $pName,
                $pCat,
                $pUnit,
                (float)($input['purchase_price'] ?? 0),
                (float)($input['selling_price'] ?? 0),
                (isset($input['wholesale_price']) && $input['wholesale_price'] !== null && $input['wholesale_price'] !== '') ? (float)$input['wholesale_price'] : null,
                (float)($input['stock_quantity'] ?? 0),
                (float)($input['min_stock_alert'] ?? 5),
                $pBarcode
            ]);
            $newId = (int)$pdo->lastInsertId();
            $input['id'] = $newId;
            $input['shop_id'] = $shopId;
            triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
            echo json_encode(['success' => true, 'data' => $input]);
            exit;
        }

        if ($method === 'PUT' && $resourceId) {
            $input = getJsonInput();
            $fields = [];
            $values = [];

            if (isset($input['name'])) {
                $fields[] = "name = ?";
                $values[] = trim($input['name']);
            }
            if (isset($input['category'])) {
                $fields[] = "category = ?";
                $values[] = trim($input['category']);
            }
            if (isset($input['unit'])) {
                $fields[] = "unit = ?";
                $values[] = trim($input['unit']);
            }
            if (isset($input['purchase_price'])) {
                $fields[] = "purchase_price = ?";
                $values[] = (float)$input['purchase_price'];
            }
            if (isset($input['selling_price'])) {
                $fields[] = "selling_price = ?";
                $values[] = (float)$input['selling_price'];
            }
            if (array_key_exists('wholesale_price', $input)) {
                $fields[] = "wholesale_price = ?";
                $values[] = ($input['wholesale_price'] !== null && $input['wholesale_price'] !== '') ? (float)$input['wholesale_price'] : null;
            }
            if (isset($input['stock_quantity'])) {
                $fields[] = "stock_quantity = ?";
                $values[] = (float)$input['stock_quantity'];
            }
            if (isset($input['min_stock_alert'])) {
                $fields[] = "min_stock_alert = ?";
                $values[] = (float)$input['min_stock_alert'];
            }
            if (isset($input['barcode'])) {
                $fields[] = "barcode = ?";
                $values[] = trim($input['barcode']);
            }

            if (!empty($fields)) {
                $values[] = $resourceId;
                $values[] = $shopId;
                $stmt = $pdo->prepare("UPDATE products SET " . implode(', ', $fields) . " WHERE id = ? AND shop_id = ?");
                $stmt->execute($values);
                triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
            }

            echo json_encode(['success' => true]);
            exit;
        }

        if ($method === 'DELETE' && $resourceId) {
            $stmt = $pdo->prepare("DELETE FROM products WHERE id = ? AND shop_id = ?");
            $stmt->execute([$resourceId, $shopId]);
            triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
            echo json_encode(['success' => true]);
            exit;
        }
    }

    // ========================================================
    // 5. /api/settings (Scoped by shop_id)
    // ========================================================
    if ($resource === 'settings') {
        $shopId = getRequestShopId($pdo, false);

        if ($method === 'GET') {
            if (!$shopId) {
                // Public / Neutral platform settings when not logged in
                echo json_encode([
                    'success' => true,
                    'data' => [
                        'id' => 0,
                        'shop_name' => 'दुकान खाता',
                        'owner_name' => 'दुकानदार',
                        'phone' => '',
                        'email' => '',
                        'address' => '',
                        'upi_id' => '',
                        'logo' => null
                    ]
                ]);
                exit;
            }

            $stmt = $pdo->prepare("SELECT id, shop_name, owner_name, phone, email, address, upi_id, logo, staff_phones, gdrive_webhook_url, auto_backup_enabled, last_backup_time, last_backup_status FROM shop_settings WHERE id = ?");
            $stmt->execute([$shopId]);
            $row = $stmt->fetch();
            if (!$row) {
                $row = [
                    'id' => $shopId,
                    'shop_name' => 'दुकान खाता',
                    'owner_name' => 'दुकानदार',
                    'phone' => '',
                    'email' => '',
                    'address' => '',
                    'upi_id' => '',
                    'logo' => null
                ];
            }
            echo json_encode(['success' => true, 'data' => $row]);
            exit;
        }

        if ($method === 'POST') {
            $shopId = getRequestShopId($pdo, true);
            $input = getJsonInput();

            $stmt = $pdo->prepare("SELECT id, pin, password FROM shop_settings WHERE id = ?");
            $stmt->execute([$shopId]);
            $exists = $stmt->fetch();

            $shopName = trim($input['shop_name'] ?? 'मेरी दुकान');
            $ownerName = trim($input['owner_name'] ?? 'दुकानदार');
            $phone = trim($input['phone'] ?? '');
            $email = trim($input['email'] ?? '');
            $address = trim($input['address'] ?? '');
            $upiId = trim($input['upi_id'] ?? '');
            $logo = !empty($input['logo']) ? $input['logo'] : null;
            $staffPhones = trim($input['staff_phones'] ?? '');
            $gdriveUrl = !empty($input['gdrive_webhook_url']) ? trim($input['gdrive_webhook_url']) : null;
            $autoBackup = !empty($input['auto_backup_enabled']) ? 1 : 0;
            $lastTime = !empty($input['last_backup_time']) ? trim($input['last_backup_time']) : null;
            $lastStatus = !empty($input['last_backup_status']) ? trim($input['last_backup_status']) : null;
            
            $inputPin = trim($input['pin'] ?? '');
            $inputPass = trim($input['password'] ?? '');
            $finalPin = !empty($inputPin) ? hashSecret($inputPin) : ($exists['pin'] ?? hashSecret('1234'));
            $finalPass = !empty($inputPass) ? hashSecret($inputPass) : ($exists['password'] ?? hashSecret('admin'));

            if ($exists) {
                $update = $pdo->prepare("
                    UPDATE shop_settings SET
                        shop_name = ?, owner_name = ?, phone = ?, email = ?, address = ?, upi_id = ?,
                        logo = ?, staff_phones = ?, gdrive_webhook_url = ?, auto_backup_enabled = ?,
                        last_backup_time = ?, last_backup_status = ?, pin = ?, password = ?
                    WHERE id = ?
                ");
                $update->execute([
                    $shopName, $ownerName, $phone, $email, $address, $upiId,
                    $logo, $staffPhones, $gdriveUrl, $autoBackup,
                    $lastTime, $lastStatus, $finalPin, $finalPass,
                    $shopId
                ]);
            } else {
                $insert = $pdo->prepare("
                    INSERT INTO shop_settings
                        (id, shop_name, owner_name, phone, email, address, upi_id, logo, staff_phones, gdrive_webhook_url, auto_backup_enabled, last_backup_time, last_backup_status, pin, password)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $insert->execute([
                    $shopId, $shopName, $ownerName, $phone, $email, $address, $upiId,
                    $logo, $staffPhones, $gdriveUrl, $autoBackup,
                    $lastTime, $lastStatus, $finalPin, $finalPass
                ]);
            }
            unset($input['pin']);
            unset($input['password']);
            $input['id'] = $shopId;
            echo json_encode(['success' => true, 'data' => $input]);
            exit;
        }
    }

    // ========================================================
    // 6. /api/auth (Multi-Tenant Authentication)
    // ========================================================
    if ($resource === 'auth') {
        $sub = $segments[1] ?? '';
        $input = getJsonInput();

        // 6a. Multi-Tenant Login: Finds Shop by Phone
        if ($sub === 'login' && $method === 'POST') {
            $inPhone = preg_replace('/[^0-9]/', '', (string)($input['phone'] ?? ''));
            if (empty($inPhone) || strlen($inPhone) < 10) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'कृपया मान्य 10-अंकों का पंजीकृत मोबाइल नंबर दर्ज करें']);
                exit;
            }

            // Strict 1-to-1 Shop Isolation: Every store has exactly ONE unique registered phone number
            // 2 mobile numbers can NEVER log into the same store. Staff numbers cannot log into the store.
            $clean10 = substr($inPhone, -10);
            $allShops = $pdo->query("SELECT id, shop_name, owner_name, phone, pin, password, status FROM shop_settings")->fetchAll();
            $matchedShop = null;

            foreach ($allShops as $s) {
                $currPhone = preg_replace('/[^0-9]/', '', (string)($s['phone'] ?? ''));
                if (!empty($currPhone) && substr($currPhone, -10) === $clean10) {
                    $matchedShop = $s;
                    break;
                }
            }

            if (!$matchedShop) {
                http_response_code(401);
                echo json_encode([
                    'success' => false,
                    'error' => '❌ यह मोबाइल नंबर किसी भी पंजीकृत दुकान से नहीं जुड़ा है। प्रत्येक दुकान का अपना अलग मोबाइल नंबर होना अनिवार्य है।'
                ]);
                exit;
            }

            // Check Super Admin Approval Status
            $shopStatus = $matchedShop['status'] ?? 'approved';
            if ($shopStatus === 'pending') {
                http_response_code(403);
                echo json_encode([
                    'success' => false,
                    'is_pending_approval' => true,
                    'error' => "⏳ आपकी दुकान '{$matchedShop['shop_name']}' का खाता अभी एडमिन की स्वीकृति (Approval Pending) की प्रतीक्षा में है। कृपया एडमिन द्वारा मंज़ूर किए जाने तक प्रतीक्षा करें।"
                ]);
                exit;
            }
            if ($shopStatus === 'suspended' || $shopStatus === 'rejected') {
                http_response_code(403);
                echo json_encode([
                    'success' => false,
                    'is_suspended' => true,
                    'error' => "❌ यह दुकान खाता निलंबित या अस्वीकृत (Suspended/Rejected) है। कृपया प्लेटफॉर्म एडमिन से संपर्क करें।"
                ]);
                exit;
            }

            $currPin = trim((string)($matchedShop['pin'] ?? '1234'));
            $currPass = trim((string)($matchedShop['password'] ?? 'admin'));
            $shopId = (int)$matchedShop['id'];

            // PIN Mode
            if (isset($input['pin']) && trim((string)$input['pin']) !== '') {
                session_start();
                $lockKey = 'login_lock_' . md5($inPhone);
                $attemptsKey = 'login_attempts_' . md5($inPhone);
                $lockedUntil = $_SESSION[$lockKey] ?? 0;
                if (time() < $lockedUntil) {
                    $waitSec = $lockedUntil - time();
                    http_response_code(429);
                    echo json_encode(['success' => false, 'error' => "⚠️ सुरक्षा अलर्ट: लगातार 5 बार गलत प्रयास के कारण लॉगिन अस्थायी रूप से ब्लॉक है। कृपया {$waitSec} सेकंड बाद प्रयास करें।"]);
                    exit;
                }

                $pinVal = trim((string)$input['pin']);
                if (verifySecret($pinVal, $currPin)) {
                    if (password_needs_rehash($currPin, PASSWORD_BCRYPT) || $currPin === $pinVal) {
                        try {
                            $pdo->prepare("UPDATE shop_settings SET pin = ? WHERE id = ?")->execute([hashSecret($pinVal), $shopId]);
                        } catch (\Exception $e) {}
                    }
                    unset($_SESSION[$attemptsKey]);
                    unset($_SESSION[$lockKey]);
                    $token = generateShopToken($shopId, $inPhone);
                    echo json_encode([
                        'success' => true,
                        'message' => 'लॉगिन सफल (PIN Verified)',
                        'token' => $token,
                        'shop_id' => $shopId,
                        'user' => [
                            'shop_id' => $shopId,
                            'shop_name' => $matchedShop['shop_name'] ?? 'दुकान खाता',
                            'owner_name' => $matchedShop['owner_name'] ?? 'दुकानदार',
                            'phone' => $matchedShop['phone'] ?? $inPhone,
                            'is_staff' => false
                        ]
                    ]);
                    exit;
                } else {
                    $_SESSION[$attemptsKey] = ($_SESSION[$attemptsKey] ?? 0) + 1;
                    if ($_SESSION[$attemptsKey] >= 5) {
                        $_SESSION[$lockKey] = time() + 300;
                        http_response_code(429);
                        echo json_encode(['success' => false, 'error' => '❌ 5 बार गलत पिन! सुरक्षा कारणों से आपका लॉगिन 5 मिनट के लिए ब्लॉक कर दिया गया है।']);
                        exit;
                    }
                    $rem = 5 - $_SESSION[$attemptsKey];
                    http_response_code(401);
                    echo json_encode(['success' => false, 'error' => "❌ गलत सुरक्षा पिन (Incorrect PIN)! शेष प्रयास: {$rem}"]);
                    exit;
                }
            }

            // Password Mode
            if (isset($input['password']) && trim((string)$input['password']) !== '') {
                session_start();
                $lockKey = 'login_lock_' . md5($inPhone);
                $attemptsKey = 'login_attempts_' . md5($inPhone);
                $lockedUntil = $_SESSION[$lockKey] ?? 0;
                if (time() < $lockedUntil) {
                    $waitSec = $lockedUntil - time();
                    http_response_code(429);
                    echo json_encode(['success' => false, 'error' => "⚠️ सुरक्षा अलर्ट: लगातार गलत प्रयासों के कारण लॉगिन अस्थायी रूप से ब्लॉक है। कृपया {$waitSec} सेकंड बाद प्रयास करें।"]);
                    exit;
                }

                $inPass = trim((string)$input['password']);
                if (verifySecret($inPass, $currPass)) {
                    if (password_needs_rehash($currPass, PASSWORD_BCRYPT) || $currPass === $inPass) {
                        try {
                            $pdo->prepare("UPDATE shop_settings SET password = ? WHERE id = ?")->execute([hashSecret($inPass), $shopId]);
                        } catch (\Exception $e) {}
                    }
                    unset($_SESSION[$attemptsKey]);
                    unset($_SESSION[$lockKey]);
                    $token = generateShopToken($shopId, $inPhone);
                    echo json_encode([
                        'success' => true,
                        'message' => 'लॉगिन सफल (Password Verified)',
                        'token' => $token,
                        'shop_id' => $shopId,
                        'user' => [
                            'shop_id' => $shopId,
                            'shop_name' => $matchedShop['shop_name'] ?? 'दुकान खाता',
                            'owner_name' => $matchedShop['owner_name'] ?? 'दुकानदार',
                            'phone' => $matchedShop['phone'] ?? $inPhone,
                            'is_staff' => false
                        ]
                    ]);
                    exit;
                } else {
                    $_SESSION[$attemptsKey] = ($_SESSION[$attemptsKey] ?? 0) + 1;
                    if ($_SESSION[$attemptsKey] >= 5) {
                        $_SESSION[$lockKey] = time() + 300;
                        http_response_code(429);
                        echo json_encode(['success' => false, 'error' => '❌ 5 बार गलत पासवर्ड! सुरक्षा कारणों से आपका लॉगिन 5 मिनट के लिए ब्लॉक कर दिया गया है।']);
                        exit;
                    }
                    $rem = 5 - $_SESSION[$attemptsKey];
                    http_response_code(401);
                    echo json_encode(['success' => false, 'error' => "❌ गलत पासवर्ड! शेष प्रयास: {$rem}"]);
                    exit;
                }
            }

            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'कृपया सुरक्षा पिन या पासवर्ड दर्ज करें']);
            exit;
        }

        // 6b. Multi-Tenant Register: Creates a Distinct New Shop
        if ($sub === 'register' && $method === 'POST') {
            $shopName = trim($input['shop_name'] ?? '');
            $phone = preg_replace('/[^0-9]/', '', (string)($input['phone'] ?? ''));
            $ownerName = trim($input['owner_name'] ?? 'दुकानदार');
            $address = trim($input['address'] ?? '');
            $email = trim($input['email'] ?? '');
            $upiId = trim($input['upi_id'] ?? ($phone . '@paytm'));
            $pin = trim($input['pin'] ?? '1234');
            $pass = trim($input['password'] ?? 'admin');
            $hashedPin = hashSecret($pin);
            $hashedPass = hashSecret($pass);

            if (empty($shopName) || empty($phone) || strlen($phone) < 10) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'कृपया दुकान का नाम और 10-अंकों का वैध मोबाइल नंबर दर्ज करें']);
                exit;
            }

            // Strict 1-to-1 Rule: Every store must have a separate, unique mobile number. Duplicate numbers across stores are strictly disallowed.
            $clean10 = substr($phone, -10);
            $allShops = $pdo->query("SELECT id, shop_name, phone FROM shop_settings")->fetchAll();
            foreach ($allShops as $s) {
                $cp = preg_replace('/[^0-9]/', '', (string)($s['phone'] ?? ''));
                if (!empty($cp) && substr($cp, -10) === $clean10) {
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'error' => "❌ मोबाइल नंबर {$phone} पहले से '{$s['shop_name']}' दुकान में पंजीकृत है! एक मोबाइल नंबर से केवल एक ही दुकान चल सकती है। प्रत्येक दुकान के लिए अलग मोबाइल नंबर होना अनिवार्य है।"
                    ]);
                    exit;
                }
            }

            $stmt = $pdo->prepare("
                INSERT INTO shop_settings (shop_name, owner_name, phone, email, address, upi_id, pin, password, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            ");
            $stmt->execute([$shopName, $ownerName, $phone, $email, $address, $upiId, $hashedPin, $hashedPass]);
            $shopId = (int)$pdo->lastInsertId();

            echo json_encode([
                'success' => true,
                'is_pending_approval' => true,
                'message' => "🎉 बधाई हो! आपकी दुकान '{$shopName}' का रजिस्ट्रेशन प्राप्त हो गया है। व्यवस्थापक (Admin) द्वारा मंज़ूर (Approve) किए जाने के बाद आप तुरंत लॉगिन कर सकेंगे।",
                'shop_id' => $shopId,
                'user' => [
                    'shop_id' => $shopId,
                    'shop_name' => $shopName,
                    'owner_name' => $ownerName,
                    'phone' => $phone,
                    'email' => $email,
                    'status' => 'pending',
                    'is_staff' => false
                ]
            ]);
            exit;
        }

        // 6c. Change PIN / Password for logged in shop
        if ($sub === 'change-pin' && $method === 'POST') {
            $shopId = getRequestShopId($pdo, true);
            $currPin = trim($input['currentPin'] ?? '');
            $newPin = trim($input['newPin'] ?? '');
            $newPass = trim($input['newPassword'] ?? '');

            $s = $pdo->prepare("SELECT pin FROM shop_settings WHERE id = ?");
            $s->execute([$shopId]);
            $shopRow = $s->fetch();
            if (!empty($currPin) && !verifySecret($currPin, $shopRow['pin'] ?? '1234')) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'वर्तमान पिन गलत है!']);
                exit;
            }

            if (!empty($newPin)) {
                $pdo->prepare("UPDATE shop_settings SET pin = ? WHERE id = ?")->execute([hashSecret($newPin), $shopId]);
            }
            if (!empty($newPass)) {
                $pdo->prepare("UPDATE shop_settings SET password = ? WHERE id = ?")->execute([hashSecret($newPass), $shopId]);
            }

            echo json_encode(['success' => true, 'message' => 'पिन / पासवर्ड अपडेट हो गया है']);
            exit;
        }

        // 6d. Forgot Password / PIN Request (OTP for specific shop)
        if ($sub === 'forgot-password' && ($segments[2] ?? '') === 'request' && $method === 'POST') {
            $phone = preg_replace('/[^0-9]/', '', (string)($input['phone'] ?? ''));
            $stmt = $pdo->prepare("SELECT id, shop_name, owner_name, phone, email FROM shop_settings WHERE phone = ?");
            $stmt->execute([$phone]);
            $s = $stmt->fetch();

            if (!$s) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => '❌ यह मोबाइल नंबर किसी भी दुकान में पंजीकृत नहीं है!']);
                exit;
            }

            session_start();
            $lastReqKey = 'last_otp_req_' . $phone;
            $lastReq = $_SESSION[$lastReqKey] ?? 0;
            if (time() - $lastReq < 60) {
                $wait = 60 - (time() - $lastReq);
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => "⏳ कृपया नया OTP मंगाने से पहले {$wait} सेकंड प्रतीक्षा करें।"]);
                exit;
            }
            $_SESSION[$lastReqKey] = time();

            $otp = (string)rand(100000, 999999);
            $_SESSION['recovery_otp_' . $phone] = $otp;
            $_SESSION['recovery_exp_' . $phone] = time() + 600;
            $_SESSION['otp_attempts_' . $phone] = 0;

            $targetEmail = trim($s['email'] ?? '');
            $maskedEmail = '';
            $hasEmail = false;
            $emailSent = false;

            if (!empty($targetEmail) && filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) {
                $hasEmail = true;
                $parts = explode('@', $targetEmail);
                $namePart = $parts[0];
                $domainPart = $parts[1] ?? '';
                $maskedName = strlen($namePart) > 2 ? substr($namePart, 0, 2) . str_repeat('*', min(4, strlen($namePart) - 2)) : $namePart . '***';
                $maskedEmail = $maskedName . '@' . $domainPart;

                $ownerName = htmlspecialchars($s['owner_name'] ?? 'दुकानदार', ENT_QUOTES, 'UTF-8');
                $shopName = htmlspecialchars($s['shop_name'] ?? 'दुकान खाता', ENT_QUOTES, 'UTF-8');
                $subject = "=?UTF-8?B?" . base64_encode("🔐 [दुकान खाता] पासवर्ड रीसेट सुरक्षा OTP: " . $otp) . "?=";

                $htmlBody = "
                <!DOCTYPE html>
                <html>
                <body style='font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b; margin: 0;'>
                  <div style='max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 24px;'>
                    <div style='text-align: center; margin-bottom: 20px;'>
                      <span style='font-size: 38px;'>🏪</span>
                      <h2 style='color: #0f766e; margin: 8px 0 2px 0;'>{$shopName}</h2>
                      <p style='color: #64748b; font-size: 13px; margin: 0;'>पासवर्ड व पिन रिकवरी सुरक्षा कोड</p>
                    </div>
                    <p style='font-size: 14px;'>नमस्ते <b>{$ownerName}</b> जी 🙏,</p>
                    <p style='font-size: 13px; color: #475569;'>आपका 6-अंकों का सुरक्षा कोड (OTP):</p>
                    <div style='background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 12px; padding: 16px; text-align: center; margin: 20px 0;'>
                      <span style='font-size: 34px; font-weight: 900; letter-spacing: 6px; color: #15803d; font-family: monospace;'>{$otp}</span>
                    </div>
                    <p style='font-size: 12px; color: #64748b;'>⏱️ यह कोड 10 मिनट के लिए मान्य है।</p>
                  </div>
                </body>
                </html>";

                $serverHost = $_SERVER['SERVER_NAME'] ?? 'localhost';
                $headers = "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nFrom: Dukaan Khaata <no-reply@{$serverHost}>\r\n";
                $emailSent = @mail($targetEmail, $subject, $htmlBody, $headers);
            }

            echo json_encode([
                'success' => true,
                'message' => $hasEmail
                    ? "सुरक्षा कोड (OTP) आपके पंजीकृत ईमेल {$maskedEmail} पर भेज दिया गया है!"
                    : "दुकान में कोई ईमेल पंजीकृत नहीं है।",
                'phone' => $phone,
                'hasEmail' => $hasEmail,
                'maskedEmail' => $maskedEmail,
                'emailSent' => $emailSent,
                'shopName' => $s['shop_name'] ?? 'दुकान खाता',
                'ownerName' => $s['owner_name'] ?? 'दुकानदार'
            ]);
            exit;
        }

        // 6e. Forgot Password Verify & Reset
        if ($sub === 'forgot-password' && ($segments[2] ?? '') === 'verify-and-reset' && $method === 'POST') {
            $phone = preg_replace('/[^0-9]/', '', (string)($input['phone'] ?? ''));
            $otp = trim((string)($input['otp'] ?? ''));
            $newPin = trim((string)($input['newPin'] ?? '1234'));
            $newPass = trim((string)($input['newPassword'] ?? 'admin'));

            $stmt = $pdo->prepare("SELECT id, shop_name, owner_name, phone FROM shop_settings WHERE phone = ?");
            $stmt->execute([$phone]);
            $s = $stmt->fetch();

            if (!$s) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => '❌ यह मोबाइल नंबर दुकान में पंजीकृत नहीं है!']);
                exit;
            }

            session_start();
            $savedOtp = $_SESSION['recovery_otp_' . $phone] ?? '';
            $exp = $_SESSION['recovery_exp_' . $phone] ?? 0;
            $otpAttemptsKey = 'otp_attempts_' . $phone;

            $_SESSION[$otpAttemptsKey] = ($_SESSION[$otpAttemptsKey] ?? 0) + 1;
            if ($_SESSION[$otpAttemptsKey] > 3) {
                unset($_SESSION['recovery_otp_' . $phone]);
                unset($_SESSION['recovery_exp_' . $phone]);
                unset($_SESSION[$otpAttemptsKey]);
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => '❌ 3 बार गलत OTP दर्ज करने के कारण कोड निरस्त हो गया।']);
                exit;
            }

            if (empty($savedOtp) || $otp !== $savedOtp || time() > $exp) {
                $rem = 3 - $_SESSION[$otpAttemptsKey];
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => "❌ गलत या एक्सपायर कोड! शेष प्रयास: {$rem}"]);
                exit;
            }

            unset($_SESSION['recovery_otp_' . $phone]);
            unset($_SESSION['recovery_exp_' . $phone]);
            unset($_SESSION[$otpAttemptsKey]);

            $pdo->prepare("UPDATE shop_settings SET pin = ?, password = ? WHERE id = ?")->execute([hashSecret($newPin), hashSecret($newPass), $s['id']]);

            echo json_encode([
                'success' => true,
                'message' => 'नया पिन और पासवर्ड सफलतापूर्वक सेट हो गया है!',
                'user' => [
                    'shop_id' => $s['id'],
                    'shop_name' => $s['shop_name'] ?? 'दुकान खाता',
                    'owner_name' => $s['owner_name'] ?? 'दुकानदार',
                    'phone' => $s['phone'] ?? $phone
                ]
            ]);
            exit;
        }
    }

    // ========================================================
    // 7. /api/backup (Strictly isolated by shop_id)
    // ========================================================
    if ($resource === 'backup') {
        $shopId = getRequestShopId($pdo, true);
        $action = $segments[1] ?? '';

        if ($action === 'download' && $method === 'GET') {
            $reqPin = trim((string)($_GET['pin'] ?? ($_SERVER['HTTP_X_SHOP_PIN'] ?? '')));
            $s = $pdo->prepare("SELECT pin, shop_name FROM shop_settings WHERE id = ?");
            $s->execute([$shopId]);
            $shopData = $s->fetch();
            $currPin = $shopData['pin'] ?? '1234';

            if (empty($reqPin) || !verifySecret($reqPin, $currPin)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => '❌ अनाधिकृत अनुरोध! बैकअप डाउनलोड करने के लिए दुकान का सुरक्षा पिन आवश्यक है।']);
                exit;
            }

            $cStmt = $pdo->prepare("SELECT * FROM customers WHERE shop_id = ? ORDER BY id ASC");
            $cStmt->execute([$shopId]);
            $customers = $cStmt->fetchAll();

            $tStmt = $pdo->prepare("SELECT * FROM transactions WHERE shop_id = ? ORDER BY id ASC");
            $tStmt->execute([$shopId]);
            $transactions = $tStmt->fetchAll();

            $pStmt = $pdo->prepare("SELECT * FROM products WHERE shop_id = ? ORDER BY id ASC");
            $pStmt->execute([$shopId]);
            $products = $pStmt->fetchAll();

            $mStmt = $pdo->prepare("SELECT * FROM mandi_alerts WHERE shop_id = ? ORDER BY id ASC");
            $mStmt->execute([$shopId]);
            $mandiAlerts = $mStmt->fetchAll();

            $settings = $shopData ?: [];
            unset($settings['pin']);
            unset($settings['password']);

            $backupData = [
                'version' => '2.5-isolated-store',
                'backup_type' => 'INDIVIDUAL_STORE_BACKUP',
                'is_platform_backup' => false,
                'timestamp' => date('c'),
                'shop_id' => $shopId,
                'shop_name' => $settings['shop_name'] ?? ('Store_' . $shopId),
                'data' => [
                    'customers' => $customers,
                    'transactions' => $transactions,
                    'products' => $products,
                    'settings' => $settings,
                    'mandi_alerts' => $mandiAlerts
                ]
            ];

            $today = date('Y-m-d');
            $safeShop = preg_replace('/[^a-zA-Z0-9_\x{0900}-\x{097F}]/u', '_', $settings['shop_name'] ?? ('Store_' . $shopId));
            $filename = "STORE_BACKUP_{$safeShop}_ID{$shopId}_{$today}.json";
            header('Content-Type: application/json; charset=utf-8');
            header("Content-Disposition: attachment; filename=\"{$filename}\"");
            echo json_encode($backupData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'restore' && $method === 'POST') {
            $backup = getJsonInput();
            if (empty($backup) || empty($backup['data'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'अमान्य बैकअप फाइल संरचना']);
                exit;
            }

            $data = $backup['data'];
            $customers = $data['customers'] ?? [];
            $transactions = $data['transactions'] ?? [];
            $products = $data['products'] ?? [];
            $mandiAlerts = $data['mandi_alerts'] ?? [];

            $pdo->beginTransaction();
            try {
                // Wipe only THIS shop's records!
                $pdo->prepare("DELETE FROM transactions WHERE shop_id = ?")->execute([$shopId]);
                $pdo->prepare("DELETE FROM customers WHERE shop_id = ?")->execute([$shopId]);
                $pdo->prepare("DELETE FROM products WHERE shop_id = ?")->execute([$shopId]);
                $pdo->prepare("DELETE FROM mandi_alerts WHERE shop_id = ?")->execute([$shopId]);

                $cStmt = $pdo->prepare("
                    INSERT INTO customers (id, shop_id, name, phone, address, due_date, credit_limit, credit_period_days)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                foreach ($customers as $c) {
                    $cStmt->execute([
                        $c['id'], $shopId, $c['name'], $c['phone'] ?? '', $c['address'] ?? '',
                        $c['due_date'] ?? null, $c['credit_limit'] ?? 5000, $c['credit_period_days'] ?? 15
                    ]);
                }

                $tStmt = $pdo->prepare("
                    INSERT INTO transactions (id, shop_id, customer_id, type, amount, notes, bill_image, date, voice_recorded, is_deleted, deleted_at, deleted_reason, deleted_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                foreach ($transactions as $t) {
                    $tStmt->execute([
                        $t['id'], $shopId, $t['customer_id'], $t['type'], $t['amount'],
                        $t['notes'] ?? '', $t['bill_image'] ?? null, $t['date'],
                        !empty($t['voice_recorded']) ? 1 : 0, !empty($t['is_deleted']) ? 1 : 0,
                        $t['deleted_at'] ?? null, $t['deleted_reason'] ?? null, $t['deleted_by'] ?? null
                    ]);
                }

                $pStmt = $pdo->prepare("
                    INSERT INTO products (id, shop_id, name, category, unit, purchase_price, selling_price, wholesale_price, stock_quantity, min_stock_alert, barcode)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                foreach ($products as $p) {
                    $pStmt->execute([
                        $p['id'], $shopId, $p['name'], $p['category'] ?? 'General', $p['unit'] ?? 'पैकेट',
                        $p['purchase_price'], $p['selling_price'], $p['wholesale_price'] ?? 0,
                        $p['stock_quantity'] ?? 0, $p['min_stock_alert'] ?? 0, $p['barcode'] ?? ''
                    ]);
                }

                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'दुकान का डेटा सफलतापूर्वक रिस्टोर हो गया!']);
            } catch (\Exception $e) {
                $pdo->rollBack();
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'रिस्टोर विफल: ' . $e->getMessage()]);
            }
            exit;
        }

        if ($action === 'sync-gdrive' && $method === 'POST') {
            $input = getJsonInput();
            $webhookUrl = trim($input['webhook_url'] ?? '');

            if (empty($webhookUrl)) {
                $st = $pdo->prepare("SELECT gdrive_webhook_url FROM shop_settings WHERE id = ?");
                $st->execute([$shopId]);
                $row = $st->fetch();
                $webhookUrl = trim($row['gdrive_webhook_url'] ?? '');
            }

            if (empty($webhookUrl)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'कृपया पहले Google Drive Webhook URL डालें']);
                exit;
            }

            $cStmt = $pdo->prepare("SELECT * FROM customers WHERE shop_id = ? ORDER BY id ASC");
            $cStmt->execute([$shopId]);
            $tStmt = $pdo->prepare("SELECT * FROM transactions WHERE shop_id = ? ORDER BY id ASC");
            $tStmt->execute([$shopId]);
            $pStmt = $pdo->prepare("SELECT * FROM products WHERE shop_id = ? ORDER BY id ASC");
            $pStmt->execute([$shopId]);
            $sStmt = $pdo->prepare("SELECT shop_name, owner_name, phone, address, upi_id FROM shop_settings WHERE id = ?");
            $sStmt->execute([$shopId]);

            $shopSettings = $sStmt->fetch() ?: [];
            $backupData = [
                'version' => '2.5-isolated-store',
                'backup_type' => 'INDIVIDUAL_STORE_BACKUP',
                'is_platform_backup' => false,
                'timestamp' => date('c'),
                'shop_id' => $shopId,
                'shop_name' => $shopSettings['shop_name'] ?? ('Store_' . $shopId),
                'data' => [
                    'customers' => $cStmt->fetchAll(),
                    'transactions' => $tStmt->fetchAll(),
                    'products' => $pStmt->fetchAll(),
                    'settings' => $shopSettings
                ]
            ];

            $ch = curl_init($webhookUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($backupData));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            $timeStr = date('h:i A (d/m/Y)');
            if ($httpCode >= 200 && $httpCode < 400) {
                $pdo->prepare("UPDATE shop_settings SET last_backup_time = ?, last_backup_status = 'सफल (Success)' WHERE id = ?")->execute([$timeStr, $shopId]);
                echo json_encode(['success' => true, 'time' => $timeStr]);
            } else {
                $err = $curlError ?: "Google Drive ने एरर दिया (HTTP {$httpCode})";
                $pdo->prepare("UPDATE shop_settings SET last_backup_status = ? WHERE id = ?")->execute(["विफल ({$httpCode})", $shopId]);
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => $err]);
            }
            exit;
        }
    }

    // ========================================================
    // 8. /api/ai/parse-voice (Smart Voice Parser: Udhaar, Jama & Products)
    // ========================================================
    if ($resource === 'ai' && ($segments[1] ?? '') === 'parse-voice') {
        $shopId = getRequestShopId($pdo, false);
        $input = getJsonInput();
        $rawText = mb_substr(trim((string)($input['speechText'] ?? '')), 0, 500, 'UTF-8');
        if (empty($rawText)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Voice speech text is required']);
            exit;
        }

        // Normalize Devanagari numerals (०-९) to ASCII digits (0-9)
        $devanagari = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
        $asciiDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        $normalizedText = str_replace($devanagari, $asciiDigits, $rawText);

        // Normalize Hindi number words
        $wordMap = [
            '/(डेढ़\s*हजार|डेढ़\s*हज़ार)/ui' => '1500',
            '/(ढाई\s*हजार|ढाई\s*हज़ार)/ui' => '2500',
            '/(डेढ़\s*सौ)/ui' => '150',
            '/(ढाई\s*सौ)/ui' => '250',
            '/(साढ़े\s*तीन\s*सौ)/ui' => '350',
            '/(साढ़े\s*चार\s*सौ)/ui' => '450',
            '/(साढ़े\s*पाँच\s*सौ|साढ़े\s*पांच\s*सौ)/ui' => '550',
            '/((?:एक|1)\s*(?:हजार|हज़ार))/ui' => '1000',
            '/((?:दो|2)\s*(?:हजार|हज़ार))/ui' => '2000',
            '/((?:तीन|3)\s*(?:हजार|हज़ार))/ui' => '3000',
            '/((?:चार|4)\s*(?:हजार|हज़ार))/ui' => '4000',
            '/((?:पांच|पाँच|5)\s*(?:हजार|हज़ार))/ui' => '5000',
            '/((?:दस|10)\s*(?:हजार|हज़ार))/ui' => '10000',
            '/((?:एक|1)\s*सौ)/ui' => '100',
            '/((?:दो|2)\s*सौ)/ui' => '200',
            '/((?:तीन|3)\s*सौ)/ui' => '300',
            '/((?:चार|4)\s*सौ)/ui' => '400',
            '/((?:पांच|पाँच|5)\s*सौ)/ui' => '500',
            '/((?:छह|छः|6)\s*सौ)/ui' => '600',
            '/((?:सात|7)\s*सौ)/ui' => '700',
            '/((?:आठ|8)\s*सौ)/ui' => '800',
            '/((?:नौ|9)\s*सौ)/ui' => '900',
            '/((?:हजार|हज़ार))/ui' => '1000',
            '/(\bसौ\b)/ui' => '100',
            '/(\bपचहत्तर\b)/ui' => '75',
            '/(\bपचास\b)/ui' => '50',
            '/(\bचालीस\b)/ui' => '40',
            '/(\bतीस\b)/ui' => '30',
            '/(\bपच्चीस\b)/ui' => '25',
            '/(\bबीस\b)/ui' => '20',
            '/(\bसाठ\b)/ui' => '60',
            '/(\bसत्तर\b)/ui' => '70',
            '/(\bअस्सी\b)/ui' => '80',
            '/(\bनब्बे\b)/ui' => '90',
            '/(\bदस\b)/ui' => '10'
        ];
        foreach ($wordMap as $pattern => $replacement) {
            $normalizedText = preg_replace($pattern, $replacement, $normalizedText);
        }

        $text = mb_strtolower($normalizedText, 'UTF-8');

        // Fetch store customers & products for intelligent matching
        $custStmt = $pdo->prepare("SELECT id, name FROM customers WHERE shop_id = ?");
        $custStmt->execute([$shopId]);
        $allCust = $custStmt->fetchAll();

        $prodStmt = $pdo->prepare("SELECT id, name, category, unit, purchase_price, selling_price, stock_quantity FROM products WHERE shop_id = ?");
        $prodStmt->execute([$shopId]);
        $allProds = $prodStmt->fetchAll();

        // 1. Mandi Alert check
        if (preg_match('/(मंडी|mandi|भाव बढ़|भाव घट|रेट बढ़|रेट घट|दाम बढ़|दाम घट|तेज हो गया|मंदा हो गया)/ui', $text)) {
            preg_match_all('/\d+(\.\d+)?/', $text, $numMatches);
            $numbers = !empty($numMatches[0]) ? array_map('floatval', $numMatches[0]) : [];
            $newPrice = $numbers[0] ?? 50;
            $oldPrice = 0;
            $wholesalePrice = 0;
            if (count($numbers) >= 2) {
                if (preg_match('/(से|se|pehle|पहले)/ui', $text)) {
                    $oldPrice = $numbers[0];
                    $newPrice = $numbers[1];
                } else {
                    $wholesalePrice = $numbers[0];
                    $newPrice = $numbers[1];
                }
            }
            $unit = preg_match('/(किलो|kg)/ui', $text) ? 'किलो' :
                   (preg_match('/(लीटर|litre)/ui', $text) ? 'लीटर' :
                   (preg_match('/(बोरी|bori)/ui', $text) ? 'बोरी' : 'किलो'));

            $cleanProd = preg_replace('/(\d+(\.\d+)?|मंडी|mandi|में|का|की|भाव|रेट|दाम|बढ़|घट|तेज|मंदा|हो|गया|गई|है|रुपये|rupaye|प्रति|नया|स्टाफ|को|बताओ|अलर्ट|update)/ui', '', $rawText);
            $cleanProd = trim($cleanProd);
            if (empty($cleanProd)) $cleanProd = 'किराना सामान';

            echo json_encode([
                'success' => true,
                'data' => [
                    'intent' => 'mandi_alert',
                    'productName' => $cleanProd,
                    'oldPrice' => $oldPrice,
                    'newPrice' => $newPrice,
                    'wholesalePrice' => $wholesalePrice,
                    'unit' => $unit,
                    'notes' => $rawText,
                    'confidence' => 0.95,
                    'confirmationSpeech' => "मंडी अलर्ट: {$cleanProd} का नया भाव ₹{$newPrice} दर्ज कर दिया गया है"
                ]
            ]);
            exit;
        }

        // 2. Detect Language: Spoken English vs Hindi
        $isSpokenEnglish = !preg_match('/[\x{0900}-\x{097F}]/u', $rawText) && preg_match('/^[a-zA-Z0-9\s.,₹!?"\'-]+$/', $rawText);

        // 3. Detect Product Intent vs Customer Transaction
        $hasUdhaarKeywords = preg_match('/(उधार|udhar|udhaar|क्रेडिट|credit|lent|on credit|बाकी|खाते में लिख|लिख लो|लिख ले|लिख देना|लिख दो|को दे दो|को दिया|को दिए|का बाकी|का उधार)/ui', $text);
        $hasJamaKeywords = preg_match('/(जमा|jama|paid|payment|pay|received|receive|got|collected|settled|पेमेंट|भुगतान|वसूल|चुकाया|खाता चुकता|ने दिए|ने दिया|ने जमा|से मिला|से मिले|से आया|से आए|से ले लिया|दे गया|दे गए|कैश मिला|पेमेंट आया|फोनपे|phonepe|gpay|गूगल पे|पेटीएम|paytm)/ui', $text);
        $hasInventoryExplicitKeywords = preg_match('/(खरीद|kharid|purchase|cost|बिक्री|bikri|selling|mrp|एमआरपी|थोक भाव|थोक रेट|बिक्री रेट|स्टॉक में जोड़ो|स्टॉक जोड़ो|स्टॉक बढ़ाओ|स्टॉक करो|add to stock|add stock|update stock|नया प्रोडक्ट|नया सामान)/ui', $text);

        $matchedProduct = null;
        foreach ($allProds as $p) {
            $pName = mb_strtolower(trim($p['name']), 'UTF-8');
            $tokens = preg_split('/[\s\(\)]+/u', $pName);
            foreach ($tokens as $tok) {
                if (mb_strlen($tok) >= 3 && mb_stripos($text, $tok) !== false) {
                    $matchedProduct = $p;
                    break 2;
                }
            }
        }

        $isProductIntent = !$hasUdhaarKeywords && !$hasJamaKeywords && (
            $hasInventoryExplicitKeywords ||
            (preg_match('/(स्टॉक|stock)/ui', $text) && preg_match('/(जोड़ो|बढ़ाओ|update|add)/ui', $text))
        );

        // ----------------------------------------------------
        // CASE A: PRODUCT INVENTORY ENTRY
        // ----------------------------------------------------
        if ($isProductIntent) {
            $unit = $isSpokenEnglish ? 'Packet' : 'पैकेट';
            if (preg_match('/(किलो|किलोग्राम|kg|kilo|kilos)/ui', $text)) $unit = $isSpokenEnglish ? 'Kg' : 'किलो';
            elseif (preg_match('/(लीटर|लीटरों|ltr|liter|liters|litre|litres)/ui', $text)) $unit = $isSpokenEnglish ? 'Liter' : 'लीटर';
            elseif (preg_match('/(पीस|pieces|pcs|piece)/ui', $text)) $unit = $isSpokenEnglish ? 'Piece' : 'पीस';
            elseif (preg_match('/(बोरी|bori)/ui', $text)) $unit = $isSpokenEnglish ? 'Bori' : 'बोरी';
            elseif (preg_match('/(कार्टन|पेटी|carton|peti|box|boxes)/ui', $text)) $unit = $isSpokenEnglish ? 'Box' : 'कार्टन';
            elseif (preg_match('/(दर्जन|dozen)/ui', $text)) $unit = $isSpokenEnglish ? 'Dozen' : 'दर्जन';
            elseif (preg_match('/(बोतल|bottle|bottles)/ui', $text)) $unit = $isSpokenEnglish ? 'Bottle' : 'बोतल';
            elseif (preg_match('/(ग्राम|gm|gram|grams)/ui', $text)) $unit = $isSpokenEnglish ? 'Gram' : 'ग्राम';
            elseif ($matchedProduct && !empty($matchedProduct['unit'])) $unit = $matchedProduct['unit'];

            $quantity = 10;
            if (preg_match('/(\d+(\.\d+)?)\s*(?:पैकेट|packet|packets|pkt|pkts|किलो|kg|kilo|लीटर|ltr|liter|liters|litre|litres|पीस|pcs|piece|pieces|बोरी|bori|कार्टन|carton|पेटी|peti|दर्जन|dozen|बोतल|bottle|ग्राम|gm|box|boxes)/ui', $text, $qM)) {
                $quantity = (float)$qM[1];
            } elseif (preg_match('/(?:स्टॉक|स्टॉक में|जोड़ो|जोड़ दो|add|update)\s*(\d+(\.\d+)?)/ui', $text, $qM2)) {
                $quantity = (float)$qM2[1];
            } elseif (preg_match('/(\d+(\.\d+)?)\s*(?:स्टॉक|जोड़ो|जोड़ दो|add|stock)/ui', $text, $qM3)) {
                $quantity = (float)$qM3[1];
            }

            $purchasePrice = 0;
            $sellingPrice = 0;
            if (preg_match('/(?:खरीद|kharid|buy|buying|purchase|cost)\s*(?:रेट|मूल्य|भाव|rate|price|₹|rs\.?|रुपये)?\s*(\d+(\.\d+)?)/ui', $text, $bM)) {
                $purchasePrice = (float)$bM[1];
            }
            if (preg_match('/(?:बिक्री|bikri|sell|selling|sale|mrp|एमआरपी|बेचेंगे)\s*(?:रेट|मूल्य|भाव|rate|price|₹|rs\.?|रुपये)?\s*(\d+(\.\d+)?)/ui', $text, $sM)) {
                $sellingPrice = (float)$sM[1];
            }

            if ($purchasePrice === 0 && $sellingPrice === 0) {
                preg_match_all('/\d+(\.\d+)?/', $text, $allNums);
                $candidates = !empty($allNums[0]) ? array_map('floatval', $allNums[0]) : [];
                $priceCandidates = array_values(array_filter($candidates, function($n) use ($quantity) { return $n != $quantity; }));
                if (count($priceCandidates) >= 2) {
                    $purchasePrice = $priceCandidates[0];
                    $sellingPrice = $priceCandidates[1];
                } elseif (count($priceCandidates) === 1) {
                    $single = $priceCandidates[0];
                    if (preg_match('/(खरीद|kharid|buy|buying)/ui', $text)) {
                        $purchasePrice = $single;
                        $sellingPrice = round($single * 1.15);
                    } else {
                        $sellingPrice = $single;
                        $purchasePrice = round($single * 0.85);
                    }
                }
            }

            if ($matchedProduct) {
                if ($purchasePrice === 0) $purchasePrice = (float)$matchedProduct['purchase_price'];
                if ($sellingPrice === 0) $sellingPrice = (float)$matchedProduct['selling_price'];
            }
            if ($purchasePrice === 0 && $sellingPrice === 0) {
                $purchasePrice = 50;
                $sellingPrice = 60;
            } elseif ($sellingPrice === 0 && $purchasePrice > 0) {
                $sellingPrice = round($purchasePrice * 1.2);
            } elseif ($purchasePrice === 0 && $sellingPrice > 0) {
                $purchasePrice = round($sellingPrice * 0.85);
            }

            $prodName = '';
            if ($matchedProduct) {
                $prodName = $matchedProduct['name'];
            } else {
                $cleanedProd = preg_replace('/(\b\d+(\.\d+)?\b|₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?|\b(?:packets|packet|pkts|pkt|kilos|kilo|kg|litres|litre|liters|liter|ltr|pieces|piece|pcs|bori|cartons|carton|peti|dozens|dozen|bottles|bottle|grams|gram|gm|boxes|box|pouches|pouch)\b|पैकेटों|पैकेट|किलोग्राम|किलो|लीटरों|लीटर|पीस|बोरी|कार्टन|पेटी|दर्जन|बोतल|ग्राम|डब्बा|डिब्बा|पाउच|\b(?:buying|buy|purchase|cost|selling|sale|sell|mrp|price|rate|at)\b|खरीद|kharid|बिक्री|bikri|एमआरपी|बेचेंगे|रेट|भाव|कीमत|\b(?:add\s+to\s+stock|add\s+stock|add|update|stock|item|product|new)\b|स्टॉक\s*में\s*जोड़ो|स्टॉक\s*जोड़ो|स्टॉक|जोड़ो|जोड़\s*दो|ऐड\s*करो|करो|कर\s*देना|डालो|डाल\s*दो|नया|सामान|प्रोडक्ट|आइटम|\b(?:of|in|to|the|and|for)\b|में|का|की|के|और|है|था|को|पर)/ui', '', $rawText);
                $prodName = trim($cleanedProd);
                if (empty($prodName) || mb_strlen($prodName) < 2) {
                    $prodName = $isSpokenEnglish ? 'New Product' : 'नया सामान';
                } elseif ($isSpokenEnglish) {
                    $prodName = ucwords(strtolower($prodName));
                }
            }

            $category = $matchedProduct['category'] ?? 'सामान्य किराना';
            if (preg_match('/(तेल|रिफाइंड|सरसों|घी|डालडा|oil|ghee)/ui', $prodName)) $category = 'खाद्य तेल व घी';
            elseif (preg_match('/(चीनी|गुड़|शक्कर|मीठा|sugar)/ui', $prodName)) $category = 'चीनी व गुड़';
            elseif (preg_match('/(आटा|चावल|दाल|चना|मैदा|सूजी|बेसन|flour|rice|pulse|wheat)/ui', $prodName)) $category = 'अनाज व दालें';
            elseif (preg_match('/(मसाला|मिर्च|हल्दी|धनिया|जीरा|नमक|spice|salt)/ui', $prodName)) $category = 'मसाले';
            elseif (preg_match('/(साबुन|सर्फ|शैम्पू|पेस्ट|ब्रश|डिटर्जेंट|कोलगेट|soap|shampoo|paste)/ui', $prodName)) $category = 'प्रसाधन व सफाई';
            elseif (preg_match('/(बिस्कुट|मैगी|नूडल्स|नमकीन|चिप्स|चॉकलेट|biscuit|maggi|chips)/ui', $prodName)) $category = 'स्नैक्स व बिस्कुट';
            elseif (preg_match('/(चाय|कॉफी|दूध|कोल्डड्रिंक|पानी|tea|coffee|milk)/ui', $prodName)) $category = 'पेय पदार्थ';

            $confirmSpeech = $isSpokenEnglish
                ? ($matchedProduct
                    ? "{$prodName} stock {$quantity} {$unit} ready. Say 'yes' or 'confirm' to update."
                    : "{$prodName} {$quantity} {$unit}, buy ₹{$purchasePrice} and sell ₹{$sellingPrice}. Say 'yes' or 'confirm' to save.")
                : ($matchedProduct
                    ? "{$prodName} का नया स्टॉक {$quantity} {$unit} तैयार है। क्या इसे जोड़ दूँ? बोलें 'हाँ' या 'कन्फर्म'"
                    : "{$prodName} ({$quantity} {$unit}) खरीद ₹{$purchasePrice} व बिक्री ₹{$sellingPrice} तैयार है। क्या इसे सेव कर दूँ? बोलें 'हाँ' या 'कन्फर्म'");

            echo json_encode([
                'success' => true,
                'data' => [
                    'intent' => 'product',
                    'name' => $prodName,
                    'productName' => $prodName,
                    'category' => $category,
                    'unit' => $unit,
                    'purchasePrice' => $purchasePrice,
                    'sellingPrice' => $sellingPrice,
                    'quantity' => $quantity,
                    'confidence' => 0.95,
                    'confirmationSpeech' => $confirmSpeech
                ]
            ]);
            exit;
        }

        // ----------------------------------------------------
        // CASE B: CUSTOMER LEDGER TRANSACTION (UDHAAR / JAMA)
        // ----------------------------------------------------
        $textWithoutDays = preg_replace('/(\d+)\s*(दिन|din|days|mahina|mahine|महीने|महीना|हफ्ता|hafta|week)/ui', ' ', $text);
        $amount = 0;
        if (preg_match('/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)\s*(\d+(\.\d+)?)/ui', $textWithoutDays, $rM)) {
            $amount = (float)$rM[1];
        } elseif (preg_match('/(\d+(\.\d+)?)\s*(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/ui', $textWithoutDays, $rM2)) {
            $amount = (float)$rM2[1];
        } elseif (preg_match('/(\d+(\.\d+)?)\s*(?:उधार|udhar|udhaar|जमा|jama|पेमेंट|paid|क्रेडिट|credit|लिखो|लिख लो|लिख दे|बाकी)/ui', $textWithoutDays, $rM3)) {
            $amount = (float)$rM3[1];
        } else {
            $cleanWithoutQty = preg_replace('/(\d+(\.\d+)?)\s*(?:पैकेट|packet|packets|pkt|pkts|किलो|किलोग्राम|kg|kilo|kilos|लीटर|ltr|litre|liter|पीस|piece|pieces|pcs|बोरी|bori|कार्टन|carton|पेटी|दर्जन|dozen|बोतल|bottle|ग्राम|gm)/ui', ' ', $textWithoutDays);
            preg_match_all('/\d+(\.\d+)?/', $cleanWithoutQty, $rMAll);
            if (!empty($rMAll[0])) {
                $amount = (float)end($rMAll[0]);
            }
        }

        if ($amount === 0) {
            if (preg_match('/(डेढ़ सौ|dedh sau)/ui', $text)) $amount = 150;
            elseif (preg_match('/(ढाई सौ|dhai sau)/ui', $text)) $amount = 250;
            elseif (preg_match('/(साढ़े तीन सौ)/ui', $text)) $amount = 350;
            elseif (preg_match('/(साढ़े चार सौ)/ui', $text)) $amount = 450;
            elseif (preg_match('/(साढ़े पांच सौ|साढ़े पाँच सौ)/ui', $text)) $amount = 550;
            elseif (preg_match('/(हजार|हज़ार|hazar|thousand)/ui', $text)) $amount = 1000;
            elseif (preg_match('/(दो हजार|दो हज़ार)/ui', $text)) $amount = 2000;
            elseif (preg_match('/(सौ|sau|hundred)/ui', $text)) $amount = 100;
        }

        // Disambiguate Udhaar vs Jama (Bilingual)
        $isExplicitJama = preg_match('/(जमा|जमा किया|जमा कर दो|जमा लिखो|जमा करो|jama|paid|payment|pay|received|receive|got|collected|settled|पेमेंट|भुगतान|वसूल|चुकाया|खाता चुकता)/ui', $text);
        $isCustomerGave = preg_match('/(ने.+?(?:दिए|दिया|जमा किया|पेमेंट किया)|ने\s*(\d+)?\s*(?:₹|रुपये)?\s*(?:दिए|दिया|जमा)|से मिला|से मिले|से आया|से आए|से ले लिया|दे गया|दे गए|कैश मिला|पेमेंट आया|received\s+from|got\s+from|paid\s+by|from\s+[a-zA-Z\x{0900}-\x{097F}]+\s*(?:paid|gave)|^[a-zA-Z\x{0900}-\x{097F}\s]+\s+(?:paid|gave|deposited)\s+\d+)/ui', $text);
        $isOnlinePayment = preg_match('/(phonepe|फोनपे|gpay|गूगल पे|paytm|पेटीएम|ऑनलाइन जमा|online payment|online paid)/ui', $text);

        $isExplicitUdhaar = preg_match('/(उधार|उधार दिया|उधार दिए|उधार लिखो|उधार में|udhar|udhaar|क्रेडिट|credit|debit|lent|खाते में लिखो|लिख लो|लिख ले|लिख देना|on credit)/ui', $text);
        $isShopkeeperGave = preg_match('/(को.+?(?:दिए|दिया|उधार दिया)|को\s*(\d+)?\s*(?:₹|रुपये)?\s*(?:दिए|दिया|उधार)|का बाकी|का उधार|give\s+.+?\s*(?:to|for)|credit\s+to|credit\s+for|lent\s+to|debit\s+to)/ui', $text);

        $txType = 'udhaar';
        if ($isExplicitJama || $isCustomerGave || $isOnlinePayment) {
            if ($isExplicitUdhaar && !$isCustomerGave && !$isExplicitJama) {
                $txType = 'udhaar';
            } else {
                $txType = 'jama';
            }
        } elseif ($isExplicitUdhaar || $isShopkeeperGave) {
            $txType = 'udhaar';
        } else {
            $txType = 'udhaar';
        }

        // Match Customer
        $matchedCust = null;
        $custName = '';
        // Step A: Exact / full name match
        foreach ($allCust as $c) {
            $rawName = trim($c['name'] ?? '');
            if (!empty($rawName) && mb_stripos($text, mb_strtolower($rawName)) !== false) {
                $matchedCust = $c;
                $custName = $rawName;
                break;
            }
        }
        // Step B: First name match
        if (!$matchedCust) {
            foreach ($allCust as $c) {
                $rawName = trim($c['name'] ?? '');
                $parts = preg_split('/[\s\(\)]+/u', $rawName);
                $first = $parts[0] ?? '';
                if (mb_strlen($first) >= 2 && mb_stripos($text, mb_strtolower($first)) !== false) {
                    $matchedCust = $c;
                    $custName = $rawName;
                    break;
                }
            }
        }
        // Step C: Token match
        if (!$matchedCust) {
            foreach ($allCust as $c) {
                $rawName = trim($c['name'] ?? '');
                $tokens = preg_split('/[\s\(\)]+/u', $rawName);
                foreach ($tokens as $tok) {
                    if (mb_strlen($tok) >= 3 && mb_stripos($text, $tok) !== false) {
                        $matchedCust = $c;
                        $custName = $rawName;
                        break 2;
                    }
                }
            }
        }

        if (empty($custName)) {
            // Pattern 1: English preposition "to <name>", "for <name>", "from <name>", "by <name>"
            if (preg_match('/(?:to|for|from|by)\s+([a-zA-Z\x{0900}-\x{097F}]+(?:\s+[a-zA-Z\x{0900}-\x{097F}]+)?)/ui', $text, $ePrepM)) {
                $cand = trim($ePrepM[1]);
                if (!preg_match('/^(cash|online|phonepe|gpay|paytm|udhar|jama|credit|store|shop|me|us|account)$/i', $cand)) {
                    $custName = $isSpokenEnglish ? ucwords(strtolower($cand)) : $cand;
                }
            }
        }
        if (empty($custName)) {
            // Pattern 2: English subject "<name> paid ...", "<name> gave ..."
            if (preg_match('/^([a-zA-Z\x{0900}-\x{097F}]+(?:\s+[a-zA-Z\x{0900}-\x{097F}]+)?)\s+(?:paid|gave|received|took|has paid)/ui', $text, $eSubjM)) {
                $cand = trim($eSubjM[1]);
                if (!preg_match('/^(give|add|please|record|we|i|customer)$/i', $cand)) {
                    $custName = $isSpokenEnglish ? ucwords(strtolower($cand)) : $cand;
                }
            }
        }
        if (empty($custName)) {
            // Pattern 3: Hindi prepositions "<name> को", "<name> ने", etc.
            $cleanedTokens = preg_split('/(?:\s+को|\s+ने|\s+से|\s+का|\s+की|\s+udhar|\s+udhaar|\s+jama|\s+जमा|\s+उधार|\s+\d+)/ui', $rawText);
            if (!empty($cleanedTokens[0])) {
                $possibleName = trim(preg_replace('/[^a-zA-Z\x{0900}-\x{097F}\s]/u', '', $cleanedTokens[0]));
                if (mb_strlen($possibleName) >= 2 && !preg_match('/^(bolkar|bol|voice|add|likh|likho|khata|entry|give|record)$/i', $possibleName)) {
                    $custName = $isSpokenEnglish ? ucwords(strtolower($possibleName)) : $possibleName;
                }
            }
        }
        if (empty($custName)) {
            $cleanedWords = preg_replace('/(\b\d+(\.\d+)?\b|₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?|उधार|उधार दिया|उधार दिए|बाकी|खाते में लिखो|लिख लो|लिख ले|लिख देना|दे दिया|diye|de do|de dijiye|udhar|udhaar|baki|credit|debit|give|given|add|lent|जमा|जमा किया|जमा कर दो|जमा लिखो|पैसा आया|भुगतान|पेमेंट|मिला|आ गया|दे गया|ले लिया|jama|paid|mil gaya|received|receive|phonepe|gpay|paytm|cash|नकद|नगद|को|ने|से|का|की|में|पर|पे|के|to|from|for|by|in|on|at|and|or|the|a|an|is|was|of|राशन|किराना|सामान|बिल|पर्ची)/ui', '', $rawText);
            $custName = trim($cleanedWords);
            if (empty($custName) || mb_strlen($custName) < 2) {
                $custName = $isSpokenEnglish ? 'New Customer' : 'नया ग्राहक';
            } elseif ($isSpokenEnglish) {
                $custName = ucwords(strtolower($custName));
            }
        }

        $noteDesc = $txType === 'udhaar' ? ($isSpokenEnglish ? 'Credit goods' : 'उधार माल') : ($isSpokenEnglish ? 'Payment received' : 'जमा राशि');
        if (preg_match('/(phonepe|फोनपे)/ui', $text)) $noteDesc = 'PhonePe ऑनलाइन भुगतान';
        elseif (preg_match('/(gpay|गूगल पे)/ui', $text)) $noteDesc = 'Google Pay ऑनलाइन भुगतान';
        elseif (preg_match('/(paytm|पेटीएम)/ui', $text)) $noteDesc = 'Paytm ऑनलाइन भुगतान';
        elseif (preg_match('/(कैश|नकद|नगद|cash)/ui', $text)) $noteDesc = $isSpokenEnglish ? 'Cash payment' : 'नकद कैश भुगतान';
        elseif (preg_match('/(राशन|किराना)/ui', $text)) $noteDesc = $isSpokenEnglish ? 'Grocery items' : 'राशन सामान';
        elseif (preg_match('/(तेल|oil)/ui', $text)) $noteDesc = $isSpokenEnglish ? 'Oil grocery' : 'तेल किराना';
        elseif (preg_match('/(चीनी|sugar)/ui', $text)) $noteDesc = $isSpokenEnglish ? 'Sugar grocery' : 'चीनी किराना';
        elseif (preg_match('/(आटा|flour)/ui', $text)) $noteDesc = $isSpokenEnglish ? 'Flour grocery' : 'आटा किराना';
        elseif (preg_match('/(दाल|pulse)/ui', $text)) $noteDesc = $isSpokenEnglish ? 'Pulse grocery' : 'दाल किराना';

        $creditPeriodDays = 15;
        if (preg_match('/(\d+)\s*(दिन|din|days)/ui', $text, $dM)) {
            $creditPeriodDays = (int)$dM[1];
        } elseif (preg_match('/(महीना|महीने|mahina|mahine|1 month)/ui', $text)) {
            $creditPeriodDays = 30;
        } elseif (preg_match('/(हफ्ता|हफ़्ते|hafta|week)/ui', $text)) {
            $creditPeriodDays = 7;
        }

        $finalAmount = $amount > 0 ? $amount : 100;
        $confirmMsg = $isSpokenEnglish
            ? ($txType === 'udhaar'
                ? "Adding credit of ₹{$finalAmount} for {$custName}. Say 'yes' or 'confirm' to save."
                : "Payment of ₹{$finalAmount} received from {$custName}. Say 'yes' or 'confirm' to save.")
            : ($txType === 'udhaar'
                ? "{$custName} के खाते में ₹{$finalAmount} उधार लिखा जा रहा है। क्या मैं इसे सेव कर दूँ? बोलें 'हाँ' या 'कन्फर्म'"
                : "{$custName} से ₹{$finalAmount} जमा प्राप्त हुआ है। क्या मैं इसे सेव कर दूँ? बोलें 'हाँ' या 'कन्फर्म'");

        echo json_encode([
            'success' => true,
            'data' => [
                'intent' => 'transaction',
                'customerName' => $custName,
                'customer' => $matchedCust,
                'type' => $txType,
                'amount' => $finalAmount,
                'creditPeriodDays' => $txType === 'udhaar' ? $creditPeriodDays : null,
                'notes' => $noteDesc,
                'confidence' => 0.95,
                'confirmationSpeech' => $confirmMsg
            ]
        ]);
        exit;
    }

    // ========================================================
    // 9. /api/mandi/alerts (Scoped by shop_id)
    // ========================================================
    if ($resource === 'mandi' && ($segments[1] ?? '') === 'alerts') {
        $shopId = getRequestShopId($pdo, false);
        if ($method === 'GET') {
            $stmt = $pdo->prepare("SELECT * FROM mandi_alerts WHERE shop_id = ? ORDER BY id DESC LIMIT 50");
            $stmt->execute([$shopId]);
            $alerts = $stmt->fetchAll();
            echo json_encode(['success' => true, 'data' => $alerts]);
            exit;
        }
        if ($method === 'POST') {
            $shopId = getRequestShopId($pdo, true);
            $input = getJsonInput();
            $stmt = $pdo->prepare("INSERT INTO mandi_alerts (shop_id, product_name, old_price, new_price, wholesale_price, unit, notes, sender_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $shopId,
                $input['product_name'] ?? '',
                (float)($input['old_price'] ?? 0),
                (float)($input['new_price'] ?? 0),
                (float)($input['wholesale_price'] ?? 0),
                $input['unit'] ?? 'पैकेट',
                $input['notes'] ?? null,
                $input['sender_name'] ?? 'दुकानदार'
            ]);
            $newMandiId = (int)$pdo->lastInsertId();
            triggerStoreAutoBackupOnEntryPHP($pdo, $shopId);
            echo json_encode(['success' => true, 'id' => $newMandiId]);
            exit;
        }
    }

    // ========================================================
    // 10. /api/passbook (Customer Secure Personal Passbook View)
    // ========================================================
    if ($resource === 'passbook' && $method === 'GET') {
        $token = trim($_GET['token'] ?? '');
        if (empty($token)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'पासबुक टोकन आवश्यक है']);
            exit;
        }

        $customers = $pdo->query("SELECT * FROM customers")->fetchAll();
        $matchedCustomer = null;

        foreach ($customers as $c) {
            $expectedToken = getCustomerPassbookToken($c['id'], $c['phone']);
            if (hash_equals($expectedToken, $token)) {
                $matchedCustomer = $c;
                break;
            }
        }

        if (!$matchedCustomer) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'अमान्य पासबुक लिंक या ग्राहक नहीं मिला']);
            exit;
        }

        $custShopId = (int)$matchedCustomer['shop_id'];

        // Fetch transactions for this customer ONLY in their shop
        $tStmt = $pdo->prepare("SELECT id, customer_id, type, amount, notes, bill_image, date, is_deleted, deleted_at, deleted_reason, created_at FROM transactions WHERE customer_id = ? AND shop_id = ? ORDER BY date ASC, id ASC");
        $tStmt->execute([$matchedCustomer['id'], $custShopId]);
        $transactions = $tStmt->fetchAll();

        // Shop public details for this customer's shop
        $sStmt = $pdo->prepare("SELECT shop_name, owner_name, phone, address, upi_id, logo FROM shop_settings WHERE id = ?");
        $sStmt->execute([$custShopId]);
        $settings = $sStmt->fetch() ?: [];

        $totalUdhaar = 0;
        $totalJama = 0;
        $running = 0;
        $txList = [];
        foreach ($transactions as $t) {
            $isDel = !empty($t['is_deleted']);
            $amt = (float)$t['amount'];
            if (!$isDel) {
                if ($t['type'] === 'udhaar') {
                    $totalUdhaar += $amt;
                    $running += $amt;
                } else {
                    $totalJama += $amt;
                    $running -= $amt;
                }
            }
            $t['running_balance'] = $running;
            $txList[] = $t;
        }

        echo json_encode([
            'success' => true,
            'shop' => [
                'shop_name' => $settings['shop_name'] ?? 'दुकान',
                'owner_name' => $settings['owner_name'] ?? 'दुकानदार',
                'phone' => $settings['phone'] ?? '',
                'address' => $settings['address'] ?? '',
                'upi_id' => $settings['upi_id'] ?? '',
                'logo' => $settings['logo'] ?? null
            ],
            'customer' => [
                'id' => (int)$matchedCustomer['id'],
                'name' => $matchedCustomer['name'],
                'phone' => $matchedCustomer['phone'],
                'address' => $matchedCustomer['address'],
                'due_date' => $matchedCustomer['due_date'],
                'credit_limit' => (float)$matchedCustomer['credit_limit'],
                'total_udhaar' => $totalUdhaar,
                'total_jama' => $totalJama,
                'net_balance' => $totalUdhaar - $totalJama
            ],
            'transactions' => $txList
        ]);
        exit;
    }

    // ========================================================
    // 11. /api/admin (Super Admin SaaS Management Portal)
    // ========================================================
    if ($resource === 'admin') {
        $sub = $segments[1] ?? '';
        $input = getJsonInput();

        // 11a. Admin Login: POST /api/admin/login
        if ($sub === 'login' && $method === 'POST') {
            $userOrPhone = trim($input['username'] ?? ($input['phone'] ?? ''));
            $pass = trim((string)($input['password'] ?? ''));

            if (empty($userOrPhone) || empty($pass)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'कृपया यूज़रनेम/मोबाइल नंबर और पासवर्ड दर्ज करें']);
                exit;
            }

            $cleanP = preg_replace('/[^0-9]/', '', $userOrPhone);
            $stmt = $pdo->prepare("SELECT * FROM super_admins WHERE username = ? OR phone = ? OR (LENGTH(?) >= 10 AND phone LIKE ?)");
            $stmt->execute([$userOrPhone, $userOrPhone, $cleanP, '%' . substr($cleanP, -10)]);
            $admin = $stmt->fetch();

            if (!$admin || !verifySecret($pass, $admin['password'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => '❌ गलत व्यवस्थापक क्रेडेंशियल (Invalid Admin Credentials)!']);
                exit;
            }

            // Upgrade password hash to bcrypt if needed
            if (password_needs_rehash($admin['password'], PASSWORD_BCRYPT) || $admin['password'] === $pass) {
                try {
                    $pdo->prepare("UPDATE super_admins SET password = ? WHERE id = ?")->execute([hashSecret($pass), $admin['id']]);
                } catch (\Exception $e) {}
            }

            $token = generateAdminToken($admin['id'], $admin['username']);

            echo json_encode([
                'success' => true,
                'message' => 'सुपर एडमिन लॉगिन सफल!',
                'token' => $token,
                'admin' => [
                    'id' => (int)$admin['id'],
                    'username' => $admin['username'],
                    'name' => $admin['name'] ?? 'Super Admin',
                    'phone' => $admin['phone'],
                    'role' => $admin['role'] ?? 'superadmin'
                ]
            ]);
            exit;
        }

        // 11a-1. Super Admin Forgot Password: Generate OTP & Send Email
        if ($sub === 'forgot-password' && ($segments[2] ?? '') === 'request' && $method === 'POST') {
            $identity = trim($input['identity'] ?? '');
            if (empty($identity)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'कृपया अपना एडमिन यूज़रनेम, ईमेल या मोबाइल नंबर दर्ज करें']);
                exit;
            }

            $cleanP = preg_replace('/[^0-9]/', '', $identity);
            $stmt = $pdo->prepare("SELECT id, username, phone, email, name, role FROM super_admins WHERE username = ? OR email = ? OR phone = ? OR (LENGTH(?) >= 10 AND phone LIKE ?)");
            $stmt->execute([$identity, $identity, $identity, $cleanP, '%' . substr($cleanP, -10)]);
            $admin = $stmt->fetch();

            if (!$admin) {
                // Fallback: check Shop 1 settings
                $s1 = $pdo->query("SELECT phone, email, owner_name FROM shop_settings WHERE id = 1 LIMIT 1")->fetch();
                $s1Phone = preg_replace('/[^0-9]/', '', $s1['phone'] ?? '');
                $isDef = strtolower($identity) === 'admin' ||
                         (!empty($s1['email']) && strtolower($identity) === strtolower($s1['email'])) ||
                         (!empty($s1Phone) && strlen($cleanP) >= 10 && substr($cleanP, -10) === substr($s1Phone, -10));
                if ($isDef) {
                    $admin = [
                        'id' => 1,
                        'username' => 'admin',
                        'name' => $s1['owner_name'] ?? 'Super Admin',
                        'phone' => $s1['phone'] ?? '9999999999',
                        'email' => $s1['email'] ?? 'abhishek3815@gmail.com'
                    ];
                }
            }

            if (!$admin) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => '❌ यह व्यवस्थापक खाता नहीं मिला! कृपया सही यूज़रनेम, ईमेल या मोबाइल नंबर दर्ज करें।']);
                exit;
            }

            $targetEmail = trim($admin['email'] ?? '');
            if (empty($targetEmail) || strpos($targetEmail, '@') === false) {
                $s1 = $pdo->query("SELECT email FROM shop_settings WHERE id = 1 LIMIT 1")->fetch();
                if (!empty($s1['email'])) {
                    $targetEmail = trim($s1['email']);
                }
            }

            if (empty($targetEmail) || strpos($targetEmail, '@') === false) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => '❌ सुपर एडमिन के लिए कोई ईमेल पंजीकृत नहीं है।']);
                exit;
            }

            // Generate 6-digit OTP and store in temporary recovery file
            $otp = (string)random_int(100000, 999999);
            $tokenFile = sys_get_temp_dir() . '/admin_otp_' . md5(strtolower($admin['username'])) . '.json';
            $otpData = [
                'otp' => $otp,
                'expires_at' => time() + 600, // 10 mins
                'admin_id' => (int)$admin['id'],
                'username' => $admin['username'],
                'email' => $targetEmail,
                'attempts' => 0
            ];
            file_put_contents($tokenFile, json_encode($otpData));

            // Mask email
            $parts = explode('@', $targetEmail);
            $namePart = $parts[0];
            $domainPart = $parts[1] ?? 'gmail.com';
            $maskedName = strlen($namePart) > 2 ? substr($namePart, 0, 2) . str_repeat('*', min(5, strlen($namePart) - 2)) : $namePart . '***';
            $maskedEmail = $maskedName . '@' . $domainPart;

            // Send Email via PHP mail()
            $adminName = htmlspecialchars($admin['name'] ?? 'Super Admin', ENT_QUOTES, 'UTF-8');
            $subject = "=?UTF-8?B?" . base64_encode("🛡️ [सुपर एडमिन] पासवर्ड रिकवरी सुरक्षा कोड (OTP): " . $otp) . "?=";
            $htmlBody = "
            <!DOCTYPE html>
            <html>
            <body style='font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b; margin: 0;'>
              <div style='max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 24px;'>
                <div style='text-align: center; margin-bottom: 20px;'>
                  <span style='font-size: 38px;'>🛡️</span>
                  <h2 style='color: #047857; margin: 8px 0 2px 0;'>सुपर एडमिन पोर्टल</h2>
                  <p style='color: #64748b; font-size: 13px; margin: 0;'>पासवर्ड रिकवरी सुरक्षा सत्यापन कोड</p>
                </div>
                <p style='font-size: 14px;'>नमस्ते <b>{$adminName}</b> जी,</p>
                <p style='font-size: 13px; color: #475569;'>सुपर एडमिन पासवर्ड रीसेट करने के लिए आपका 6-अंकों का सुरक्षा कोड (OTP):</p>
                <div style='background: #ecfdf5; border: 2px dashed #059669; border-radius: 12px; padding: 16px; text-align: center; margin: 20px 0;'>
                  <span style='font-size: 34px; font-weight: 900; letter-spacing: 6px; color: #047857; font-family: monospace;'>{$otp}</span>
                </div>
                <p style='font-size: 12px; color: #64748b;'>⏱️ यह कोड 10 मिनट के लिए मान्य है। किसी के साथ साझा न करें।</p>
              </div>
            </body>
            </html>";

            $serverHost = $_SERVER['SERVER_NAME'] ?? 'localhost';
            $headers = "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nFrom: Super Admin Vault <no-reply@{$serverHost}>\r\n";
            @mail($targetEmail, $subject, $htmlBody, $headers);

            echo json_encode([
                'success' => true,
                'message' => "सुरक्षा कोड (OTP) आपके पंजीकृत ईमेल {$maskedEmail} पर भेज दिया गया है!",
                'identity' => $admin['username'],
                'maskedEmail' => $maskedEmail,
                'hasEmail' => true
            ]);
            exit;
        }

        // 11a-2. Super Admin Forgot Password: Verify OTP & Reset
        if ($sub === 'forgot-password' && ($segments[2] ?? '') === 'verify-and-reset' && $method === 'POST') {
            $identity = strtolower(trim($input['identity'] ?? ''));
            $otp = trim($input['otp'] ?? '');
            $newPassword = trim($input['newPassword'] ?? '');

            if (empty($identity) || empty($otp) || empty($newPassword)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'यूज़रनेम, OTP कोड और नया पासवर्ड सभी अनिवार्य हैं']);
                exit;
            }

            if (strlen($newPassword) < 4) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'नया पासवर्ड कम से कम 4 अक्षरों का होना चाहिए']);
                exit;
            }

            $tokenFile = sys_get_temp_dir() . '/admin_otp_' . md5($identity) . '.json';
            if (!file_exists($tokenFile)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => '❌ कोई सक्रिय OTP नहीं मिला या समय सीमा समाप्त हो गई है।']);
                exit;
            }

            $stored = json_decode(file_get_contents($tokenFile), true);
            if (!$stored || empty($stored['expires_at']) || $stored['expires_at'] < time()) {
                @unlink($tokenFile);
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => '❌ सुरक्षा कोड (OTP) समाप्त हो चुका है। नया कोड मंगाएं।']);
                exit;
            }

            $stored['attempts'] = ($stored['attempts'] ?? 0) + 1;
            if ($stored['attempts'] > 3) {
                @unlink($tokenFile);
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => '❌ लगातार 3 गलत प्रयास! कृपया नया OTP मंगाएं।']);
                exit;
            }

            if ((string)$stored['otp'] !== $otp) {
                file_put_contents($tokenFile, json_encode($stored));
                $rem = 3 - $stored['attempts'];
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => "❌ गलत सुरक्षा कोड! शेष प्रयास: {$rem}"]);
                exit;
            }

            // OTP valid: update password in super_admins with Bcrypt hash
            $hash = hashSecret($newPassword);
            $stmt = $pdo->prepare("UPDATE super_admins SET password = ? WHERE id = ?");
            $stmt->execute([$hash, $stored['admin_id']]);

            @unlink($tokenFile);

            $token = generateAdminToken($stored['admin_id'], $stored['username']);
            echo json_encode([
                'success' => true,
                'message' => 'सुपर एडमिन पासवर्ड सफलतापूर्वक बदल दिया गया है!',
                'token' => $token,
                'user' => [
                    'id' => $stored['admin_id'],
                    'username' => $stored['username'],
                    'role' => 'superadmin'
                ]
            ]);
            exit;
        }

        // Protected Admin Endpoints below
        $currentAdmin = getAuthSuperAdmin($pdo);

        // 11b. Platform Stats: GET /api/admin/stats
        if ($sub === 'stats' && $method === 'GET') {
            $totalShops = (int)($pdo->query("SELECT COUNT(*) as c FROM shop_settings")->fetch()['c'] ?? 0);
            $pendingShops = (int)($pdo->query("SELECT COUNT(*) as c FROM shop_settings WHERE status = 'pending'")->fetch()['c'] ?? 0);
            $approvedShops = (int)($pdo->query("SELECT COUNT(*) as c FROM shop_settings WHERE status = 'approved' OR status IS NULL OR status = ''")->fetch()['c'] ?? 0);
            $suspendedShops = (int)($pdo->query("SELECT COUNT(*) as c FROM shop_settings WHERE status = 'suspended' OR status = 'rejected'")->fetch()['c'] ?? 0);

            $totalCustomers = (int)($pdo->query("SELECT COUNT(*) as c FROM customers")->fetch()['c'] ?? 0);
            $totalTransactions = (int)($pdo->query("SELECT COUNT(*) as c FROM transactions WHERE is_deleted = 0 OR is_deleted IS NULL")->fetch()['c'] ?? 0);

            $uSum = (float)($pdo->query("SELECT COALESCE(SUM(amount), 0) as s FROM transactions WHERE type = 'udhaar' AND (is_deleted = 0 OR is_deleted IS NULL)")->fetch()['s'] ?? 0);
            $jSum = (float)($pdo->query("SELECT COALESCE(SUM(amount), 0) as s FROM transactions WHERE type = 'jama' AND (is_deleted = 0 OR is_deleted IS NULL)")->fetch()['s'] ?? 0);

            echo json_encode([
                'success' => true,
                'stats' => [
                    'totalShops' => $totalShops,
                    'pendingShops' => $pendingShops,
                    'approvedShops' => $approvedShops,
                    'suspendedShops' => $suspendedShops,
                    'totalCustomers' => $totalCustomers,
                    'totalTransactions' => $totalTransactions,
                    'totalUdhaar' => $uSum,
                    'totalJama' => $jSum,
                    'marketDue' => $uSum - $jSum
                ]
            ]);
            exit;
        }

        // 11c. List all Shops: GET /api/admin/shops
        if ($sub === 'shops' && $method === 'GET') {
            $stmt = $pdo->query("
                SELECT 
                    s.id, 
                    s.shop_name, 
                    s.owner_name, 
                    s.phone, 
                    s.email, 
                    s.address, 
                    s.upi_id, 
                    COALESCE(s.status, 'approved') as status, 
                    s.created_at,
                    COALESCE(cust.customer_count, 0) as customer_count,
                    COALESCE(tx.transaction_count, 0) as transaction_count,
                    COALESCE(tx.total_udhaar, 0) as total_udhaar,
                    COALESCE(tx.total_jama, 0) as total_jama,
                    (COALESCE(tx.total_udhaar, 0) - COALESCE(tx.total_jama, 0)) as net_due
                FROM shop_settings s
                LEFT JOIN (
                    SELECT shop_id, COUNT(*) as customer_count 
                    FROM customers 
                    GROUP BY shop_id
                ) cust ON cust.shop_id = s.id
                LEFT JOIN (
                    SELECT 
                        shop_id,
                        COUNT(*) as transaction_count,
                        SUM(CASE WHEN type = 'udhaar' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END) as total_udhaar,
                        SUM(CASE WHEN type = 'jama' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END) as total_jama
                    FROM transactions
                    GROUP BY shop_id
                ) tx ON tx.shop_id = s.id
                ORDER BY CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END, s.id DESC
            ");
            $shops = $stmt->fetchAll();
            foreach ($shops as &$sp) {
                $sp['customer_count'] = (int)$sp['customer_count'];
                $sp['transaction_count'] = (int)$sp['transaction_count'];
                $sp['total_udhaar'] = (float)$sp['total_udhaar'];
                $sp['total_jama'] = (float)$sp['total_jama'];
                $sp['net_due'] = (float)$sp['net_due'];
                $sp['status'] = !empty($sp['status']) ? $sp['status'] : 'approved';
            }

            echo json_encode(['success' => true, 'shops' => $shops]);
            exit;
        }

        // 11d. Update Shop Approval Status: POST /api/admin/shops/update-status
        if ($sub === 'shops' && ($segments[2] ?? '') === 'update-status' && $method === 'POST') {
            $targetShopId = (int)($input['shop_id'] ?? 0);
            $newStatus = trim($input['status'] ?? '');

            if (!$targetShopId || !in_array($newStatus, ['approved', 'pending', 'suspended', 'rejected'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'मान्य दुकान ID और स्थिति (approved, pending, suspended, rejected) आवश्यक है']);
                exit;
            }

            $stmt = $pdo->prepare("UPDATE shop_settings SET status = ? WHERE id = ?");
            $stmt->execute([$newStatus, $targetShopId]);

            $statusLabels = [
                'approved' => 'स्वीकृत (Approved / Active)',
                'pending' => 'लंबित (Pending)',
                'suspended' => 'निलंबित (Suspended)',
                'rejected' => 'अस्वीकृत (Rejected)'
            ];

            echo json_encode([
                'success' => true,
                'message' => "दुकान की स्थिति बदलकर '{$statusLabels[$newStatus]}' कर दी गई है!",
                'shop_id' => $targetShopId,
                'status' => $newStatus
            ]);
            exit;
        }

        // 11e. Delete Shop: POST /api/admin/shops/delete
        if ($sub === 'shops' && ($segments[2] ?? '') === 'delete' && $method === 'POST') {
            $targetShopId = (int)($input['shop_id'] ?? 0);
            if (!$targetShopId) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'दुकान ID आवश्यक है']);
                exit;
            }
            if ($targetShopId === 1) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'प्राथमिक मुख्य दुकान (ID: 1) को हटाया नहीं जा सकता']);
                exit;
            }

            $pdo->beginTransaction();
            try {
                $pdo->prepare("DELETE FROM transactions WHERE shop_id = ?")->execute([$targetShopId]);
                $pdo->prepare("DELETE FROM customers WHERE shop_id = ?")->execute([$targetShopId]);
                $pdo->prepare("DELETE FROM products WHERE shop_id = ?")->execute([$targetShopId]);
                $pdo->prepare("DELETE FROM mandi_alerts WHERE shop_id = ?")->execute([$targetShopId]);
                $pdo->prepare("DELETE FROM shop_settings WHERE id = ?")->execute([$targetShopId]);
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'दुकान और उसका सारा डेटा सफलतापूर्वक हटा दिया गया है।']);
            } catch (\Exception $e) {
                $pdo->rollBack();
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'हटाने में त्रुटि: ' . $e->getMessage()]);
            }
            exit;
        }

        // 11f. Admin Change Password: POST /api/admin/change-password
        if ($sub === 'change-password' && $method === 'POST') {
            $curr = trim($input['currentPassword'] ?? '');
            $newP = trim($input['newPassword'] ?? '');
            if (empty($curr) || empty($newP)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'वर्तमान व नया पासवर्ड दोनों आवश्यक हैं']);
                exit;
            }
            $adStmt = $pdo->prepare("SELECT password FROM super_admins WHERE id = ?");
            $adStmt->execute([$currentAdmin['id']]);
            $adRow = $adStmt->fetch();
            if (!$adRow || !verifySecret($curr, $adRow['password'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'वर्तमान पासवर्ड गलत है']);
                exit;
            }

            $pdo->prepare("UPDATE super_admins SET password = ? WHERE id = ?")->execute([hashSecret($newP), $currentAdmin['id']]);
            echo json_encode(['success' => true, 'message' => 'व्यवस्थापक पासवर्ड सफलतापूर्वक बदल दिया गया है']);
            exit;
        }

        // 11g. Store Impersonation (Login Directly as Store Owner): POST /api/admin/impersonate
        if ($sub === 'impersonate' && $method === 'POST') {
            $targetShopId = (int)($input['shop_id'] ?? 0);
            $st = $pdo->prepare("SELECT id, shop_name, owner_name, phone, email, address, upi_id FROM shop_settings WHERE id = ?");
            $st->execute([$targetShopId]);
            $shop = $st->fetch();
            if (!$shop) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'दुकान नहीं मिली']);
                exit;
            }
            $storeToken = generateShopToken($shop['id'], $shop['phone']);
            echo json_encode([
                'success' => true,
                'message' => "दुकान '{$shop['shop_name']}' में एडमिन लॉगिन तैयार!",
                'token' => $storeToken,
                'shop_id' => (int)$shop['id'],
                'user' => [
                    'shop_id' => (int)$shop['id'],
                    'shop_name' => $shop['shop_name'],
                    'owner_name' => $shop['owner_name'],
                    'phone' => $shop['phone'],
                    'email' => $shop['email'] ?? '',
                    'is_impersonating' => true
                ]
            ]);
            exit;
        }

        // 11h. Reset Merchant PIN & Password: POST /api/admin/shops/reset-pin
        if ($sub === 'shops' && ($segments[2] ?? '') === 'reset-pin' && $method === 'POST') {
            $targetShopId = (int)($input['shop_id'] ?? 0);
            $newPin = trim((string)($input['new_pin'] ?? '1234'));
            $newPass = trim((string)($input['new_password'] ?? 'admin'));
            if (!$targetShopId || strlen($newPin) < 4) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'दुकान ID और कम से कम 4-अंकों का नया पिन आवश्यक है']);
                exit;
            }
            $hashedPin = hashSecret($newPin);
            $hashedPass = hashSecret($newPass);
            $st = $pdo->prepare("UPDATE shop_settings SET pin = ?, password = ? WHERE id = ?");
            $st->execute([$hashedPin, $hashedPass, $targetShopId]);
            echo json_encode([
                'success' => true,
                'message' => "दुकान (ID: {$targetShopId}) का पिन '{$newPin}' और पासवर्ड '{$newPass}' पर रीसेट कर दिया गया है!"
            ]);
            exit;
        }

        // 11i. Admin Create Pre-Approved Store: POST /api/admin/shops/create
        if ($sub === 'shops' && ($segments[2] ?? '') === 'create' && $method === 'POST') {
            $shopName = trim($input['shop_name'] ?? '');
            $phone = preg_replace('/[^0-9]/', '', (string)($input['phone'] ?? ''));
            $ownerName = trim($input['owner_name'] ?? 'दुकानदार');
            $address = trim($input['address'] ?? '');
            $email = trim($input['email'] ?? '');
            $upiId = trim($input['upi_id'] ?? ($phone . '@paytm'));
            $pin = trim($input['pin'] ?? '1234');
            $pass = trim($input['password'] ?? 'admin');

            if (empty($shopName) || empty($phone) || strlen($phone) < 10) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'कृपया दुकान का नाम और 10-अंकों का वैध मोबाइल नंबर दर्ज करें']);
                exit;
            }

            // Check duplicate phone
            $clean10 = substr($phone, -10);
            $allShops = $pdo->query("SELECT id, shop_name, phone FROM shop_settings")->fetchAll();
            foreach ($allShops as $s) {
                $cp = preg_replace('/[^0-9]/', '', (string)($s['phone'] ?? ''));
                if (!empty($cp) && substr($cp, -10) === $clean10) {
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'error' => "❌ मोबाइल नंबर {$phone} पहले से '{$s['shop_name']}' दुकान में पंजीकृत है!"
                    ]);
                    exit;
                }
            }

            $stmt = $pdo->prepare("
                INSERT INTO shop_settings (shop_name, owner_name, phone, email, address, upi_id, pin, password, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')
            ");
            $stmt->execute([$shopName, $ownerName, $phone, $email, $address, $upiId, hashSecret($pin), hashSecret($pass)]);
            $newId = (int)$pdo->lastInsertId();

            echo json_encode([
                'success' => true,
                'message' => "नई दुकान '{$shopName}' (ID: {$newId}) सफलतापूर्वक बना दी गई है और तुरंत सक्रिय (Approved) है!",
                'shop_id' => $newId
            ]);
            exit;
        }

        // 11j. Shop Audit & Details: GET /api/admin/shops/details
        if ($sub === 'shops' && ($segments[2] ?? '') === 'details' && $method === 'GET') {
            $targetShopId = (int)($_GET['id'] ?? 0);
            $st = $pdo->prepare("SELECT id, shop_name, owner_name, phone, email, address, upi_id, status, created_at FROM shop_settings WHERE id = ?");
            $st->execute([$targetShopId]);
            $shop = $st->fetch();
            if (!$shop) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'दुकान नहीं मिली']);
                exit;
            }

            $cStmt = $pdo->prepare("
                SELECT c.id, c.name, c.phone,
                       COALESCE(SUM(CASE WHEN t.type = 'udhaar' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) as udhaar,
                       COALESCE(SUM(CASE WHEN t.type = 'jama' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) as jama
                FROM customers c
                LEFT JOIN transactions t ON c.id = t.customer_id
                WHERE c.shop_id = ?
                GROUP BY c.id
                ORDER BY (udhaar - jama) DESC
                LIMIT 5
            ");
            $cStmt->execute([$targetShopId]);
            $topCustomers = $cStmt->fetchAll();
            foreach ($topCustomers as &$tc) {
                $tc['due'] = (float)$tc['udhaar'] - (float)$tc['jama'];
            }

            $tStmt = $pdo->prepare("
                SELECT t.id, t.type, t.amount, t.notes, t.date, t.created_at, c.name as customer_name
                FROM transactions t
                LEFT JOIN customers c ON t.customer_id = c.id
                WHERE t.shop_id = ? AND (t.is_deleted IS NULL OR t.is_deleted = 0)
                ORDER BY t.id DESC
                LIMIT 5
            ");
            $tStmt->execute([$targetShopId]);
            $recentTxs = $tStmt->fetchAll();

            $cMetrics = $pdo->prepare("
                SELECT 
                    (SELECT COUNT(*) FROM customers WHERE shop_id = ?) as customer_count,
                    (SELECT COUNT(*) FROM transactions WHERE shop_id = ? AND (is_deleted IS NULL OR is_deleted = 0)) as transaction_count,
                    COALESCE(SUM(CASE WHEN type = 'udhaar' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END), 0) as total_udhaar,
                    COALESCE(SUM(CASE WHEN type = 'jama' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END), 0) as total_jama
                FROM transactions
                WHERE shop_id = ?
            ");
            $cMetrics->execute([$targetShopId, $targetShopId, $targetShopId]);
            $metricsRow = $cMetrics->fetch();
            $uAmt = (float)($metricsRow['total_udhaar'] ?? 0);
            $jAmt = (float)($metricsRow['total_jama'] ?? 0);
            $shop['customer_count'] = (int)($metricsRow['customer_count'] ?? 0);
            $shop['transaction_count'] = (int)($metricsRow['transaction_count'] ?? 0);
            $shop['total_udhaar'] = $uAmt;
            $shop['total_jama'] = $jAmt;
            $shop['net_due'] = $uAmt - $jAmt;

            echo json_encode([
                'success' => true,
                'shop' => $shop,
                'top_customers' => $topCustomers,
                'recent_transactions' => $recentTxs
            ]);
            exit;
        }

        // 11k. Global Platform Broadcast Notice Management: GET & POST /api/admin/broadcast
        if ($sub === 'broadcast') {
            try {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS `platform_notices` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `message` TEXT NOT NULL,
                        `type` VARCHAR(30) DEFAULT 'info',
                        `is_active` TINYINT(1) DEFAULT 1,
                        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                ");
            } catch (\Exception $e) {}

            if ($method === 'GET') {
                $row = $pdo->query("SELECT * FROM platform_notices ORDER BY id DESC LIMIT 1")->fetch();
                echo json_encode([
                    'success' => true,
                    'notice' => $row ? [
                        'id' => (int)$row['id'],
                        'message' => $row['message'],
                        'type' => $row['type'],
                        'is_active' => (bool)$row['is_active'],
                        'updated_at' => $row['updated_at']
                    ] : null
                ]);
                exit;
            }

            if ($method === 'POST') {
                $msg = trim($input['message'] ?? '');
                $type = trim($input['type'] ?? 'info');
                $isActive = isset($input['is_active']) ? (int)(bool)$input['is_active'] : 1;

                $exist = $pdo->query("SELECT id FROM platform_notices LIMIT 1")->fetch();
                if ($exist) {
                    $up = $pdo->prepare("UPDATE platform_notices SET message = ?, type = ?, is_active = ? WHERE id = ?");
                    $up->execute([$msg, $type, $isActive, $exist['id']]);
                } else {
                    $in = $pdo->prepare("INSERT INTO platform_notices (message, type, is_active) VALUES (?, ?, ?)");
                    $in->execute([$msg, $type, $isActive]);
                }

                echo json_encode([
                    'success' => true,
                    'message' => 'प्लेटफॉर्म नोटिस सफलतापूर्वक अपडेट हो गया!'
                ]);
                exit;
            }
        }

        // 11l. Platform Backup & Google Drive Settings: GET & POST /api/admin/backup/settings
        if ($sub === 'backup' && ($segments[2] ?? '') === 'settings') {
            if ($method === 'GET') {
                $row = $pdo->query("SELECT gdrive_webhook_url, auto_backup_enabled, auto_backup_interval_hours, sync_on_any_store_entry, last_backup_time, last_backup_status FROM platform_settings WHERE id = 1 LIMIT 1")->fetch();
                echo json_encode([
                    'success' => true,
                    'settings' => $row ? [
                        'gdrive_webhook_url' => $row['gdrive_webhook_url'] ?: null,
                        'auto_backup_enabled' => (bool)$row['auto_backup_enabled'],
                        'auto_backup_interval_hours' => (int)($row['auto_backup_interval_hours'] ?? 2),
                        'sync_on_any_store_entry' => (bool)$row['sync_on_any_store_entry'],
                        'last_backup_time' => $row['last_backup_time'] ?: null,
                        'last_backup_status' => $row['last_backup_status'] ?: null
                    ] : [
                        'gdrive_webhook_url' => null,
                        'auto_backup_enabled' => false,
                        'auto_backup_interval_hours' => 2,
                        'sync_on_any_store_entry' => true,
                        'last_backup_time' => null,
                        'last_backup_status' => null
                    ]
                ]);
                exit;
            }

            if ($method === 'POST') {
                $current = $pdo->query("SELECT * FROM platform_settings WHERE id = 1 LIMIT 1")->fetch() ?: [];
                $gdriveUrl = isset($input['gdrive_webhook_url']) ? trim($input['gdrive_webhook_url']) : ($current['gdrive_webhook_url'] ?? null);
                $autoEnabled = isset($input['auto_backup_enabled']) ? (int)(bool)$input['auto_backup_enabled'] : (int)($current['auto_backup_enabled'] ?? 0);
                $intervalHours = isset($input['auto_backup_interval_hours']) ? (int)$input['auto_backup_interval_hours'] : (int)($current['auto_backup_interval_hours'] ?? 2);
                $syncOnEntry = isset($input['sync_on_any_store_entry']) ? (int)(bool)$input['sync_on_any_store_entry'] : (int)($current['sync_on_any_store_entry'] ?? 1);

                $stmt = $pdo->prepare("
                    INSERT INTO platform_settings (id, gdrive_webhook_url, auto_backup_enabled, auto_backup_interval_hours, sync_on_any_store_entry)
                    VALUES (1, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        gdrive_webhook_url = VALUES(gdrive_webhook_url),
                        auto_backup_enabled = VALUES(auto_backup_enabled),
                        auto_backup_interval_hours = VALUES(auto_backup_interval_hours),
                        sync_on_any_store_entry = VALUES(sync_on_any_store_entry)
                ");
                $stmt->execute([$gdriveUrl, $autoEnabled, $intervalHours, $syncOnEntry]);

                $updated = $pdo->query("SELECT gdrive_webhook_url, auto_backup_enabled, auto_backup_interval_hours, sync_on_any_store_entry, last_backup_time, last_backup_status FROM platform_settings WHERE id = 1")->fetch();
                echo json_encode([
                    'success' => true,
                    'settings' => [
                        'gdrive_webhook_url' => $updated['gdrive_webhook_url'] ?: null,
                        'auto_backup_enabled' => (bool)$updated['auto_backup_enabled'],
                        'auto_backup_interval_hours' => (int)$updated['auto_backup_interval_hours'],
                        'sync_on_any_store_entry' => (bool)$updated['sync_on_any_store_entry'],
                        'last_backup_time' => $updated['last_backup_time'] ?: null,
                        'last_backup_status' => $updated['last_backup_status'] ?: null
                    ]
                ]);
                exit;
            }
        }

        // 11m. Platform Backup Download: GET /api/admin/backup/download
        if ($sub === 'backup' && ($segments[2] ?? '') === 'download' && $method === 'GET') {
            $shops = $pdo->query("SELECT id, shop_name, owner_name, phone, email, address, upi_id, status, created_at FROM shop_settings ORDER BY id ASC")->fetchAll();
            $customers = $pdo->query("SELECT * FROM customers ORDER BY id ASC")->fetchAll();
            $transactions = $pdo->query("SELECT * FROM transactions ORDER BY id ASC")->fetchAll();
            $products = $pdo->query("SELECT * FROM products ORDER BY id ASC")->fetchAll();
            $mandiAlerts = $pdo->query("SELECT * FROM mandi_alerts ORDER BY id ASC")->fetchAll();
            $superAdmins = $pdo->query("SELECT id, username, phone, name, role, created_at FROM super_admins ORDER BY id ASC")->fetchAll();
            $notices = $pdo->query("SELECT * FROM platform_notices ORDER BY id ASC")->fetchAll();

            $backupData = [
                'version' => '2.5-platform-full',
                'backup_type' => 'FULL_PROJECT_MASTER_BACKUP',
                'is_platform_backup' => true,
                'timestamp' => date('c'),
                'total_shops' => count($shops),
                'data' => [
                    'shops' => $shops,
                    'customers' => $customers,
                    'transactions' => $transactions,
                    'products' => $products,
                    'mandi_alerts' => $mandiAlerts,
                    'super_admins' => $superAdmins,
                    'notices' => $notices
                ]
            ];

            $today = date('Y-m-d');
            $filename = "Dukaan_FULL_PROJECT_Master_Backup_{$today}.json";
            header('Content-Type: application/json; charset=utf-8');
            header("Content-Disposition: attachment; filename=\"{$filename}\"");
            echo json_encode($backupData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            exit;
        }

        // 11n. Platform Backup Sync to Google Drive: POST /api/admin/backup/sync-gdrive
        if ($sub === 'backup' && ($segments[2] ?? '') === 'sync-gdrive' && $method === 'POST') {
            $plat = $pdo->query("SELECT * FROM platform_settings WHERE id = 1 LIMIT 1")->fetch();
            $url = !empty($input['webhook_url']) ? trim($input['webhook_url']) : ($plat['gdrive_webhook_url'] ?? '');
            if (empty($url)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Google Drive Webhook URL सेट नहीं है']);
                exit;
            }

            $shops = $pdo->query("SELECT id, shop_name, owner_name, phone, email, address, upi_id, status, created_at FROM shop_settings ORDER BY id ASC")->fetchAll();
            $customers = $pdo->query("SELECT * FROM customers ORDER BY id ASC")->fetchAll();
            $transactions = $pdo->query("SELECT * FROM transactions ORDER BY id ASC")->fetchAll();
            $products = $pdo->query("SELECT * FROM products ORDER BY id ASC")->fetchAll();
            $mandiAlerts = $pdo->query("SELECT * FROM mandi_alerts ORDER BY id ASC")->fetchAll();
            $superAdmins = $pdo->query("SELECT id, username, phone, name, role, created_at FROM super_admins ORDER BY id ASC")->fetchAll();
            $notices = $pdo->query("SELECT * FROM platform_notices ORDER BY id ASC")->fetchAll();

            $backupData = [
                'version' => '2.5-platform-full',
                'backup_type' => 'FULL_PROJECT_MASTER_BACKUP',
                'is_platform_backup' => true,
                'timestamp' => date('c'),
                'total_shops' => count($shops),
                'data' => [
                    'shops' => $shops,
                    'customers' => $customers,
                    'transactions' => $transactions,
                    'products' => $products,
                    'mandi_alerts' => $mandiAlerts,
                    'super_admins' => $superAdmins,
                    'notices' => $notices
                ]
            ];

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($backupData));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            $timeStr = date('h:i A (d/m/Y)');
            if ($httpCode >= 200 && $httpCode < 400) {
                $pdo->prepare("UPDATE platform_settings SET last_backup_time = ?, last_backup_status = 'सफल (Success)' WHERE id = 1")->execute([$timeStr]);
                echo json_encode([
                    'success' => true,
                    'time' => $timeStr,
                    'message' => 'पूरे प्रोजेक्ट (सभी दुकानों) का बैकअप Google Drive पर सफलतापूर्वक अपलोड हो गया!'
                ]);
            } else {
                $err = $curlError ?: "Google Drive ने एरर दिया (HTTP {$httpCode})";
                $pdo->prepare("UPDATE platform_settings SET last_backup_status = ? WHERE id = 1")->execute(["विफल ({$httpCode})"]);
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => $err]);
            }
            exit;
        }
    }

    // ========================================================
    // 12. /api/broadcast (Public / Store Merchant Notice)
    // ========================================================
    if ($resource === 'broadcast' && $method === 'GET') {
        try {
            $row = $pdo->query("SELECT * FROM platform_notices WHERE is_active = 1 ORDER BY id DESC LIMIT 1")->fetch();
            echo json_encode([
                'success' => true,
                'notice' => $row ? [
                    'id' => (int)$row['id'],
                    'message' => $row['message'],
                    'type' => $row['type'],
                    'updated_at' => $row['updated_at']
                ] : null
            ]);
        } catch (\Exception $e) {
            echo json_encode(['success' => true, 'notice' => null]);
        }
        exit;
    }

    // Fallback 404
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'API endpoint not found: ' . $path]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
