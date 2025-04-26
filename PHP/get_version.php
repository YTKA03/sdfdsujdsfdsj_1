<?php
// Отключаем отображение ошибок в выводе (но оставляем логирование в файл)
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);

// Устанавливаем временную зону явно
date_default_timezone_set('Europe/Kiev'); // Используем 'Europe/Kiev' вместо 'Europe/Kyiv'

// Логирование запросов
$log_file = 'get_version.log';
$log_message = date('Y-m-d H:i:s') . " - Request received: " . json_encode($_GET) . "\n";
file_put_contents($log_file, $log_message, FILE_APPEND);

// Настройка заголовков для CORS и JSON-ответа
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

// Параметры подключения к базе данных (замените на ваши)
$host = 'localhost';
$dbname = 'app_users';
$username = 'dogda';
$password = 'Nika011119';

try {
    // Подключаемся к базе данных
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Создаём таблицу app_version, если она не существует
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_version (
        id INT AUTO_INCREMENT PRIMARY KEY,
        latest_version VARCHAR(20) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    // Проверяем, есть ли записи в таблице
    $stmt = $pdo->query("SELECT latest_version FROM app_version ORDER BY id DESC LIMIT 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        // Если записей нет, добавляем начальную версию
        $initial_version = "1.0.0";
        $pdo->exec("INSERT INTO app_version (latest_version) VALUES ('$initial_version')");
        $latest_version = $initial_version;
    } else {
        $latest_version = $row['latest_version'];
    }

    // Формируем ответ
    $response = [
        'status' => 'success',
        'latest_version' => $latest_version,
        'message' => 'Version retrieved successfully'
    ];

    file_put_contents($log_file, date('Y-m-d H:i:s') . " - Response: " . json_encode($response) . "\n", FILE_APPEND);
    echo json_encode($response);
} catch (PDOException $e) {
    $response = [
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ];
    file_put_contents($log_file, date('Y-m-d H:i:s') . " - Error: " . $response['message'] . "\n", FILE_APPEND);
    echo json_encode($response);
}
exit;
?>