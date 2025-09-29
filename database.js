// 데이터베이스 API 연동을 위한 프론트엔드 유틸리티

class TetrisDB {
    constructor() {
        this.baseURL = window.location.origin;
        this.currentUser = null;
    }

    // HTTP 요청 헬퍼
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseURL}/api${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API 요청 오류:', error);
            throw error;
        }
    }

    // 사용자 관련 메서드
    async loginUser(username) {
        try {
            const result = await this.request('/users/login', {
                method: 'POST',
                body: JSON.stringify({ username })
            });

            if (result.success) {
                this.currentUser = result.user;
                localStorage.setItem('tetrisUser', JSON.stringify(result.user));
                return result.user;
            }
            throw new Error('로그인 실패');
        } catch (error) {
            console.error('사용자 로그인 오류:', error);
            throw error;
        }
    }

    getCurrentUser() {
        if (!this.currentUser) {
            const stored = localStorage.getItem('tetrisUser');
            if (stored) {
                this.currentUser = JSON.parse(stored);
            }
        }
        return this.currentUser;
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('tetrisUser');
    }

    async getAllUsers() {
        return await this.request('/users');
    }

    async deleteUser(userId) {
        return await this.request(`/users/${userId}`, {
            method: 'DELETE'
        });
    }

    // 게임 기록 관련 메서드
    async saveGame(gameData) {
        const user = this.getCurrentUser();
        if (!user) {
            throw new Error('로그인이 필요합니다.');
        }

        return await this.request('/games', {
            method: 'POST',
            body: JSON.stringify({
                userId: user.user_id,
                ...gameData
            })
        });
    }

    async getGames(userId = null, limit = 50) {
        const params = new URLSearchParams();
        if (userId) params.append('userId', userId);
        if (limit) params.append('limit', limit);

        return await this.request(`/games?${params}`);
    }

    async deleteAllGames() {
        return await this.request('/games', {
            method: 'DELETE'
        });
    }

    // 랭킹 관련 메서드
    async getRankings(limit = 10) {
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit);

        return await this.request(`/rankings?${params}`);
    }

    async resetRankings() {
        return await this.request('/rankings', {
            method: 'DELETE'
        });
    }

    // 통계 관련 메서드
    async getStats() {
        return await this.request('/stats');
    }

    async getLogs() {
        return await this.request('/logs');
    }

    // 게임과 DB 연동을 위한 헬퍼 메서드
    async updateUserStats(score, level = 1, linesCleared = 0, gameTime = 0) {
        try {
            const result = await this.saveGame({
                score,
                level,
                linesCleared,
                gameTime
            });

            // 현재 사용자 정보 업데이트
            if (this.currentUser && result.isNewHighScore) {
                this.currentUser.high_score = Math.max(this.currentUser.high_score, score);
                this.currentUser.total_games = (this.currentUser.total_games || 0) + 1;
                localStorage.setItem('tetrisUser', JSON.stringify(this.currentUser));
            }

            return result;
        } catch (error) {
            console.error('게임 통계 업데이트 오류:', error);
            throw error;
        }
    }

    // 오프라인 모드 지원
    isOnline() {
        return navigator.onLine;
    }

    // 로컬 백업 (오프라인 시 사용)
    saveLocalBackup(data) {
        try {
            const backup = JSON.parse(localStorage.getItem('tetrisBackup') || '[]');
            backup.push({
                ...data,
                timestamp: new Date().toISOString(),
                synced: false
            });
            localStorage.setItem('tetrisBackup', JSON.stringify(backup));
        } catch (error) {
            console.error('로컬 백업 저장 오류:', error);
        }
    }

    // 백업 데이터 동기화
    async syncBackupData() {
        try {
            const backup = JSON.parse(localStorage.getItem('tetrisBackup') || '[]');
            const unsynced = backup.filter(item => !item.synced);

            for (const item of unsynced) {
                try {
                    await this.saveGame(item);
                    item.synced = true;
                } catch (error) {
                    console.error('백업 동기화 실패:', error);
                    break;
                }
            }

            // 동기화된 데이터만 남기기
            const updated = backup.filter(item => !item.synced);
            localStorage.setItem('tetrisBackup', JSON.stringify(updated));

            return unsynced.length;
        } catch (error) {
            console.error('백업 동기화 오류:', error);
            return 0;
        }
    }
}

// 전역 인스턴스 생성
const tetrisDB = new TetrisDB();

// 페이지 로드 시 연결 상태 확인 및 백업 동기화
window.addEventListener('load', async () => {
    if (tetrisDB.isOnline()) {
        try {
            const syncCount = await tetrisDB.syncBackupData();
            if (syncCount > 0) {
                console.log(`${syncCount}개의 백업 데이터가 동기화되었습니다.`);
            }
        } catch (error) {
            console.error('초기 동기화 실패:', error);
        }
    }
});

// 온라인/오프라인 상태 변경 시 처리
window.addEventListener('online', async () => {
    console.log('온라인 상태로 변경됨');
    try {
        await tetrisDB.syncBackupData();
    } catch (error) {
        console.error('온라인 복구 시 동기화 실패:', error);
    }
});

window.addEventListener('offline', () => {
    console.log('오프라인 상태로 변경됨');
});

// 사용 예시와 헬퍼 함수들
window.TetrisDB = TetrisDB;
window.tetrisDB = tetrisDB;