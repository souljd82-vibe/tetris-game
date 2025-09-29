const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// SQLite 데이터베이스 파일 경로
const DB_PATH = path.join(__dirname, 'tetris_game.db');

// 데이터베이스 초기화
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ SQLite 연결 실패:', err.message);
                reject(err);
                return;
            }
            console.log('✅ SQLite 연결 성공!');

            // 테이블 생성
            db.serialize(() => {
                // 사용자 테이블
                db.run(`CREATE TABLE IF NOT EXISTS users (
                    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    high_score INTEGER DEFAULT 0,
                    total_games INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) console.error('사용자 테이블 생성 오류:', err);
                });

                // 게임 기록 테이블
                db.run(`CREATE TABLE IF NOT EXISTS game_records (
                    record_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    score INTEGER NOT NULL DEFAULT 0,
                    level_reached INTEGER DEFAULT 1,
                    lines_cleared INTEGER DEFAULT 0,
                    game_duration INTEGER DEFAULT 0,
                    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                )`, (err) => {
                    if (err) console.error('게임 기록 테이블 생성 오류:', err);
                });

                // 초기 샘플 데이터 삽입
                db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
                    if (err) {
                        console.error('사용자 수 확인 오류:', err);
                        return;
                    }

                    if (row.count === 0) {
                        console.log('🔄 초기 샘플 데이터를 삽입합니다...');

                        const insertUser = db.prepare(`INSERT INTO users (username, high_score, total_games, created_at, last_login) VALUES (?, ?, ?, ?, ?)`);
                        const userData = [
                            ['TestPlayer1', 15000, 25, '2024-01-15 10:00:00', '2024-03-20 14:30:00'],
                            ['TestPlayer2', 12000, 18, '2024-02-01 11:15:00', '2024-03-19 16:45:00'],
                            ['TestPlayer3', 18000, 32, '2024-02-10 09:30:00', '2024-03-20 11:20:00'],
                            ['GameMaster', 9000, 12, '2024-03-01 13:45:00', '2024-03-18 19:15:00'],
                            ['TetrisKing', 22000, 41, '2024-03-15 16:20:00', '2024-03-20 20:10:00']
                        ];

                        userData.forEach(user => {
                            insertUser.run(user);
                        });
                        insertUser.finalize();

                        // 게임 기록 삽입
                        const insertGame = db.prepare(`INSERT INTO game_records (user_id, score, level_reached, lines_cleared, game_duration, played_at) VALUES (?, ?, ?, ?, ?, ?)`);
                        const gameData = [
                            [1, 15000, 8, 45, 420, '2024-03-20 14:30:00'],
                            [2, 12000, 6, 38, 380, '2024-03-19 16:45:00'],
                            [3, 18000, 9, 52, 480, '2024-03-20 11:20:00'],
                            [4, 9000, 5, 28, 320, '2024-03-18 19:15:00'],
                            [5, 22000, 10, 68, 520, '2024-03-20 20:10:00'],
                            [1, 8500, 5, 25, 280, '2024-03-19 10:15:00'],
                            [2, 11200, 6, 35, 360, '2024-03-18 15:20:00'],
                            [3, 16800, 8, 48, 450, '2024-03-19 13:40:00']
                        ];

                        gameData.forEach(game => {
                            insertGame.run(game);
                        });
                        insertGame.finalize();

                        console.log('✅ 초기 샘플 데이터 삽입 완료!');
                    }
                });
            });

            resolve(db);
        });
    });
}

// 데이터베이스 연결 풀 관리
class DatabaseManager {
    constructor() {
        this.db = null;
    }

    async connect() {
        if (!this.db) {
            this.db = await initializeDatabase();
        }
        return this.db;
    }

    async query(sql, params = []) {
        const db = await this.connect();
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async run(sql, params = []) {
        const db = await this.connect();
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        changes: this.changes,
                        lastID: this.lastID
                    });
                }
            });
        });
    }

    async get(sql, params = []) {
        const db = await this.connect();
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('DB 연결 종료 오류:', err.message);
                } else {
                    console.log('🔚 SQLite 연결이 정상적으로 종료되었습니다.');
                }
            });
            this.db = null;
        }
    }
}

module.exports = new DatabaseManager();