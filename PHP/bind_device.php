<?php
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

$host = 'localhost';
$dbname = 'app_users';
$username = 'dogda';
$password = 'Nika011119';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $input = json_decode(file_get_contents('php://input'), true);
    $telegram_id = $input['telegram_id'] ?? null;
    $machine_guid = $input['machine_guid'] ?? null;

    if (!$telegram_id || !$machine_guid) {
        echo json_encode(['status' => 'error', 'message' => 'Missing telegram_id or machine_guid']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT machine_guid, machine_guid_backup FROM users WHERE telegram_id = :telegram_id");
    $stmt->execute(['telegram_id' => $telegram_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user && !empty($user['machine_guid'])) {
        echo json_encode(['status' => 'error', 'message' => 'Device identifiers already bound to this user']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT telegram_id FROM users WHERE (machine_guid = :machine_guid OR machine_guid_backup = :machine_guid) AND telegram_id != :telegram_id");
    $stmt->execute(['machine_guid' => $machine_guid, 'telegram_id' => $telegram_id]);
    $existing_user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existing_user) {
        echo json_encode(['status' => 'error', 'message' => 'Device identifiers already bound to another user']);
        exit;
    }

    $stmt = $pdo->prepare("UPDATE users SET machine_guid = :machine_guid WHERE telegram_id = :telegram_id");
    $stmt->execute(['machine_guid' => $machine_guid, 'telegram_id' => $telegram_id]);

    echo json_encode(['status' => 'success', 'message' => 'Device identifiers bound successfully']);
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>