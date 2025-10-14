-- 테트리스 게임 데이터베이스 기본 설정
-- MariaDB/MySQL 용 스키마

-- 데이터베이스 생성
CREATE DATABASE IF NOT EXISTS tetris_game
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- 데이터베이스 사용
USE tetris_game;

-- 1. 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    high_score INT DEFAULT 0,
    total_games INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_username (username),
    INDEX idx_high_score (high_score),
    INDEX idx_last_login (last_login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 게임 기록 테이블
CREATE TABLE IF NOT EXISTS game_records (
    game_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    score INT NOT NULL DEFAULT 0,
    level_reached INT DEFAULT 1,
    lines_cleared INT DEFAULT 0,
    game_duration INT DEFAULT 0,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_score (score),
    INDEX idx_played_at (played_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 샘플 데이터 삽입
INSERT INTO users (username, high_score, total_games, created_at, last_login) VALUES
('Player1', 15000, 25, '2024-01-15 10:00:00', '2024-03-20 14:30:00'),
('Player2', 12000, 18, '2024-02-01 11:15:00', '2024-03-19 16:45:00'),
('Player3', 18000, 32, '2024-02-10 09:30:00', '2024-03-20 11:20:00'),
('Player4', 9000, 12, '2024-03-01 13:45:00', '2024-03-18 19:15:00'),
('Player5', 22000, 41, '2024-03-15 16:20:00', '2024-03-20 20:10:00');

-- 샘플 게임 기록 삽입
INSERT INTO game_records (user_id, score, level_reached, lines_cleared, game_duration, played_at) VALUES
(1, 15000, 8, 45, 420, '2024-03-20 14:30:00'),
(2, 12000, 6, 38, 380, '2024-03-19 16:45:00'),
(3, 18000, 9, 52, 480, '2024-03-20 11:20:00'),
(4, 9000, 5, 28, 320, '2024-03-18 19:15:00'),
(5, 22000, 10, 68, 520, '2024-03-20 20:10:00'),
(1, 8500, 5, 25, 280, '2024-03-19 10:15:00'),
(2, 11200, 6, 35, 360, '2024-03-18 15:20:00'),
(3, 16800, 8, 48, 450, '2024-03-19 13:40:00');

SELECT 'MySQL 테트리스 게임 데이터베이스 설정이 완료되었습니다!' as message;
SELECT '=== 사용자 목록 ===' as info;
SELECT user_id, username, high_score, total_games FROM users ORDER BY high_score DESC;
