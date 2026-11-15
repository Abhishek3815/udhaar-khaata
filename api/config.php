<?php
// Database configuration for Shared Hosting (cPanel / phpMyAdmin)
define('DB_HOST', 'localhost');
define('DB_NAME', 'dukaan_khaata_db'); // Apna cPanel database name daalein (e.g. u123456_dukaan)
define('DB_USER', 'root');            // Apna database username daalein
define('DB_PASS', '');                // Apna database password daalein
define('DB_PORT', '3306');

// Optional: Gemini API Key for voice recognition
define('GEMINI_API_KEY', '');

function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Database connection failed: ' . $e->getMessage()
            ]);
            exit;
        }
    }
    return $pdo;
}
