const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database-sqlite');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 한국 시간 (UTC+9) 변환 함수
function getKoreanTime() {
    const now = new Date();
    // 한국 시간대로 포맷팅 (YYYY-MM-DD HH:mm:ss)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// 데이터베이스 연결 테스트
async function testConnection() {
    try {
        await db.connect();
        console.log('✅ SQLite 데이터베이스 연결 및 초기화 완료!');
    } catch (error) {
        console.error('❌ SQLite 연결 실패:', error.message);
    }
}

// 서버 시작 시 데이터베이스 연결 테스트
testConnection();

// API 엔드포인트

// 1. 사용자 관련 API
// 사용자 등록/로그인
app.post('/api/users/login', async (req, res) => {
    try {
        const { employeeNumber, username } = req.body;

        if (!employeeNumber || employeeNumber.trim() === '') {
            return res.status(400).json({ error: '사원번호를 입력해주세요.' });
        }

        if (!username || username.trim() === '') {
            return res.status(400).json({ error: '사용자명을 입력해주세요.' });
        }

        // 기존 사용자 확인 (사원번호로 조회)
        const existingUser = await db.get(
            'SELECT * FROM users WHERE employee_number = ?',
            [employeeNumber.trim()]
        );

        let user;
        if (existingUser) {
            // 기존 사용자 로그인 - 사용자명 업데이트 (변경 가능)
            user = existingUser;

            // 사용자명과 마지막 로그인 시간 업데이트
            const loginTime = getKoreanTime();
            await db.run(
                'UPDATE users SET username = ?, last_login = ? WHERE user_id = ?',
                [username.trim(), loginTime, user.user_id]
            );

            user.username = username.trim(); // 업데이트된 이름 반영
            user.last_login = loginTime;
        } else {
            // 새 사용자 등록
            const currentTime = getKoreanTime();
            const result = await db.run(
                'INSERT INTO users (employee_number, username, created_at, last_login) VALUES (?, ?, ?, ?)',
                [employeeNumber.trim(), username.trim(), currentTime, currentTime]
            );

            user = {
                user_id: result.lastID,
                employee_number: employeeNumber.trim(),
                username: username.trim(),
                high_score: 0,
                total_games: 0,
                created_at: currentTime,
                last_login: currentTime
            };
        }

        res.json({ success: true, user });

    } catch (error) {
        console.error('사용자 로그인 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 모든 사용자 조회 (관리자용)
app.get('/api/users', async (req, res) => {
    try {
        const users = await db.query(
            'SELECT user_id, employee_number, username, high_score, total_games, created_at, last_login FROM users ORDER BY high_score DESC'
        );

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

        // 관련된 게임 기록도 함께 삭제 (CASCADE로 자동 삭제됨)
        await db.run('DELETE FROM users WHERE user_id = ?', [userId]);

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

        // 게임 기록 저장
        const playedTime = getKoreanTime();
        const gameResult = await db.run(
            'INSERT INTO game_records (user_id, score, level_reached, lines_cleared, game_duration, played_at) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, score, level || 1, linesCleared || 0, gameTime || 0, playedTime]
        );

        // 사용자 통계 업데이트
        const userStats = await db.get(
            'SELECT high_score, total_games FROM users WHERE user_id = ?',
            [userId]
        );

        if (!userStats) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        const currentHighScore = userStats.high_score || 0;
        const newHighScore = Math.max(currentHighScore, score);
        const newTotalGames = (userStats.total_games || 0) + 1;

        await db.run(
            'UPDATE users SET high_score = ?, total_games = ? WHERE user_id = ?',
            [newHighScore, newTotalGames, userId]
        );

        res.json({
            success: true,
            gameId: gameResult.lastID,
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

        let query = `
            SELECT gr.*, u.username, u.employee_number
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

        const games = await db.query(query, params);
        res.json(games);
    } catch (error) {
        console.error('게임 기록 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 게임 기록 삭제 (관리자용)
app.delete('/api/games', async (req, res) => {
    try {
        await db.run('DELETE FROM game_records');

        // 사용자 통계 초기화
        await db.run('UPDATE users SET high_score = 0, total_games = 0');

        res.json({ success: true, message: '모든 게임 기록이 삭제되었습니다.' });
    } catch (error) {
        console.error('게임 기록 삭제 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 3. 랭킹 API
// 사용자별 최고 점수 랭킹 (기존)
app.get('/api/rankings', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const rankings = await db.query(
            `SELECT
                u.username,
                u.employee_number,
                u.high_score,
                u.total_games,
                u.created_at,
                (SELECT played_at FROM game_records WHERE user_id = u.user_id AND score = u.high_score ORDER BY played_at DESC LIMIT 1) as high_score_date
            FROM users u
            WHERE u.high_score > 0
            ORDER BY u.high_score DESC
            LIMIT ?`,
            [parseInt(limit)]
        );

        res.json(rankings);
    } catch (error) {
        console.error('랭킹 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 전체 게임 기록 랭킹 (모든 플레이 기록)
app.get('/api/rankings/all', async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        const rankings = await db.query(
            `SELECT
                gr.record_id,
                u.username,
                u.employee_number,
                gr.score,
                gr.level_reached,
                gr.lines_cleared,
                gr.game_duration,
                gr.played_at
            FROM game_records gr
            JOIN users u ON gr.user_id = u.user_id
            ORDER BY gr.score DESC, gr.played_at DESC
            LIMIT ?`,
            [parseInt(limit)]
        );

        res.json(rankings);
    } catch (error) {
        console.error('전체 랭킹 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 랭킹 초기화 (관리자용)
app.delete('/api/rankings', async (req, res) => {
    try {
        await db.run('UPDATE users SET high_score = 0');

        res.json({ success: true, message: '랭킹이 초기화되었습니다.' });
    } catch (error) {
        console.error('랭킹 초기화 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 4. 통계 API
app.get('/api/stats', async (req, res) => {
    try {
        // 기본 통계
        const userCount = await db.get('SELECT COUNT(*) as total FROM users');
        const gameCount = await db.get('SELECT COUNT(*) as total FROM game_records');
        const highScore = await db.get('SELECT MAX(high_score) as max_score FROM users');

        // 오늘 게임 수
        const todayGames = await db.get(
            "SELECT COUNT(*) as today_count FROM game_records WHERE DATE(played_at) = DATE('now')"
        );

        // 평균 게임 시간 (초)
        const avgTime = await db.get(
            'SELECT AVG(game_duration) as avg_duration FROM game_records WHERE game_duration > 0'
        );

        res.json({
            totalUsers: userCount.total,
            totalGames: gameCount.total,
            highScore: highScore.max_score || 0,
            todayGames: todayGames.today_count,
            avgGameTime: Math.round(avgTime?.avg_duration || 0)
        });
    } catch (error) {
        console.error('통계 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 5. 시스템 로그 API (간단한 구현)
app.get('/api/logs', async (req, res) => {
    try {
        // 실제 환경에서는 로그 파일을 읽거나 별도의 로그 테이블을 사용
        const logs = [
            { time: new Date(), level: 'INFO', message: '시스템 정상 작동 중' },
            { time: new Date(Date.now() - 300000), level: 'INFO', message: 'SQLite 연결 상태 양호' },
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
    // 캐시 방지 헤더 설정
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
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
    db.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 서버를 종료합니다...');
    db.close();
    process.exit(0);
});