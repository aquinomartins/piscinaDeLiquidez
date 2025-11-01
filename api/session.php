<?php
header('Content-Type: application/json');
session_start();
$logged = isset($_SESSION['uid']);
$response = [
  'logged' => $logged,
  'user_id' => $logged ? intval($_SESSION['uid']) : null,
  'name' => $logged ? ($_SESSION['name'] ?? null) : null,
  'email' => $logged ? ($_SESSION['email'] ?? null) : null,
  'is_admin' => !empty($_SESSION['is_admin'])
];
echo json_encode($response);
