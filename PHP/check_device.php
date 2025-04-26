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

    if (!$user || (empty($user['machine_guid']) && empty($user['machine_guid_backup']))) {
        echo json_encode(['status' => 'error', 'message' => 'Device identifiers not found for this user']);
        exit;
    }

    $isGuidMatch = (!empty($user['machine_guid']) && $user['machine_guid'] === $machine_guid) ||
                   (!empty($user['machine_guid_backup']) && $user['machine_guid_backup'] === $machine_guid);

    if ($isGuidMatch) {
        echo json_encode(['status' => 'success', 'message' => 'Device identifiers match']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Device identifiers do not match']);
    }
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>