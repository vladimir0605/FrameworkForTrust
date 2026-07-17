
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_hash` char(66) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quadrant_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lat` decimal(9,6) DEFAULT NULL,
  `lon` decimal(9,6) DEFAULT NULL,
  `subcell_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `h3_resolution` tinyint unsigned DEFAULT NULL,
  `kind` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` bigint NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `topic_tags` text COLLATE utf8mb4_unicode_ci,
  `source_wallet` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_reputation_ui` float DEFAULT NULL,
  `source_reputation_onchain` float DEFAULT NULL,
  `ui_reputation` double DEFAULT NULL,
  `onchain_reputation` double DEFAULT NULL,
  `combined_reputation` double DEFAULT NULL,
  `bonus_local` double DEFAULT NULL,
  `cluster_bonus` double DEFAULT NULL,
  `stake` decimal(20,8) DEFAULT NULL,
  `trust_score` float DEFAULT NULL,
  `vehicle_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `route_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delay_minutes` float DEFAULT NULL,
  `severity` tinyint DEFAULT NULL,
  `moderation_status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `moderation_reason` text COLLATE utf8mb4_unicode_ci,
  `moderated_by_wallet` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `moderated_at` timestamp NULL DEFAULT NULL,
  `raw_payload` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_events_event_id` (`event_id`),
  KEY `idx_events_quadrant_id` (`quadrant_id`),
  KEY `idx_events_ts` (`timestamp`),
  KEY `idx_events_route` (`route_id`),
  KEY `idx_events_wallet_created_at` (`source_wallet`,`created_at`),
  KEY `idx_events_event_hash` (`event_hash`)
) ENGINE=InnoDB AUTO_INCREMENT=166 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fft_auth_nonces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fft_auth_nonces` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `wallet_address` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nonce` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `used_ip` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wallet_nonce` (`wallet_address`,`nonce`),
  KEY `idx_wallet_expires` (`wallet_address`,`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fft_quadrant_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fft_quadrant_permissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `wallet_address` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quadrant_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `permission` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fft_quadperm` (`wallet_address`,`quadrant_id`,`permission`),
  KEY `idx_fft_qp_quadrant` (`quadrant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fft_user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fft_user_roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `role_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `extra_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_fft_user_roles_user` (`user_id`),
  CONSTRAINT `fk_fft_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `fft_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fft_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fft_users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `wallet_address` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wallet_address` (`wallet_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `gcd_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gcd_ledger` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `wallet_address` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entry_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(20,8) NOT NULL,
  `balance_after` decimal(20,8) DEFAULT NULL,
  `metadata` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gcd_ledger_wallet_type_created` (`wallet_address`,`entry_type`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=71 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quadrants_indexer_state`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quadrants_indexer_state` (
  `id` tinyint unsigned NOT NULL,
  `last_scanned_block` bigint unsigned NOT NULL DEFAULT '0',
  `last_run_at` timestamp NULL DEFAULT NULL,
  `last_error` text COLLATE utf8mb4_unicode_ci,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quadrants_l0`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quadrants_l0` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `token_id` bigint unsigned DEFAULT NULL,
  `quadrant_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lat` smallint NOT NULL,
  `lon` smallint NOT NULL,
  `region_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Unknown',
  `ipfs_cid` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_wallet` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `short_description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quadrant_tags` text COLLATE utf8mb4_unicode_ci,
  `quadrant_category` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `local_rating` tinyint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_quadrants_l0_quadrant_id` (`quadrant_id`),
  KEY `idx_quadrants_l0_token_id` (`token_id`),
  KEY `idx_quadrants_l0_region_type` (`region_type`)
) ENGINE=InnoDB AUTO_INCREMENT=615 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quadrants_minted`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quadrants_minted` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `token_id` decimal(40,0) NOT NULL,
  `minted_block` bigint unsigned NOT NULL,
  `tx_hash` char(66) COLLATE utf8mb4_unicode_ci NOT NULL,
  `log_index` int unsigned NOT NULL,
  `owner_wallet` char(42) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolution` bigint unsigned DEFAULT NULL,
  `cell_id` decimal(40,0) DEFAULT NULL,
  `lat` double DEFAULT NULL,
  `lon` double DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_quadrants_minted_token` (`token_id`),
  UNIQUE KEY `uq_quadrants_minted_log` (`tx_hash`,`log_index`),
  KEY `idx_quadrants_minted_block` (`minted_block`)
) ENGINE=InnoDB AUTO_INCREMENT=328 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

