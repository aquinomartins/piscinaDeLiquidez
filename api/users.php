<?php
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/db.php';

require_login();
header('Content-Type: application/json');

try {
  $pdo = db();
  $stmt = $pdo->query("SELECT id, name FROM users WHERE COALESCE(confirmed,0)=1 ORDER BY name");
  $rows = $stmt->fetchAll();
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode(['error' => 'cannot_list_users']);
  exit;
}

$users = array_map(function($row){
  return [
    'id' => intval($row['id'] ?? 0),
    'name' => $row['name'] ?? ''
  ];
}, $rows ?: []);

echo json_encode(['users' => $users]);
