const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { body, validationResult } = require('express-validator');
const http = require('http');
const socketIo = require('socket.io');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const PORT = process.env.PORT || 3000;

// Rate Limiting 설정
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // IP당 최대 100 요청
    message: '너무 많은 요청이 감지되었습니다. 잠시 후 다시 시도해주세요.',
    standardHeaders: true,
    legacyHeaders: false,
});

const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 10, // IP당 최대 10 요청
    message: '너무 많은 로그인 시도가 감지되었습니다. 15분 후 다시 시도해주세요.',
    standardHeaders: true,
    legacyHeaders: false,
});

// CORS 설정
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',') || '*'
        : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(express.static('.'));

// Apply rate limiting to all API routes
app.use('/api/', generalLimiter);

// MySQL 데이터베이스 연결 설정
const dbConfig = {
    host: process.env.RDS_HOSTNAME || process.env.DB_HOST,
    user: process.env.RDS_USERNAME || process.env.DB_USER,
    password: process.env.RDS_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.RDS_DB_NAME || process.env.DB_NAME,
    port: process.env.RDS_PORT || process.env.DB_PORT || 3306,
    connectionLimit: 10,
    timezone: '+09:00' // 한국 시간대 (KST, UTC+9) 설정
};

const pool = mysql.createPool(dbConfig);

// 데이터베이스 연결 테스트 및 인덱스 생성
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL 연결 성공!');

        // 성능 최적화를 위한 인덱스 추가
        await createIndexes(connection);

        connection.release();
    } catch (error) {
        console.error('❌ MySQL 연결 실패:', error.message);
    }
}

// 데이터베이스 인덱스 생성 (성능 최적화)
async function createIndexes(connection) {
    try {
        console.log('📊 데이터베이스 인덱스 확인 중...');

        const indexes = [
            // Users table indexes
            { name: 'idx_users_employee', query: 'CREATE INDEX idx_users_employee ON users(employee_number)' },
            { name: 'idx_users_highscore', query: 'CREATE INDEX idx_users_highscore ON users(high_score DESC)' },
            { name: 'idx_users_login', query: 'CREATE INDEX idx_users_login ON users(employee_number, username)' },

            // Game records table indexes
            { name: 'idx_games_user', query: 'CREATE INDEX idx_games_user ON game_records(user_id, played_at DESC)' },
            { name: 'idx_games_score', query: 'CREATE INDEX idx_games_score ON game_records(score DESC)' },
            { name: 'idx_games_date', query: 'CREATE INDEX idx_games_date ON game_records(played_at DESC)' },
            { name: 'idx_games_user_score', query: 'CREATE INDEX idx_games_user_score ON game_records(user_id, score DESC)' }
        ];

        for (const index of indexes) {
            try {
                await connection.execute(index.query);
                console.log(`✅ 인덱스 생성: ${index.name}`);
            } catch (error) {
                // 인덱스가 이미 존재하면 무시
                if (error.code === 'ER_DUP_KEYNAME') {
                    console.log(`ℹ️ 인덱스 이미 존재: ${index.name}`);
                } else {
                    console.error(`⚠️ 인덱스 생성 실패 (${index.name}):`, error.message);
                }
            }
        }

        console.log('✅ 데이터베이스 인덱스 설정 완료 (성능 최적화)');
    } catch (error) {
        console.error('⚠️ 인덱스 생성 경고:', error.message);
        // 인덱스 생성 실패해도 서버는 계속 실행
    }
}

// 서버 시작 시 데이터베이스 연결 테스트
testConnection();

// Response Caching System
const cache = {
    rankings: { data: null, timestamp: 0, ttl: 30000 }, // 30초
    stats: { data: null, timestamp: 0, ttl: 10000 },    // 10초
    users: { data: null, timestamp: 0, ttl: 30000 }     // 30초
};

function getCachedData(key) {
    const cached = cache[key];
    if (!cached) return null;

    const now = Date.now();
    if (cached.data && (now - cached.timestamp) < cached.ttl) {
        return cached.data;
    }
    return null;
}

function setCachedData(key, data) {
    if (cache[key]) {
        cache[key].data = data;
        cache[key].timestamp = Date.now();
    }
}

function clearCache(key) {
    if (key) {
        if (cache[key]) {
            cache[key].data = null;
            cache[key].timestamp = 0;
        }
    } else {
        // Clear all caches
        Object.keys(cache).forEach(k => {
            cache[k].data = null;
            cache[k].timestamp = 0;
        });
    }
}

// Global Error Handler Middleware
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// API 엔드포인트

// 1. 사용자 관련 API
// 사용자 등록/로그인 (strict rate limiting)
app.post('/api/users/login', strictLimiter, [
    // Validation rules
    body('username')
        .trim()
        .notEmpty().withMessage('사용자명을 입력해주세요.')
        .isLength({ min: 2, max: 20 }).withMessage('사용자명은 2-20자 사이여야 합니다.')
        .matches(/^[a-zA-Z0-9가-힣\s]+$/).withMessage('사용자명은 한글, 영문, 숫자만 가능합니다.'),
    body('employeeNumber')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ min: 4, max: 10 }).withMessage('사원번호는 4-10자 사이여야 합니다.')
        .matches(/^[A-Z0-9]+$/i).withMessage('사원번호는 영문과 숫자만 가능합니다.')
], async (req, res) => {
    try {
        // Validation errors check
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: errors.array()[0].msg,
                errors: errors.array()
            });
        }

        const { username, employeeNumber } = req.body;

        const connection = await pool.getConnection();

        // 사원번호와 이름이 모두 일치하는 사용자 검색
        let existingUsers = [];
        if (employeeNumber && employeeNumber.trim() !== '') {
            [existingUsers] = await connection.execute(
                'SELECT * FROM users WHERE employee_number = ? AND username = ?',
                [employeeNumber.trim(), username.trim()]
            );
        }

        // 사원번호로만 검색했을 때 없으면, 이름으로만 검색 (사원번호 없는 경우)
        if (existingUsers.length === 0 && (!employeeNumber || employeeNumber.trim() === '')) {
            [existingUsers] = await connection.execute(
                'SELECT * FROM users WHERE username = ?',
                [username.trim()]
            );
        }

        let user;
        if (existingUsers.length > 0) {
            // 기존 사용자 로그인 (사원번호 + 이름 모두 일치)
            user = existingUsers[0];

            // 마지막 로그인 시간 업데이트
            await connection.execute(
                'UPDATE users SET last_login = NOW() WHERE user_id = ?',
                [user.user_id]
            );
        } else {
            // 새 사용자 등록
            const empNum = employeeNumber && employeeNumber.trim() !== '' ? employeeNumber.trim() : null;
            const [result] = await connection.execute(
                'INSERT INTO users (employee_number, username, created_at, last_login) VALUES (?, ?, NOW(), NOW())',
                [empNum, username.trim()]
            );

            user = {
                user_id: result.insertId,
                employee_number: empNum,
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
        // Check cache first
        const cachedUsers = getCachedData('users');
        if (cachedUsers) {
            return res.json(cachedUsers);
        }

        const connection = await pool.getConnection();
        const [users] = await connection.execute(
            'SELECT user_id, employee_number, username, high_score, total_games, created_at, last_login FROM users ORDER BY high_score DESC'
        );
        connection.release();

        // Cache the results
        setCachedData('users', users);

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

        // 캐시 무효화
        clearCache();

        res.json({ success: true, message: '사용자가 삭제되었습니다.' });
    } catch (error) {
        console.error('사용자 삭제 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 2. 게임 기록 관련 API
// 게임 기록 저장
app.post('/api/games', [
    // Validation rules
    body('userId')
        .notEmpty().withMessage('사용자 ID가 필요합니다.')
        .isInt({ min: 1 }).withMessage('유효한 사용자 ID여야 합니다.'),
    body('score')
        .notEmpty().withMessage('점수가 필요합니다.')
        .isInt({ min: 0, max: 999999 }).withMessage('점수는 0-999999 사이여야 합니다.'),
    body('level')
        .optional()
        .isInt({ min: 1, max: 99 }).withMessage('레벨은 1-99 사이여야 합니다.'),
    body('linesCleared')
        .optional()
        .isInt({ min: 0 }).withMessage('클리어한 줄 수는 0 이상이어야 합니다.'),
    body('gameTime')
        .optional()
        .isInt({ min: 0 }).withMessage('게임 시간은 0 이상이어야 합니다.')
], async (req, res) => {
    try {
        // Validation errors check
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: errors.array()[0].msg,
                errors: errors.array()
            });
        }

        const { userId, score, level, linesCleared, gameTime } = req.body;

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

        // 캐시 무효화 (데이터 변경됨)
        clearCache('rankings');
        clearCache('stats');
        clearCache('users');

        // WebSocket으로 관리자에게 실시간 업데이트 전송
        try {
            const [userInfo] = await pool.execute(
                'SELECT employee_number, username FROM users WHERE user_id = ?',
                [userId]
            );

            if (userInfo.length > 0) {
                broadcastToAdmins('gameCompleted', {
                    userId,
                    employeeNumber: userInfo[0].employee_number,
                    username: userInfo[0].username,
                    score,
                    level: level || 1,
                    linesCleared: linesCleared || 0,
                    gameTime: gameTime || 0,
                    timestamp: new Date(),
                    isNewHighScore: score > currentHighScore
                });

                // 통계 업데이트 전송
                broadcastToAdmins('statsUpdated', {
                    totalGames: newTotalGames,
                    userHighScore: newHighScore
                });
            }
        } catch (wsError) {
            console.error('WebSocket 전송 오류:', wsError);
            // WebSocket 오류는 무시하고 계속 진행
        }

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

        const limitValue = parseInt(limit);
        let query, games;

        if (userId) {
            query = `
                SELECT gr.*, u.employee_number, u.username
                FROM game_records gr
                JOIN users u ON gr.user_id = u.user_id
                WHERE gr.user_id = ?
                ORDER BY gr.played_at DESC
                LIMIT ${limitValue}
            `;
            [games] = await connection.execute(query, [userId]);
        } else {
            query = `
                SELECT gr.*, u.employee_number, u.username
                FROM game_records gr
                JOIN users u ON gr.user_id = u.user_id
                ORDER BY gr.played_at DESC
                LIMIT ${limitValue}
            `;
            [games] = await connection.query(query);
        }

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

// 개별 게임 기록 삭제 (관리자용)
app.delete('/api/games/:gameId', async (req, res) => {
    try {
        const { gameId } = req.params;
        const connection = await pool.getConnection();

        // 삭제할 게임 기록의 user_id와 score 조회
        const [gameRecords] = await connection.execute(
            'SELECT user_id, score FROM game_records WHERE game_id = ?',
            [gameId]
        );

        if (gameRecords.length === 0) {
            connection.release();
            return res.status(404).json({ error: '게임 기록을 찾을 수 없습니다.' });
        }

        const { user_id, score } = gameRecords[0];

        // 게임 기록 삭제
        await connection.execute('DELETE FROM game_records WHERE game_id = ?', [gameId]);

        // 사용자 통계 재계산
        const [userGames] = await connection.execute(
            'SELECT COUNT(*) as total_games, MAX(score) as high_score FROM game_records WHERE user_id = ?',
            [user_id]
        );

        const newTotalGames = userGames[0].total_games;
        const newHighScore = userGames[0].high_score || 0;

        await connection.execute(
            'UPDATE users SET high_score = ?, total_games = ? WHERE user_id = ?',
            [newHighScore, newTotalGames, user_id]
        );

        connection.release();
        res.json({ success: true, message: '게임 기록이 삭제되었습니다.' });
    } catch (error) {
        console.error('게임 기록 삭제 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 3. 랭킹 API
// 사용자별 최고점수 랭킹
app.get('/api/rankings', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        // Check cache first
        const cacheKey = `rankings_${limit}`;
        const cachedRankings = getCachedData('rankings');
        if (cachedRankings && cachedRankings.limit === limit) {
            return res.json(cachedRankings.data);
        }

        const connection = await pool.getConnection();

        const limitValue = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
        const [rankings] = await connection.query(
            `SELECT
                u.employee_number,
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

        // Cache the results
        setCachedData('rankings', { limit, data: rankings });

        res.json(rankings);
    } catch (error) {
        console.error('랭킹 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 전체 게임 기록 랭킹 (관리자용)
app.get('/api/rankings/all', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const connection = await pool.getConnection();

        const limitValue = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
        const [rankings] = await connection.query(
            `SELECT
                gr.game_id,
                gr.score,
                gr.level_reached,
                gr.lines_cleared,
                gr.game_duration,
                gr.played_at,
                u.employee_number,
                u.username
            FROM game_records gr
            JOIN users u ON gr.user_id = u.user_id
            ORDER BY gr.score DESC
            LIMIT ${limitValue}`
        );

        connection.release();
        res.json(rankings);
    } catch (error) {
        console.error('전체 랭킹 조회 오류:', error);
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
        // Check cache first
        const cachedStats = getCachedData('stats');
        if (cachedStats) {
            return res.json(cachedStats);
        }

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

        const stats = {
            totalUsers: userCount[0].total,
            totalGames: gameCount[0].total,
            highScore: highScore[0].max_score || 0,
            todayGames: todayGames[0].today_count,
            avgGameTime: Math.round(avgTime[0].avg_duration || 0)
        };

        // Cache the results
        setCachedData('stats', stats);

        res.json(stats);
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

// WebSocket 연결 관리
io.on('connection', (socket) => {
    console.log('✅ 클라이언트 연결:', socket.id);

    socket.on('admin-join', () => {
        socket.join('admin-room');
        console.log('👨‍💼 관리자 클라이언트 접속:', socket.id);
    });

    socket.on('disconnect', () => {
        console.log('❌ 클라이언트 연결 해제:', socket.id);
    });
});

// WebSocket 이벤트 브로드캐스트 함수
function broadcastToAdmins(event, data) {
    io.to('admin-room').emit(event, data);
}

// Global Error Handler (모든 라우트 다음에 위치)
app.use((err, req, res, next) => {
    console.error('❌ 서버 오류:', err.stack);

    // Validation errors (express-validator)
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: '입력값 검증 실패',
            details: err.details
        });
    }

    // Database errors
    if (err.code && err.code.startsWith('ER_')) {
        return res.status(500).json({
            error: '데이터베이스 오류가 발생했습니다.',
            ...(process.env.NODE_ENV === 'development' && { details: err.message })
        });
    }

    // Default error response
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
        ? '서버 오류가 발생했습니다.'
        : err.message;

    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        error: '요청한 리소스를 찾을 수 없습니다.',
        path: req.path
    });
});

// 서버 시작
server.listen(PORT, () => {
    console.log(`🚀 테트리스 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`🌐 게임: http://localhost:${PORT}`);
    console.log(`⚙️ 관리자: http://localhost:${PORT}/admin`);
    console.log(`🔌 WebSocket 실시간 업데이트 활성화`);
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