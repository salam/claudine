<?php
declare(strict_types=1);

function request_wants_json(): bool
{
    $acceptHeader = $_SERVER['HTTP_ACCEPT'] ?? '';
    $requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';

    if (stripos($acceptHeader, 'application/json') !== false) {
        return true;
    }

    return strcasecmp((string)$requestedWith, 'XMLHttpRequest') === 0;
}

function respond_with_error(int $statusCode, string $message): never
{
    http_response_code($statusCode);

    if (request_wants_json()) {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['ok' => false, 'message' => $message], JSON_UNESCAPED_SLASHES);
        exit;
    }

    $location = '/?subscribe=error#newsletter';
    header("Location: {$location}", true, 303);
    exit;
}

function respond_with_success(): never
{
    if (request_wants_json()) {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['ok' => true], JSON_UNESCAPED_SLASHES);
        exit;
    }

    $location = '/?subscribe=success#newsletter';
    header("Location: {$location}", true, 303);
    exit;
}

function ensure_writable_directory(string $directoryPath): bool
{
    if ($directoryPath === '') {
        return false;
    }

    if (!is_dir($directoryPath) && !@mkdir($directoryPath, 0755, true) && !is_dir($directoryPath)) {
        return false;
    }

    return is_writable($directoryPath);
}

function resolve_storage_file(): string
{
    $customFilePath = trim((string)getenv('CLAUDINE_SUBSCRIBE_STORAGE_FILE'));
    if ($customFilePath !== '') {
        $customDirectoryPath = dirname($customFilePath);
        if (!ensure_writable_directory($customDirectoryPath)) {
            throw new RuntimeException('Custom storage directory is not writable.');
        }
        return $customFilePath;
    }

    $candidateDirectoryPaths = [];

    $customDirectoryPath = trim((string)getenv('CLAUDINE_SUBSCRIBE_STORAGE_DIR'));
    if ($customDirectoryPath !== '') {
        $candidateDirectoryPaths[] = $customDirectoryPath;
    }

    $candidateDirectoryPaths[] = dirname(__DIR__) . '/data';
    $candidateDirectoryPaths[] = __DIR__ . '/data';
    $candidateDirectoryPaths[] = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . '/claudine';

    foreach ($candidateDirectoryPaths as $candidateDirectoryPath) {
        if (!ensure_writable_directory($candidateDirectoryPath)) {
            continue;
        }

        return rtrim($candidateDirectoryPath, DIRECTORY_SEPARATOR) . '/newsletter-subscribers.sqlite';
    }

    throw new RuntimeException('No writable storage directory available.');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond_with_error(405, 'Only POST is allowed.');
}

$emailInput = trim((string)($_POST['email'] ?? ''));
$honeypotInput = trim((string)($_POST['company'] ?? ''));

if ($honeypotInput !== '') {
    respond_with_success();
}

if ($emailInput === '' || filter_var($emailInput, FILTER_VALIDATE_EMAIL) === false) {
    respond_with_error(422, 'Please provide a valid email address.');
}

$email = strtolower($emailInput);

try {
    $storageFile = resolve_storage_file();
} catch (Throwable $exception) {
    respond_with_error(500, 'Unable to prepare storage directory.');
}

$timestampUtc = gmdate('c');
$remoteIp = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$userAgent = str_replace(["\r", "\n"], ' ', (string)($_SERVER['HTTP_USER_AGENT'] ?? ''));

if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
    respond_with_error(500, 'SQLite is not available on this server.');
}

if (!is_file($storageFile) && @touch($storageFile) === false) {
    respond_with_error(500, 'Unable to create SQLite file.');
}

if (!is_writable($storageFile)) {
    respond_with_error(500, 'SQLite file is not writable.');
}

try {
    $pdo = new PDO('sqlite:' . $storageFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA journal_mode = WAL;');
    $pdo->exec('PRAGMA busy_timeout = 5000;');

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            source_ip TEXT,
            user_agent TEXT
        )'
    );

    $statement = $pdo->prepare(
        'INSERT INTO newsletter_subscribers (email, created_at, updated_at, source_ip, user_agent)
         VALUES (:email, :created_at, :updated_at, :source_ip, :user_agent)
         ON CONFLICT(email) DO UPDATE SET
             updated_at = excluded.updated_at,
             source_ip = excluded.source_ip,
             user_agent = excluded.user_agent'
    );

    $statement->execute([
        ':email' => $email,
        ':created_at' => $timestampUtc,
        ':updated_at' => $timestampUtc,
        ':source_ip' => $remoteIp,
        ':user_agent' => $userAgent,
    ]);
} catch (Throwable $exception) {
    respond_with_error(500, 'Unable to save subscription.');
}

respond_with_success();
