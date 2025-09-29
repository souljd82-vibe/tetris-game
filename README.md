# 🎮 테트리스 온라인 게임 (MariaDB 연동)

MariaDB를 활용한 멀티플레이어 테트리스 게임과 관리자 시스템입니다.

## 🚀 빠른 시작

### 1. 사전 요구사항
- Node.js (v14 이상)
- MariaDB 또는 MySQL (v10.3 이상)
- npm 또는 yarn

### 2. MariaDB 설정

MariaDB를 설치하고 다음 명령어로 데이터베이스를 설정하세요:

```bash
# MariaDB 접속
mysql -u root -p

# 스키마 실행
source setup.sql;
```

또는 직접 실행:
```bash
mysql -u root -p < setup.sql
```

### 3. 서버 설치 및 실행

```bash
# 의존성 설치
npm install

# 서버 실행
npm start

# 개발 모드 (자동 재시작)
npm run dev
```

### 4. 접속

- **게임**: http://localhost:3000
- **관리자 페이지**: http://localhost:3000/admin

## 🎯 주요 기능

### 게임 기능
- 🎮 클래식 테트리스 게임플레이
- 🏆 실시간 랭킹 시스템
- 📊 개인 기록 추적
- 💾 자동 진행상황 저장
- 🌐 오프라인 모드 지원

### 관리자 기능
- 📈 실시간 게임 통계
- 👥 사용자 관리
- 🎮 게임 기록 관리
- 🏆 랭킹 시스템 관리
- 🖥️ 시스템 모니터링

## 🔌 API 엔드포인트

### 사용자 관리
- `POST /api/users/login` - 사용자 로그인/등록
- `GET /api/users` - 모든 사용자 조회
- `DELETE /api/users/:id` - 사용자 삭제

### 게임 기록
- `POST /api/games` - 게임 기록 저장
- `GET /api/games` - 게임 기록 조회
- `DELETE /api/games` - 모든 게임 기록 삭제

### 랭킹
- `GET /api/rankings` - 랭킹 조회
- `DELETE /api/rankings` - 랭킹 초기화

### 통계
- `GET /api/stats` - 전체 통계
- `GET /api/logs` - 시스템 로그

---

🎮 **즐거운 테트리스 게임 되세요!** 🎮