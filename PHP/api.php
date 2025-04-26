<?php
date_default_timezone_set('Europe/Kiev');
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

$start_time = microtime(true);

$host = 'localhost';
$dbname = 'app_users';
$username = 'dogda';
$password = 'Nika011119';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    error_log("Successfully connected to database: $dbname");
} catch (PDOException $e) {
    error_log("Database connection failed: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed'], JSON_UNESCAPED_UNICODE);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true);
error_log("Received data: " . json_encode($data));

if (!isset($data['telegram_id'])) {
    error_log("Telegram ID is missing");
    echo json_encode(['status' => 'error', 'message' => 'Telegram ID is required'], JSON_UNESCAPED_UNICODE);
    exit();
}

$telegram_id = $data['telegram_id'];

try {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE telegram_id = ?");
    $stmt->execute([$telegram_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    error_log("User lookup result: " . ($user ? json_encode($user) : "No user found"));
} catch (PDOException $e) {
    error_log("Error executing SELECT query: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Error querying user'], JSON_UNESCAPED_UNICODE);
    exit();
}

if (!$user) {
    try {
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $stmt = $pdo->prepare("INSERT INTO users (telegram_id, subscription_end_date, access_status) VALUES (?, ?, ?)");
        $stmt->execute([$telegram_id, $yesterday, false]);
        error_log("Inserted new user with telegram_id: $telegram_id, subscription_end_date: $yesterday");
        
        $stmt = $pdo->prepare("SELECT * FROM users WHERE telegram_id = ?");
        $stmt->execute([$telegram_id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        error_log("New user data: " . json_encode($user));
    } catch (PDOException $e) {
        error_log("Error executing INSERT query: " . $e->getMessage());
        echo json_encode(['status' => 'error', 'message' => 'Error inserting user'], JSON_UNESCAPED_UNICODE);
        exit();
    }
}

$current_date = date('Y-m-d');
$subscription_end_date = $user['subscription_end_date'];
$days_left = $subscription_end_date ? (strtotime($subscription_end_date) - strtotime($current_date)) / (60 * 60 * 24) : 0;
$has_access = true;

$response = [
    'status' => 'success',
    'telegramId' => $telegram_id,
    'daysLeft' => floor($days_left),
    'subscriptionEndDate' => $subscription_end_date ?? 'N/A',
    'hasAccess' => $has_access,
    'deviceBound' => !empty($user['machine_guid']),
    'message' => $days_left > 0 ? 'Подписка активна' : 'Нужно продлить подписку'
];
error_log("API response: " . json_encode($response));

$end_time = microtime(true);
$execution_time = $end_time - $start_time;
error_log("API execution time: " . $execution_time . " seconds");

echo json_encode($response, JSON_UNESCAPED_UNICODE);
?>