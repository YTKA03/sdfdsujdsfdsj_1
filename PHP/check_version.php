<?php
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

$host = 'localhost';
$dbname = 'app_users';
$username = 'dogda';
$password = 'Nika011119';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $client_version = $_GET['version'] ?? null;

    if (!$client_version) {
        echo json_encode(['status' => 'error', 'message' => 'Missing version parameter']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT version FROM app_version ORDER BY id DESC LIMIT 1");
    $stmt->execute();
    $latest_version = $stmt->fetchColumn();

    if (!$latest_version) {
        echo json_encode(['status' => 'error', 'message' => 'No version found in database']);
        exit;
    }

    if (version_compare($client_version, $latest_version, '<')) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Update required: new version ' . $latest_version,
            'latest_version' => $latest_version
        ]);
    } else {
        echo json_encode([
            'status' => 'success',
            'message' => 'Version is up to date',
            'latest_version' => $latest_version
        ]);
    }
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>