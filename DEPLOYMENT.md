# 🚀 Railway 배포 가이드

## Railway로 MariaDB 테트리스 게임 배포하기

### 1단계: Railway 계정 생성
1. [Railway.app](https://railway.app) 접속
2. GitHub 계정으로 로그인
3. 무료 플랜 선택

### 2단계: 프로젝트 생성
1. **New Project** 클릭
2. **Deploy from GitHub repo** 선택
3. `tetris-game` 저장소 선택

### 3단계: MariaDB 추가
1. 프로젝트에서 **+ New** 클릭
2. **Database** → **Add MariaDB** 선택
3. MariaDB 서비스가 자동으로 생성됨

### 4단계: 환경 변수 설정
Railway가 자동으로 설정하는 변수:
- `MYSQLHOST` → `DB_HOST`
- `MYSQLUSER` → `DB_USER`
- `MYSQLPASSWORD` → `DB_PASSWORD`
- `MYSQLDATABASE` → `DB_NAME`
- `MYSQLPORT` → `DB_PORT`
- `PORT` (자동 설정)

**주의:** Railway는 변수명이 다를 수 있으니, Variables 탭에서 확인 후 아래처럼 매핑:

```
DB_HOST = ${{MYSQLHOST}}
DB_USER = ${{MYSQLUSER}}
DB_PASSWORD = ${{MYSQLPASSWORD}}
DB_NAME = ${{MYSQLDATABASE}}
DB_PORT = ${{MYSQLPORT}}
```

### 5단계: 데이터베이스 초기화
1. Railway의 MariaDB 서비스에서 **Connect** 클릭
2. Query 탭에서 `setup.sql` 내용 실행:

```sql
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_number VARCHAR(20) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL,
    high_score INT DEFAULT 0,
    total_games INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_records (
    record_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    score INT NOT NULL DEFAULT 0,
    level_reached INT DEFAULT 1,
    lines_cleared INT DEFAULT 0,
    game_duration INT DEFAULT 0,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_user_id ON game_records(user_id);
CREATE INDEX idx_score ON game_records(score);
CREATE INDEX idx_played_at ON game_records(played_at);
```

### 6단계: 배포
1. Railway가 자동으로 배포 시작
2. **Deployments** 탭에서 진행 상황 확인
3. 배포 완료 후 **Settings** → **Generate Domain** 클릭

### 7단계: 도메인 접속
- **게임**: `https://your-app.up.railway.app`
- **관리자**: `https://your-app.up.railway.app/admin-login.html`

---

## 로컬 개발 환경 설정

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env` 파일 생성:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=tetris_game
DB_PORT=3306
PORT=3000
```

### 3. MariaDB 설정
```bash
# MariaDB 실행
mysql -u root -p

# 데이터베이스 생성
CREATE DATABASE tetris_game;
USE tetris_game;

# setup.sql 실행
source setup.sql;
```

### 4. 서버 실행
```bash
# MariaDB 버전
node server.js

# SQLite 버전 (로컬 테스트용)
node server-sqlite.js
```

---

## 문제 해결

### MariaDB 연결 실패
- Railway Variables에서 DB 정보 확인
- MariaDB 서비스가 실행 중인지 확인
- 환경 변수 매핑 재확인

### 배포 실패
- `package.json`의 `start` 스크립트 확인
- Logs 탭에서 에러 메시지 확인
- Node.js 버전 호환성 확인

### 데이터베이스 초기화 필요
- Railway MariaDB Query 탭에서 테이블 확인
- `setup.sql` 재실행

---

## 추가 정보

### 무료 플랜 제한
- 월 500시간 실행 시간
- 500MB 메모리
- 100GB 네트워크 대역폭
- MariaDB 100MB 스토리지

### Railway 대안
- **Render**: PostgreSQL 무료 제공
- **Vercel**: Edge Functions 활용
- **Fly.io**: 소규모 앱 무료

### 관리자 계정
- ID: `admin`
- 기본 비밀번호: `admin`
- 첫 로그인 후 비밀번호 변경 권장
