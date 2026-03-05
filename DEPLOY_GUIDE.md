# MBO Project Leader (Web) - 배포 & 업데이트 가이드

## 📁 프로젝트 구조

```
program_web/
├── .github/workflows/
│   └── build-release.yml      ← GitHub Actions 자동 빌드
├── src_web/
│   ├── app.py                 ← 메인 소스코드 (pywebview)
│   ├── index.html             ← UI 메인 페이지
│   ├── app_icon.ico           ← 앱 아이콘
│   ├── build.bat              ← 로컬 EXE 빌드 스크립트
│   ├── requirements.txt       ← Python 의존성
│   └── static/                ← CSS, JS 리소스
├── deploy_web.bat             ← 배포 스크립트 (git tag + push)
└── DEPLOY_GUIDE.md            ← 이 파일
```

---

## 🚀 최초 설정 (한 번만)

### 1단계: GitHub 저장소 생성 & 연결

```bash
# GitHub에서 저장소 생성 후
cd 01.MBO
git init
git add .
git commit -m "v1.0.0 - 초기 배포"
git remote add origin https://github.com/HyeonheeKIM/MBO-Project-Leader-W.git
git branch -M main
git push -u origin main
```

### 2단계: `Project_Leader.py` 상단의 GitHub 정보 수정

```python
GITHUB_OWNER = "HyeonheeKIM"            # ← GitHub 사용자명
GITHUB_REPO  = "MBO-Project-Leader-W"   # ← 저장소 이름
```

### 3단계 : 커밋
```bash
git add .
git commit -m "v2026.03.04 - 변경사항"
git push origin main
```

만약 , git 을 초기화하고 다시 올리고 싶다면,
```bash
git init
git branch -M main

git remote add origin https://github.com/HyeonheeKIM/MBO-Project-Leader-W.git

# GitHub에 있는 파일 가져오기 (pull)
git pull origin main --allow-unrelated-histories

git add .
git commit -m "v2026.03.04 - 변경사항"
git push origin main
```



### 3단계 : 배포

**방법 A - 로컬 빌드 (간단)**
```
src 폴더에서 build.bat 더블클릭
→ dist\MBO_Project_Leader.exe 생성
```

`MBO_Project_Leader.exe` 파일을 전달하면 끝!
- Python 설치 불필요
- 더블클릭만으로 실행
- DB 파일은 EXE와 같은 폴더에 자동 생성

---

**방법 B - GitHub Actions 자동 빌드 (추천)**
```bash
git tag v1.0.0
git push origin v1.0.0
# → GitHub Actions가 자동으로 EXE를 빌드하고 Release에 업로드
```

## 🔄 업데이트 배포 (반복)

### 방법 A - `deploy_web.bat` 사용 (추천)

1. `src_web/app.py` 상단의 버전을 올립니다:
   ```python
   __version__ = "2026.03.06.1"   # ← 버전 변경
   ```

2. `deploy_web.bat`을 더블클릭합니다

3. 변경 내용을 입력하면 자동으로:
   - `git add .`
   - `git commit`
   - `git tag v2026.03.06.1`
   - `git push origin main --tags`

4. GitHub Actions가 자동으로:
   - Windows 환경에서 EXE 빌드
   - GitHub Release 페이지에 업로드

### 방법 B - 수동 명령

```bash
# 1. 코드 수정 후 app.py 상단의 버전 올리기
__version__ = "2026.03.06.1"

# 2. 커밋 & 태그
git add .
git commit -m "v2026.03.06.1 - 기능 추가"
git tag v2026.03.06.1
git push origin main --tags

# 3. 끝! GitHub Actions가 자동으로 EXE 빌드 & Release 업로드
```

### 방법 C - 로컬 빌드 (인터넷 없이)

```
src_web 폴더에서 build.bat 더블클릭
→ dist\MBO_Project_Leader_Web.exe 생성
```

---

## 📦 배포 흐름

```
버전 변경 → deploy_web.bat 실행 → git push + tag
                                         ↓
                              GitHub Actions 자동 트리거
                                         ↓
                              Windows에서 PyInstaller 빌드
                                         ↓
                              GitHub Release에 EXE 업로드
                                         ↓
                              사용자가 Release 페이지에서 다운로드
```

---

## 📥 사용자 배포

1. GitHub Release 페이지에서 최신 `MBO_Project_Leader_Web.exe`를 다운로드
2. 원하는 폴더에 저장
3. 더블클릭으로 실행

> 💡 DB 파일(mbo_project_leader.db)은 EXE와 같은 폴더에 자동 생성됩니다.
> 업데이트 시 EXE만 덮어쓰면 데이터가 유지됩니다.

---

## ⚙️ 버전 규칙

현재 날짜 기반 버전을 사용합니다:

| 형식 | 예시 | 설명 |
|------|------|------|
| `YYYY.MM.DD.N` | `2026.03.05.1` | 날짜 + 당일 빌드 번호 |

---

## 🔧 고급 설정

### 비공개 저장소 사용
GitHub 비공개(Private) 저장소도 사용 가능:
- GitHub Actions는 비공개 저장소에서도 무료(월 2,000분)
- Release 페이지에서 직접 EXE 파일을 전달

### GitHub Actions 확인
빌드 상태 확인: https://github.com/HyeonheeKIM/MBO-Project-Leader-W/actions
