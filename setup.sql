-- 테트리스 게임 데이터베이스 설정
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
    game_duration INT DEFAULT 0, -- 게임 시간 (초)
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

-- 4. 유용한 뷰 생성

-- 사용자 랭킹 뷰
CREATE OR REPLACE VIEW user_rankings AS
SELECT
    u.user_id,
    u.username,
    u.high_score,
    u.total_games,
    u.created_at,
    RANK() OVER (ORDER BY u.high_score DESC) as ranking,
    (SELECT played_at FROM game_records WHERE user_id = u.user_id AND score = u.high_score ORDER BY played_at DESC LIMIT 1) as high_score_date
FROM users u
WHERE u.high_score > 0
ORDER BY u.high_score DESC;

-- 게임 통계 뷰
CREATE OR REPLACE VIEW game_statistics AS
SELECT
    COUNT(DISTINCT user_id) as total_players,
    COUNT(*) as total_games,
    MAX(score) as highest_score,
    AVG(score) as average_score,
    AVG(level_reached) as average_level,
    AVG(lines_cleared) as average_lines,
    AVG(game_duration) as average_duration,
    COUNT(CASE WHEN DATE(played_at) = CURDATE() THEN 1 END) as games_today,
    COUNT(CASE WHEN played_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as games_this_week
FROM game_records;

-- 일별 게임 통계 뷰
CREATE OR REPLACE VIEW daily_game_stats AS
SELECT
    DATE(played_at) as game_date,
    COUNT(*) as games_count,
    COUNT(DISTINCT user_id) as unique_players,
    MAX(score) as daily_high_score,
    AVG(score) as daily_avg_score
FROM game_records
WHERE played_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(played_at)
ORDER BY game_date DESC;

-- 5. 저장 프로시저

-- 사용자 게임 완료 후 통계 업데이트 프로시저
DELIMITER //
CREATE PROCEDURE UpdateUserStats(
    IN p_user_id INT,
    IN p_score INT,
    IN p_level INT,
    IN p_lines INT,
    IN p_duration INT
)
BEGIN
    DECLARE current_high_score INT DEFAULT 0;
    DECLARE is_new_record BOOLEAN DEFAULT FALSE;

    -- 현재 최고 점수 조회
    SELECT high_score INTO current_high_score
    FROM users
    WHERE user_id = p_user_id;

    -- 새로운 기록인지 확인
    IF p_score > current_high_score THEN
        SET is_new_record = TRUE;
    END IF;

    -- 게임 기록 삽입
    INSERT INTO game_records (user_id, score, level_reached, lines_cleared, game_duration, played_at)
    VALUES (p_user_id, p_score, p_level, p_lines, p_duration, NOW());

    -- 사용자 통계 업데이트
    UPDATE users
    SET
        high_score = GREATEST(high_score, p_score),
        total_games = total_games + 1,
        last_login = NOW()
    WHERE user_id = p_user_id;

    -- 결과 반환
    SELECT is_new_record as new_record, current_high_score as old_record;
END //
DELIMITER ;

-- 6. 인덱스 최적화 (이미 테이블 생성 시 포함됨)

-- 7. 권한 설정 (필요에 따라 조정)
-- CREATE USER 'tetris_user'@'localhost' IDENTIFIED BY 'secure_password';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tetris_game.* TO 'tetris_user'@'localhost';
-- FLUSH PRIVILEGES;

-- 8. 설정 완료 메시지
SELECT 'MariaDB 테트리스 게임 데이터베이스 설정이 완료되었습니다!' as message;

-- 9. 초기 데이터 확인 쿼리
SELECT '=== 사용자 목록 ===' as info;
SELECT user_id, username, high_score, total_games FROM users ORDER BY high_score DESC;

SELECT '=== 게임 기록 ===' as info;
SELECT gr.game_id, u.username, gr.score, gr.level_reached, gr.played_at
FROM game_records gr
JOIN users u ON gr.user_id = u.user_id
ORDER BY gr.played_at DESC
LIMIT 10;

SELECT '=== 랭킹 ===' as info;
SELECT ranking, username, high_score FROM user_rankings LIMIT 5;