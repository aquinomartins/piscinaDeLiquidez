-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Tempo de geração: 29/10/2025 às 09:52
-- Versão do servidor: 8.0.37
-- Versão do PHP: 8.1.33

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `oftalmol_artx`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `accounts`
--

CREATE TABLE `accounts` (
  `id` bigint NOT NULL,
  `owner_type` enum('user','org') DEFAULT 'user',
  `owner_id` bigint NOT NULL,
  `currency` varchar(16) NOT NULL,
  `purpose` enum('cash','bitcoin_wallet','nft_inventory','fees','revenue','escrow') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `accounts`
--

INSERT INTO `accounts` (`id`, `owner_type`, `owner_id`, `currency`, `purpose`) VALUES
(1, 'user', 1, 'BRL', 'cash'),
(2, 'user', 1, 'BRL', 'escrow'),
(3, 'user', 1, 'BTC', 'bitcoin_wallet'),
(4, 'user', 5, 'BRL', 'cash'),
(7, 'user', 5, 'BRL', 'nft_inventory'),
(5, 'user', 5, 'BRL', 'escrow'),
(6, 'user', 5, 'BTC', 'bitcoin_wallet'),
(8, 'user', 9, 'BRL', 'cash'),
(11, 'user', 9, 'BRL', 'nft_inventory'),
(9, 'user', 9, 'BRL', 'escrow'),
(10, 'user', 9, 'BTC', 'bitcoin_wallet');

-- --------------------------------------------------------

--
-- Estrutura para tabela `assets`
--

CREATE TABLE `assets` (
  `id` bigint NOT NULL,
  `type` enum('bitcoin','nft','share','frame','chassis','gallery_space') NOT NULL,
  `symbol` varchar(64) DEFAULT NULL,
  `parent_asset_id` bigint DEFAULT NULL,
  `metadata_json` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `asset_instances`
--

CREATE TABLE `asset_instances` (
  `id` bigint NOT NULL,
  `asset_id` bigint NOT NULL,
  `chain` varchar(32) DEFAULT NULL,
  `contract_addr` varchar(128) DEFAULT NULL,
  `token_id` varchar(128) DEFAULT NULL,
  `serial` varchar(64) DEFAULT NULL,
  `metadata_json` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `asset_moves`
--

CREATE TABLE `asset_moves` (
  `id` bigint NOT NULL,
  `journal_id` bigint NOT NULL,
  `asset_id` bigint DEFAULT NULL,
  `asset_instance_id` bigint DEFAULT NULL,
  `qty` decimal(24,8) NOT NULL DEFAULT '0.00000000',
  `from_account_id` bigint DEFAULT NULL,
  `to_account_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Acionadores `asset_moves`
--
DELIMITER $$
CREATE TRIGGER `trg_positions_upsert` AFTER INSERT ON `asset_moves` FOR EACH ROW BEGIN
  IF NEW.to_account_id IS NOT NULL THEN
    INSERT INTO positions (owner_type, owner_id, asset_id, qty)
    SELECT a.owner_type, a.owner_id, COALESCE(NEW.asset_id,
           (SELECT asset_id FROM asset_instances WHERE id=NEW.asset_instance_id)), NEW.qty
    FROM accounts a WHERE a.id = NEW.to_account_id
    ON DUPLICATE KEY UPDATE qty = qty + NEW.qty;
  END IF;

  IF NEW.from_account_id IS NOT NULL THEN
    INSERT INTO positions (owner_type, owner_id, asset_id, qty)
    SELECT a.owner_type, a.owner_id, COALESCE(NEW.asset_id,
           (SELECT asset_id FROM asset_instances WHERE id=NEW.asset_instance_id)), -NEW.qty
    FROM accounts a WHERE a.id = NEW.from_account_id
    ON DUPLICATE KEY UPDATE qty = qty - NEW.qty;
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estrutura para tabela `auctions`
--

CREATE TABLE `auctions` (
  `id` bigint NOT NULL,
  `seller_id` bigint NOT NULL,
  `asset_id` bigint DEFAULT NULL,
  `asset_instance_id` bigint DEFAULT NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `reserve_price` decimal(24,8) DEFAULT '0.00000000',
  `status` enum('draft','running','ended','settled') DEFAULT 'draft'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `bids`
--

CREATE TABLE `bids` (
  `id` bigint NOT NULL,
  `auction_id` bigint NOT NULL,
  `bidder_id` bigint NOT NULL,
  `amount` decimal(24,8) NOT NULL,
  `status` enum('valid','outbid','winner','cancelled') DEFAULT 'valid',
  `journal_id` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `chassis`
--

CREATE TABLE `chassis` (
  `id` bigint NOT NULL,
  `asset_instance_id` bigint NOT NULL,
  `size` varchar(64) DEFAULT NULL,
  `material` varchar(64) DEFAULT NULL,
  `status` enum('blank','used') DEFAULT 'blank'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `entries`
--

CREATE TABLE `entries` (
  `id` bigint NOT NULL,
  `journal_id` bigint NOT NULL,
  `account_id` bigint NOT NULL,
  `debit` decimal(24,8) NOT NULL DEFAULT '0.00000000',
  `credit` decimal(24,8) NOT NULL DEFAULT '0.00000000'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `frames`
--

CREATE TABLE `frames` (
  `id` bigint NOT NULL,
  `asset_instance_id` bigint NOT NULL,
  `size` varchar(64) DEFAULT NULL,
  `material` varchar(64) DEFAULT NULL,
  `status` enum('free','used') DEFAULT 'free'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `galleries`
--

CREATE TABLE `galleries` (
  `id` bigint NOT NULL,
  `name` varchar(160) NOT NULL,
  `address` varchar(200) DEFAULT NULL,
  `owner_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `gallery_spaces`
--

CREATE TABLE `gallery_spaces` (
  `id` bigint NOT NULL,
  `asset_instance_id` bigint NOT NULL,
  `gallery_id` bigint NOT NULL,
  `label` varchar(64) DEFAULT NULL,
  `size` varchar(64) DEFAULT NULL,
  `status` enum('free','occupied') DEFAULT 'free'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `journals`
--

CREATE TABLE `journals` (
  `id` bigint NOT NULL,
  `occurred_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ref_type` enum('deposit','withdraw','trade','prize','lease','mint','buy','sell','fee') NOT NULL,
  `ref_id` bigint DEFAULT NULL,
  `memo` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `offers`
--

CREATE TABLE `offers` (
  `id` int NOT NULL,
  `seller_id` int NOT NULL,
  `kind` enum('NFT','BTC') NOT NULL,
  `asset_instance_id` int DEFAULT NULL,
  `qty` decimal(24,8) NOT NULL,
  `price_brl` decimal(24,8) NOT NULL,
  `status` enum('open','filled','cancelled') DEFAULT 'open',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `orders`
--

CREATE TABLE `orders` (
  `id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `side` enum('buy','sell') NOT NULL,
  `asset_id` bigint DEFAULT NULL,
  `asset_instance_id` bigint DEFAULT NULL,
  `qty` decimal(24,8) NOT NULL,
  `price` decimal(24,8) NOT NULL,
  `status` enum('open','filled','cancelled') DEFAULT 'open',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `orders`
--

INSERT INTO `orders` (`id`, `user_id`, `side`, `asset_id`, `asset_instance_id`, `qty`, `price`, `status`, `created_at`) VALUES
(1, 3, 'buy', NULL, 2, 1.00000000, 12.00000000, 'open', '2025-10-29 03:02:37');

-- --------------------------------------------------------

--
-- Estrutura para tabela `positions`
--

CREATE TABLE `positions` (
  `id` bigint NOT NULL,
  `owner_type` enum('user','org') DEFAULT 'user',
  `owner_id` bigint NOT NULL,
  `asset_id` bigint NOT NULL,
  `qty` decimal(24,8) NOT NULL DEFAULT '0.00000000'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `prizes`
--

CREATE TABLE `prizes` (
  `id` bigint NOT NULL,
  `name` varchar(120) NOT NULL,
  `rules_json` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `prize_grants`
--

CREATE TABLE `prize_grants` (
  `id` bigint NOT NULL,
  `prize_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `amount` decimal(24,8) DEFAULT '0.00000000',
  `journal_id` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `schools`
--

CREATE TABLE `schools` (
  `id` bigint NOT NULL,
  `name` varchar(160) NOT NULL,
  `city` varchar(120) DEFAULT NULL,
  `metadata_json` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `trades`
--

CREATE TABLE `trades` (
  `id` bigint NOT NULL,
  `buy_order_id` bigint DEFAULT NULL,
  `sell_order_id` bigint DEFAULT NULL,
  `qty` decimal(24,8) NOT NULL,
  `price` decimal(24,8) NOT NULL,
  `journal_id` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `users`
--

CREATE TABLE `users` (
  `id` bigint NOT NULL,
  `name` varchar(120) NOT NULL,
  `email` varchar(160) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed` tinyint DEFAULT '0',
  `is_admin` tinyint DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `created_at`, `confirmed`, `is_admin`) VALUES
(1, 'Demo', 'demo@artx', 'x', '2025-10-29 02:32:49', 0, 0),
(2, 'aqyo', 'aquinomartins.art@gmail.com', '$2y$10$xEl6WrRLdyKfBu17dW7IKe8.hxKsoeXCInt32i/LytJqzYi6RfvQ2', '2025-10-29 02:48:49', 1, 1),
(3, 'maria', 'mariaaqui@gmail.com', '$2y$10$4.QM2P615hITRzV2rdyr/.WP5hInaKL1YYOflglVR.xnApKy8VxZu', '2025-10-29 02:56:54', 0, 0),
(9, 'martys', 'alvorascapital@gmail.com', '$2y$10$0up.acQQw4X1HU9DkTQXduL2sMQtP.mua8qNjr0FRagssFEyK5yzK', '2025-10-29 04:05:08', 1, 0);

-- --------------------------------------------------------

--
-- Estrutura para tabela `user_confirmations`
--

CREATE TABLE `user_confirmations` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `token` varchar(64) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `works`
--

CREATE TABLE `works` (
  `id` bigint NOT NULL,
  `asset_instance_id` bigint NOT NULL,
  `title` varchar(160) NOT NULL,
  `artist_id` bigint NOT NULL,
  `specs_json` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `accounts`
--
ALTER TABLE `accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_owner_cur_purpose` (`owner_type`,`owner_id`,`currency`,`purpose`),
  ADD KEY `owner_type` (`owner_type`,`owner_id`);

--
-- Índices de tabela `assets`
--
ALTER TABLE `assets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `parent_asset_id` (`parent_asset_id`);

--
-- Índices de tabela `asset_instances`
--
ALTER TABLE `asset_instances`
  ADD PRIMARY KEY (`id`),
  ADD KEY `asset_id` (`asset_id`);

--
-- Índices de tabela `asset_moves`
--
ALTER TABLE `asset_moves`
  ADD PRIMARY KEY (`id`),
  ADD KEY `journal_id` (`journal_id`),
  ADD KEY `from_account_id` (`from_account_id`),
  ADD KEY `to_account_id` (`to_account_id`),
  ADD KEY `asset_id` (`asset_id`),
  ADD KEY `asset_instance_id` (`asset_instance_id`);

--
-- Índices de tabela `auctions`
--
ALTER TABLE `auctions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `seller_id` (`seller_id`);

--
-- Índices de tabela `bids`
--
ALTER TABLE `bids`
  ADD PRIMARY KEY (`id`),
  ADD KEY `auction_id` (`auction_id`),
  ADD KEY `bidder_id` (`bidder_id`);

--
-- Índices de tabela `chassis`
--
ALTER TABLE `chassis`
  ADD PRIMARY KEY (`id`),
  ADD KEY `asset_instance_id` (`asset_instance_id`);

--
-- Índices de tabela `entries`
--
ALTER TABLE `entries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `journal_id` (`journal_id`),
  ADD KEY `account_id` (`account_id`);

--
-- Índices de tabela `frames`
--
ALTER TABLE `frames`
  ADD PRIMARY KEY (`id`),
  ADD KEY `asset_instance_id` (`asset_instance_id`);

--
-- Índices de tabela `galleries`
--
ALTER TABLE `galleries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `owner_id` (`owner_id`);

--
-- Índices de tabela `gallery_spaces`
--
ALTER TABLE `gallery_spaces`
  ADD PRIMARY KEY (`id`),
  ADD KEY `asset_instance_id` (`asset_instance_id`),
  ADD KEY `gallery_id` (`gallery_id`);

--
-- Índices de tabela `journals`
--
ALTER TABLE `journals`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `offers`
--
ALTER TABLE `offers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_offers_status` (`status`),
  ADD KEY `idx_offers_kind` (`kind`);

--
-- Índices de tabela `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Índices de tabela `positions`
--
ALTER TABLE `positions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_pos` (`owner_type`,`owner_id`,`asset_id`),
  ADD KEY `owner_type` (`owner_type`,`owner_id`),
  ADD KEY `asset_id` (`asset_id`);

--
-- Índices de tabela `prizes`
--
ALTER TABLE `prizes`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `prize_grants`
--
ALTER TABLE `prize_grants`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `schools`
--
ALTER TABLE `schools`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `trades`
--
ALTER TABLE `trades`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Índices de tabela `user_confirmations`
--
ALTER TABLE `user_confirmations`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `works`
--
ALTER TABLE `works`
  ADD PRIMARY KEY (`id`),
  ADD KEY `asset_instance_id` (`asset_instance_id`),
  ADD KEY `artist_id` (`artist_id`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `accounts`
--
ALTER TABLE `accounts`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT de tabela `assets`
--
ALTER TABLE `assets`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT de tabela `asset_instances`
--
ALTER TABLE `asset_instances`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT de tabela `asset_moves`
--
ALTER TABLE `asset_moves`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `auctions`
--
ALTER TABLE `auctions`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `bids`
--
ALTER TABLE `bids`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `chassis`
--
ALTER TABLE `chassis`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `entries`
--
ALTER TABLE `entries`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `frames`
--
ALTER TABLE `frames`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `galleries`
--
ALTER TABLE `galleries`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `gallery_spaces`
--
ALTER TABLE `gallery_spaces`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `journals`
--
ALTER TABLE `journals`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `offers`
--
ALTER TABLE `offers`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `orders`
--
ALTER TABLE `orders`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de tabela `positions`
--
ALTER TABLE `positions`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `prizes`
--
ALTER TABLE `prizes`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `prize_grants`
--
ALTER TABLE `prize_grants`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `schools`
--
ALTER TABLE `schools`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `trades`
--
ALTER TABLE `trades`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT de tabela `user_confirmations`
--
ALTER TABLE `user_confirmations`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de tabela `works`
--
ALTER TABLE `works`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- Restrições para tabelas despejadas
--

--
-- Restrições para tabelas `assets`
--
ALTER TABLE `assets`
  ADD CONSTRAINT `assets_ibfk_1` FOREIGN KEY (`parent_asset_id`) REFERENCES `assets` (`id`);

--
-- Restrições para tabelas `asset_instances`
--
ALTER TABLE `asset_instances`
  ADD CONSTRAINT `asset_instances_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`);

--
-- Restrições para tabelas `asset_moves`
--
ALTER TABLE `asset_moves`
  ADD CONSTRAINT `asset_moves_ibfk_1` FOREIGN KEY (`journal_id`) REFERENCES `journals` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `asset_moves_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`),
  ADD CONSTRAINT `asset_moves_ibfk_3` FOREIGN KEY (`asset_instance_id`) REFERENCES `asset_instances` (`id`),
  ADD CONSTRAINT `asset_moves_ibfk_4` FOREIGN KEY (`from_account_id`) REFERENCES `accounts` (`id`),
  ADD CONSTRAINT `asset_moves_ibfk_5` FOREIGN KEY (`to_account_id`) REFERENCES `accounts` (`id`);

--
-- Restrições para tabelas `auctions`
--
ALTER TABLE `auctions`
  ADD CONSTRAINT `auctions_ibfk_1` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`);

--
-- Restrições para tabelas `bids`
--
ALTER TABLE `bids`
  ADD CONSTRAINT `bids_ibfk_1` FOREIGN KEY (`auction_id`) REFERENCES `auctions` (`id`),
  ADD CONSTRAINT `bids_ibfk_2` FOREIGN KEY (`bidder_id`) REFERENCES `users` (`id`);

--
-- Restrições para tabelas `chassis`
--
ALTER TABLE `chassis`
  ADD CONSTRAINT `chassis_ibfk_1` FOREIGN KEY (`asset_instance_id`) REFERENCES `asset_instances` (`id`);

--
-- Restrições para tabelas `entries`
--
ALTER TABLE `entries`
  ADD CONSTRAINT `entries_ibfk_1` FOREIGN KEY (`journal_id`) REFERENCES `journals` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `entries_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`);

--
-- Restrições para tabelas `frames`
--
ALTER TABLE `frames`
  ADD CONSTRAINT `frames_ibfk_1` FOREIGN KEY (`asset_instance_id`) REFERENCES `asset_instances` (`id`);

--
-- Restrições para tabelas `galleries`
--
ALTER TABLE `galleries`
  ADD CONSTRAINT `galleries_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`);

--
-- Restrições para tabelas `gallery_spaces`
--
ALTER TABLE `gallery_spaces`
  ADD CONSTRAINT `gallery_spaces_ibfk_1` FOREIGN KEY (`asset_instance_id`) REFERENCES `asset_instances` (`id`),
  ADD CONSTRAINT `gallery_spaces_ibfk_2` FOREIGN KEY (`gallery_id`) REFERENCES `galleries` (`id`);

--
-- Restrições para tabelas `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Restrições para tabelas `positions`
--
ALTER TABLE `positions`
  ADD CONSTRAINT `positions_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`);

--
-- Restrições para tabelas `works`
--
ALTER TABLE `works`
  ADD CONSTRAINT `works_ibfk_1` FOREIGN KEY (`asset_instance_id`) REFERENCES `asset_instances` (`id`),
  ADD CONSTRAINT `works_ibfk_2` FOREIGN KEY (`artist_id`) REFERENCES `users` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
