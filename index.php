<?php
/**
 * Dukaan Khaata & Stock Manager - Application Entry Point
 * 
 * 1. If installation wizard has NOT run or not completed (installed.lock missing):
 *    -> Automatically redirects to /install.php
 * 2. If installation wizard completed all steps (installed.lock exists):
 *    -> Directly serves index.html (the main app)
 */

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$lockFile = __DIR__ . '/installed.lock';
$lockFileAlt = __DIR__ . '/install.lock';
$htmlFile = __DIR__ . '/index.html';
$installFile = __DIR__ . '/install.php';

// 1. If installation lock does NOT exist (neither installed.lock nor install.lock) -> Automatically redirect to install.php
if (!file_exists($lockFile) && !file_exists($lockFileAlt)) {
    if (file_exists($installFile)) {
        header('Location: install.php');
        exit;
    }
}

// 2. If installation completed (installed.lock exists) -> Serve main application (index.html)
if (file_exists($htmlFile)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($htmlFile);
    exit;
} else {
    echo "<h1>Dukaan Khaata: index.html not found</h1>";
    exit;
}
