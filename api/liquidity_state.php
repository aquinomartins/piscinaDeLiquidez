<?php
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/db.php';

require_login();
header('Content-Type: application/json');

$pdo = db();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$now = new DateTime('now', liquidity_timezone());

try {
  if ($method === 'GET') {
    $result = liquidity_state_get($pdo, $now);
    echo json_encode($result);
    return;
  }

  if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if ($payload === null && json_last_error() !== JSON_ERROR_NONE) {
      http_response_code(400);
      echo json_encode(['error' => 'invalid_json']);
      return;
    }
    if (!is_array($payload) || !array_key_exists('state', $payload)) {
      http_response_code(400);
      echo json_encode(['error' => 'missing_state']);
      return;
    }
    $state = $payload['state'];
    $result = liquidity_state_save($pdo, $state, $now);
    echo json_encode($result);
    return;
  }

  http_response_code(405);
  echo json_encode(['error' => 'method_not_allowed']);
} catch (Exception $e) {
  http_response_code(500);
  error_log('liquidity_state error: ' . $e->getMessage());
  echo json_encode(['error' => 'server_error']);
}

function liquidity_timezone(): DateTimeZone {
  static $tz = null;
  if ($tz instanceof DateTimeZone) {
    return $tz;
  }
  try {
    $tz = new DateTimeZone('America/Sao_Paulo');
  } catch (Exception $e) {
    $tz = new DateTimeZone(date_default_timezone_get());
  }
  return $tz;
}

function liquidity_state_get(PDO $pdo, DateTime $now): array {
  $pdo->beginTransaction();
  $row = liquidity_state_fetch($pdo, true);
  $state = json_decode($row['data'] ?? 'null', true);
  $state = liquidity_state_normalize($state);
  $lastDate = $row['last_settlement_date'] ?? null;
  $changed = liquidity_state_run_daily($state, $lastDate, $now);
  $encoded = liquidity_state_encode($state);
  if ($changed || $encoded !== ($row['data'] ?? '')) {
    $stmt = $pdo->prepare('UPDATE liquidity_states SET data=?, last_settlement_date=? WHERE id=?');
    $stmt->execute([$encoded, $lastDate, $row['id']]);
    $row = liquidity_state_fetch_by_id($pdo, $row['id']);
  }
  $pdo->commit();

  return [
    'state' => $state,
    'version' => $row['updated_at'] ?? null,
    'serverTime' => $now->format(DATE_ATOM)
  ];
}

function liquidity_state_save(PDO $pdo, $state, DateTime $now): array {
  $pdo->beginTransaction();
  $row = liquidity_state_fetch($pdo, true);
  $normalized = liquidity_state_normalize($state);
  $lastDate = $row['last_settlement_date'] ?? null;
  $changed = liquidity_state_run_daily($normalized, $lastDate, $now);
  $encoded = liquidity_state_encode($normalized);
  $stmt = $pdo->prepare('UPDATE liquidity_states SET data=?, last_settlement_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
  $stmt->execute([$encoded, $lastDate, $row['id']]);
  $row = liquidity_state_fetch_by_id($pdo, $row['id']);
  $pdo->commit();

  return [
    'state' => $normalized,
    'version' => $row['updated_at'] ?? null,
    'serverTime' => $now->format(DATE_ATOM)
  ];
}

function liquidity_state_fetch(PDO $pdo, bool $lock = false): array {
  $sql = 'SELECT id, data, last_settlement_date, updated_at FROM liquidity_states ORDER BY id DESC LIMIT 1';
  if ($lock) {
    $sql .= ' FOR UPDATE';
  }
  $stmt = $pdo->prepare($sql);
  $stmt->execute();
  $row = $stmt->fetch();
  if ($row) {
    return $row;
  }
  $insert = $pdo->prepare('INSERT INTO liquidity_states (data) VALUES (?)');
  $insert->execute([liquidity_state_encode(null)]);
  $id = $pdo->lastInsertId();
  return liquidity_state_fetch_by_id($pdo, $id);
}

function liquidity_state_fetch_by_id(PDO $pdo, $id): array {
  $stmt = $pdo->prepare('SELECT id, data, last_settlement_date, updated_at FROM liquidity_states WHERE id=?');
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  return $row ?: ['id' => $id, 'data' => liquidity_state_encode(null), 'last_settlement_date' => null, 'updated_at' => null];
}

function liquidity_state_encode($state): string {
  $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
  if ($json === false) {
    throw new RuntimeException('json_encode_failed: ' . json_last_error_msg());
  }
  return $json;
}

function liquidity_state_normalize($state) {
  if ($state === null) {
    return null;
  }
  if (!is_array($state)) {
    return null;
  }

  $normalized = $state;
  $usesRoster = array_key_exists('usesRoster', $state) ? (bool)$state['usesRoster'] : null;
  $normalized['round'] = isset($state['round']) && is_numeric($state['round']) ? max(1, (int)$state['round']) : 1;
  $normalized['turnIndex'] = isset($state['turnIndex']) && is_numeric($state['turnIndex']) ? (int)$state['turnIndex'] : 0;
  $normalized['awaitingRoundEnd'] = !empty($state['awaitingRoundEnd']);
  $normalized['stage'] = isset($state['stage']) && is_string($state['stage']) ? $state['stage'] : 'regular';
  $normalized['championId'] = array_key_exists('championId', $state) && $state['championId'] !== null
    ? (int)$state['championId'] : null;

  if (!isset($state['pool']) || !is_array($state['pool'])) {
    $normalized['pool'] = ['nfts' => 0, 'shares' => 0];
  } else {
    $normalized['pool'] = [
      'nfts' => isset($state['pool']['nfts']) ? (int)$state['pool']['nfts'] : 0,
      'shares' => isset($state['pool']['shares']) ? (int)$state['pool']['shares'] : 0
    ];
  }

  if (!isset($state['teams']) || !is_array($state['teams'])) {
    $normalized['teams'] = [];
  } else {
    $teams = array_values($state['teams']);
    foreach ($teams as &$team) {
      $team = [
        'id' => isset($team['id']) ? (int)$team['id'] : null,
        'userId' => isset($team['userId']) ? (int)$team['userId'] : null,
        'playerName' => isset($team['playerName']) ? (string)$team['playerName'] : '',
        'name' => isset($team['name']) ? (string)$team['name'] : '',
        'cash' => isset($team['cash']) ? (float)$team['cash'] : 0.0,
        'btc' => isset($team['btc']) ? (float)$team['btc'] : 0.0,
        'nftHand' => isset($team['nftHand']) ? (int)$team['nftHand'] : 0,
        'poolShares' => isset($team['poolShares']) ? (int)$team['poolShares'] : 0,
        'eliminated' => !empty($team['eliminated'])
      ];
    }
    unset($team);
    $normalized['teams'] = $teams;
  }

  if ($usesRoster === null) {
    $usesRoster = false;
    foreach ($normalized['teams'] as $team) {
      if (!empty($team['userId'])) {
        $usesRoster = true;
        break;
      }
    }
  }
  $normalized['usesRoster'] = $usesRoster;

  if (!isset($state['history']) || !is_array($state['history'])) {
    $normalized['history'] = [];
  } else {
    $history = [];
    foreach ($state['history'] as $entry) {
      if (!is_array($entry)) {
        continue;
      }
      $timestamp = $entry['timestamp'] ?? null;
      if ($timestamp) {
        try {
          $dt = new DateTime($timestamp);
          $timestamp = $dt->format(DATE_ATOM);
        } catch (Exception $e) {
          $timestamp = null;
        }
      } else {
        $timestamp = null;
      }
      $history[] = [
        'round' => isset($entry['round']) && is_numeric($entry['round']) ? (int)$entry['round'] : $normalized['round'],
        'team' => array_key_exists('team', $entry) ? ($entry['team'] === null ? null : (string)$entry['team']) : null,
        'message' => isset($entry['message']) ? (string)$entry['message'] : '',
        'timestamp' => $timestamp
      ];
      if (count($history) >= 200) {
        break;
      }
    }
    $normalized['history'] = $history;
  }

  return $normalized;
}

function liquidity_state_run_daily(&$state, &$lastDate, DateTime $now): bool {
  if (!is_array($state)) {
    return false;
  }
  if (empty($state['teams']) || !is_array($state['teams'])) {
    return false;
  }

  $tz = $now->getTimezone();
  $currentDate = new DateTime($now->format('Y-m-d'), $tz);
  $dates = [];

  if ($lastDate) {
    try {
      $cursor = new DateTime($lastDate, $tz);
    } catch (Exception $e) {
      $cursor = (clone $currentDate)->modify('-1 day');
    }
    $cursor->modify('+1 day');
  } else {
    $cursor = null;
  }

  if ($cursor === null) {
    if ((int)$now->format('Hi') >= 1900) {
      $dates[] = clone $currentDate;
    }
  } else {
    while ($cursor < $currentDate) {
      $dates[] = clone $cursor;
      $cursor->modify('+1 day');
    }
    if ($cursor <= $currentDate && (int)$now->format('Hi') >= 1900) {
      $dates[] = clone $currentDate;
    }
  }

  if (!$dates) {
    return false;
  }

  foreach ($dates as $date) {
    liquidity_apply_settlement($state, $date);
    $lastDate = $date->format('Y-m-d');
  }

  return true;
}

function liquidity_apply_settlement(array &$state, DateTime $date): void {
  if (!isset($state['pool']) || !is_array($state['pool'])) {
    $state['pool'] = ['nfts' => 0, 'shares' => 0];
  }
  $poolNfts = isset($state['pool']['nfts']) ? (int)$state['pool']['nfts'] : 0;
  $poolShares = isset($state['pool']['shares']) ? (int)$state['pool']['shares'] : 0;
  $dividendTotal = $poolNfts * 2000 * 0.10;
  $perShare = $poolShares > 0 ? $dividendTotal / $poolShares : 0;

  foreach ($state['teams'] as &$team) {
    if (!empty($team['eliminated'])) {
      continue;
    }
    $team['cash'] = (float)($team['cash'] ?? 0) - 100;
    $teamShares = isset($team['poolShares']) ? (int)$team['poolShares'] : 0;
    if ($perShare > 0 && $teamShares > 0) {
      $team['cash'] += $perShare * $teamShares;
    }
  }
  unset($team);

  $round = isset($state['round']) ? (int)$state['round'] : 1;
  $state['round'] = $round + 1;
  $state['awaitingRoundEnd'] = false;
  $first = liquidity_first_active_index_php($state['teams']);
  $state['turnIndex'] = $first >= 0 ? $first : 0;

  $stamp = clone $date;
  $stamp->setTime(19, 0, 0);
  $message = 'Liquidação diária de ' . $date->format('d/m/Y') . '. Taxa de ' . liquidity_format_brl(100) . ' aplicada a todos os times ativos. ';
  if ($poolShares > 0) {
    $message .= 'Dividendos totais de ' . liquidity_format_brl($dividendTotal) . ' (' . liquidity_format_brl($perShare) . ' por cota).';
  } else {
    $message .= 'Sem dividendos pois não há cotas na piscina.';
  }

  $entry = [
    'round' => $round,
    'team' => null,
    'message' => $message,
    'timestamp' => $stamp->format(DATE_ATOM)
  ];

  $history = $state['history'] ?? [];
  array_unshift($history, $entry);
  if (count($history) > 200) {
    $history = array_slice($history, 0, 200);
  }
  $state['history'] = $history;
}

function liquidity_first_active_index_php(array $teams): int {
  foreach ($teams as $idx => $team) {
    if (empty($team['eliminated'])) {
      return (int)$idx;
    }
  }
  return -1;
}

function liquidity_format_brl($value): string {
  return 'R$ ' . number_format((float)$value, 2, ',', '.');
}
