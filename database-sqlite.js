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
                    employee_number TEXT NOT NULL UNIQUE,
                    username TEXT NOT NULL,
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

                // 데이터베이스 초기화 완료 (더미 데이터 없이 깨끗한 상태)
                console.log('✅ 빈 데이터베이스 초기화 완료! 게임에서 사용자를 등록해보세요.');
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