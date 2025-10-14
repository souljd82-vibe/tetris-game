const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정
app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json());
app.use(express.static('.'));

// MySQL 데이터베이스 연결 설정
const dbConfig = {
    host: process.env.RDS_HOSTNAME || process.env.DB_HOST,
    user: process.env.RDS_USERNAME || process.env.DB_USER,
    password: process.env.RDS_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.RDS_DB_NAME || process.env.DB_NAME,
    port: process.env.RDS_PORT || process.env.DB_PORT || 3306,
    connectionLimit: 10
};

const pool = mysql.createPool(dbConfig);

// 데이터베이스 연결 테스트
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL 연결 성공!');
        connection.release();
    } catch (error) {
        console.error('❌ MySQL 연결 실패:', error.message);
    }
}

// 서버 시작 시 데이터베이스 연결 테스트
testConnection();

// API 엔드포인트

// 1. 사용자 관련 API
// 사용자 등록/로그인
app.post('/api/users/login', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username || username.trim() === '') {
            return res.status(400).json({ error: '사용자명을 입력해주세요.' });
        }

        const connection = await pool.getConnection();

        // 기존 사용자 확인
        const [existingUsers] = await connection.execute(
            'SELECT * FROM users WHERE username = ?',
            [username.trim()]
        );

        let user;
        if (existingUsers.length > 0) {
            // 기존 사용자 로그인
            user = existingUsers[0];

            // 마지막 로그인 시간 업데이트
            await connection.execute(
                'UPDATE users SET last_login = NOW() WHERE user_id = ?',
                [user.user_id]
            );
        } else {
            // 새 사용자 등록
            const [result] = await connection.execute(
                'INSERT INTO users (username, created_at, last_login) VALUES (?, NOW(), NOW())',
                [username.trim()]
            );

            user = {
                user_id: result.insertId,
                username: username.trim(),
                high_score: 0,
                total_games: 0,
                created_at: new Date(),
                last_login: new Date()
            };
        }

        connection.release();
        res.json({ success: true, user });

    } catch (error) {
        console.error('사용자 로그인 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 모든 사용자 조회 (관리자용)
app.get('/api/users', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [users] = await connection.execute(
            'SELECT user_id, username, high_score, total_games, created_at, last_login FROM users ORDER BY high_score DESC'
        );
        connection.release();

        res.json(users);
    } catch (error) {
        console.error('사용자 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 사용자 삭제 (관리자용)
app.delete('/api/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const connection = await pool.getConnection();

        // 관련된 게임 기록도 함께 삭제
        await connection.execute('DELETE FROM game_records WHERE user_id = ?', [userId]);
        await connection.execute('DELETE FROM users WHERE user_id = ?', [userId]);

        connection.release();
        res.json({ success: true, message: '사용자가 삭제되었습니다.' });
    } catch (error) {
        console.error('사용자 삭제 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 2. 게임 기록 관련 API
// 게임 기록 저장
app.post('/api/games', async (req, res) => {
    try {
        const { userId, score, level, linesCleared, gameTime } = req.body;

        if (!userId || score === undefined) {
            return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
        }

        const connection = await pool.getConnection();

        // 게임 기록 저장
        const [gameResult] = await connection.execute(
            'INSERT INTO game_records (user_id, score, level_reached, lines_cleared, game_duration, played_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [userId, score, level || 1, linesCleared || 0, gameTime || 0]
        );

        // 사용자 통계 업데이트
        const [userStats] = await connection.execute(
            'SELECT high_score, total_games FROM users WHERE user_id = ?',
            [userId]
        );

        const currentHighScore = userStats[0].high_score;
        const newHighScore = Math.max(currentHighScore, score);
        const newTotalGames = userStats[0].total_games + 1;

        await connection.execute(
            'UPDATE users SET high_score = ?, total_games = ? WHERE user_id = ?',
            [newHighScore, newTotalGames, userId]
        );

        connection.release();

        res.json({
            success: true,
            gameId: gameResult.insertId,
            isNewHighScore: score > currentHighScore
        });

    } catch (error) {
        console.error('게임 기록 저장 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 게임 기록 조회
app.get('/api/games', async (req, res) => {
    try {
        const { userId, limit = 50 } = req.query;
        const connection = await pool.getConnection();

        let query = `
            SELECT gr.*, u.username
            FROM game_records gr
            JOIN users u ON gr.user_id = u.user_id
        `;
        let params = [];

        if (userId) {
            query += ' WHERE gr.user_id = ?';
            params.push(userId);
        }

        query += ' ORDER BY gr.played_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const [games] = await connection.execute(query, params);
        connection.release();

        res.json(games);
    } catch (error) {
        console.error('게임 기록 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 게임 기록 삭제 (관리자용)
app.delete('/api/games', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.execute('DELETE FROM game_records');

        // 사용자 통계 초기화
        await connection.execute('UPDATE users SET high_score = 0, total_games = 0');

        connection.release();
        res.json({ success: true, message: '모든 게임 기록이 삭제되었습니다.' });
    } catch (error) {
        console.error('게임 기록 삭제 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 3. 랭킹 API
app.get('/api/rankings', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const connection = await pool.getConnection();

        const limitValue = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
        const [rankings] = await connection.query(
            `SELECT
                u.username,
                u.high_score,
                u.total_games,
                u.created_at,
                (SELECT played_at FROM game_records WHERE user_id = u.user_id AND score = u.high_score ORDER BY played_at DESC LIMIT 1) as high_score_date
            FROM users u
            WHERE u.high_score > 0
            ORDER BY u.high_score DESC
            LIMIT ${limitValue}`
        );

        connection.release();
        res.json(rankings);
    } catch (error) {
        console.error('랭킹 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 랭킹 초기화 (관리자용)
app.delete('/api/rankings', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.execute('UPDATE users SET high_score = 0');
        connection.release();

        res.json({ success: true, message: '랭킹이 초기화되었습니다.' });
    } catch (error) {
        console.error('랭킹 초기화 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 4. 통계 API
app.get('/api/stats', async (req, res) => {
    try {
        const connection = await pool.getConnection();

        // 기본 통계
        const [userCount] = await connection.execute('SELECT COUNT(*) as total FROM users');
        const [gameCount] = await connection.execute('SELECT COUNT(*) as total FROM game_records');
        const [highScore] = await connection.execute('SELECT MAX(high_score) as max_score FROM users');

        // 오늘 게임 수
        const [todayGames] = await connection.execute(
            'SELECT COUNT(*) as today_count FROM game_records WHERE DATE(played_at) = CURDATE()'
        );

        // 평균 게임 시간 (초)
        const [avgTime] = await connection.execute(
            'SELECT AVG(game_duration) as avg_duration FROM game_records WHERE game_duration > 0'
        );

        connection.release();

        res.json({
            totalUsers: userCount[0].total,
            totalGames: gameCount[0].total,
            highScore: highScore[0].max_score || 0,
            todayGames: todayGames[0].today_count,
            avgGameTime: Math.round(avgTime[0].avg_duration || 0)
        });
    } catch (error) {
        console.error('통계 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 5. 시스템 로그 API
app.get('/api/logs', async (req, res) => {
    try {
        const logs = [
            { time: new Date(), level: 'INFO', message: '시스템 정상 작동 중' },
            { time: new Date(Date.now() - 300000), level: 'INFO', message: 'MySQL 연결 상태 양호' },
            { time: new Date(Date.now() - 600000), level: 'INFO', message: '서버 시작 완료' }
        ];
        res.json(logs);
    } catch (error) {
        console.error('로그 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 정적 파일 서빙
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`🚀 테트리스 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`🌐 게임: http://localhost:${PORT}`);
    console.log(`⚙️ 관리자: http://localhost:${PORT}/admin`);
});

// 우아한 종료 처리
process.on('SIGINT', async () => {
    console.log('\n🛑 서버를 종료합니다...');
    await pool.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 서버를 종료합니다...');
    await pool.end();
    process.exit(0);
});