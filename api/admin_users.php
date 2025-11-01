<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../lib/auth.php';

require_login();
require_admin();

$pdo = db();
$stmt = $pdo->query("SELECT id, name, email, COALESCE(confirmed,0) AS confirmed, COALESCE(is_admin,0) AS is_admin, created_at FROM users ORDER BY id");
$rows = $stmt->fetchAll();

echo json_encode($rows);

