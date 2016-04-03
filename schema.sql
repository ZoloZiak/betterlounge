
DROP TABLE IF EXISTS `user`;
CREATE TABLE `user` (
  `steam_id` varchar(17) NOT NULL,
  `created_at` datetime, 
  `trade_link` varchar(128) NOT NULL,
  `credit` decimal(6,2) NOT NULL,
  PRIMARY KEY (`steam_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `bet`;
CREATE TABLE `bet` (
  `steam_id` varchar(17) NOT NULL,
  `match_id` int NOT NULL,
  `team` int(1) NOT NULL,
  `value` decimal(6,2) NOT NULL,
  PRIMARY KEY (`steam_id`, `match_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `match`;
CREATE TABLE `match` (
  `id` int not null AUTO_INCREMENT,
  `type` varchar(16),
  `state` varchar(8),
  `team1` int NOT NULL,
  `team2` int NOT NULL,
  `notes` varchar(255) NOT NULL,
  `best_of` varchar(1) NULL,
  `start_at` datetime,
  `winner` int default NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `team`;
CREATE TABLE `team` (
  `id` int not null AUTO_INCREMENT,
  `name` varchar(32),
  `logo` varchar(64),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;