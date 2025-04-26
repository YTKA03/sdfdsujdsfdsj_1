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
    $mac_address = $input['mac_address'] ?? null;

    if (!$telegram_id || !$mac_address) {
        echo json_encode(['status' => 'error', 'message' => 'Missing telegram_id or mac_address']);
        exit;
    }

    // Проверяем, есть ли уже привязанный MAC-адрес у текущего пользователя
    $stmt = $pdo->prepare("SELECT mac_address FROM users WHERE telegram_id = :telegram_id");
    $stmt->execute(['telegram_id' => $telegram_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user && !empty($user['mac_address'])) {
        echo json_encode(['status' => 'error', 'message' => 'MAC address already bound to this user']);
        exit;
    }

    // Проверяем, используется ли MAC-адрес другим пользователем
    $stmt = $pdo->prepare("SELECT telegram_id FROM users WHERE mac_address = :mac_address AND telegram_id != :telegram_id");
    $stmt->execute(['mac_address' => $mac_address, 'telegram_id' => $telegram_id]);
    $existing_user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existing_user) {
        echo json_encode(['status' => 'error', 'message' => 'MAC address is already bound to another user']);
        exit;
    }

    // Привязываем MAC-адрес
    $stmt = $pdo->prepare("UPDATE users SET mac_address = :mac_address WHERE telegram_id = :telegram_id");
    $stmt->execute(['mac_address' => $mac_address, 'telegram_id' => $telegram_id]);

    echo json_encode(['status' => 'success', 'message' => 'MAC address bound successfully']);
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>