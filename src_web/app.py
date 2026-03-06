"""
MBO Project Leader - Web Edition (pywebview)
=============================================
pywebview 기반 로컬 데스크탑 애플리케이션
서버 없이 네이티브 윈도우에서 직접 실행됩니다.
SQLite로 로컬 저장합니다.
"""

__version__ = "2026.03.05.14"

import os
import sys
import json
import sqlite3
from datetime import datetime, date, timedelta
import re as _re
import threading
import tempfile
import subprocess
import webview

# ============================================================
# GitHub 자동 업데이트
# ============================================================
GITHUB_REPO = "HyeonheeKIM/MBO-Project-Leader-W"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_NOTIFICATION_URL = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/src_web/notification.md"
EXE_ASSET_NAME = "MBO_Project_Leader.exe"


def _parse_version(v):
    try:
        return tuple(int(x) for x in v.strip().strip('v').split('.'))
    except Exception:
        return (0,)


def check_update():
    import urllib.request
    try:
        req = urllib.request.Request(
            GITHUB_API_URL,
            headers={'Accept': 'application/vnd.github+json',
                     'User-Agent': 'MBO-Project-Leader-Updater'}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        remote_tag = data.get('tag_name', '')
        remote_ver = remote_tag.lstrip('v')
        if _parse_version(remote_ver) > _parse_version(__version__):
            # 다운로드 URL 찾기 (이름이 바뀔 수 있으므로 .exe 에셋 중 첫 번째를 사용)
            download_url = ''
            for asset in data.get('assets', []):
                if asset['name'] == EXE_ASSET_NAME:
                    download_url = asset['browser_download_url']
                    break
            # 정확한 이름 매칭 실패 시 fallback
            if not download_url:
                for asset in data.get('assets', []):
                    if asset['name'].lower().endswith('.exe'):
                        download_url = asset['browser_download_url']
                        break
            return {
                'available': True,
                'current': __version__,
                'latest': remote_ver,
                'download_url': download_url,
                'release_name': data.get('name', ''),
                'body': data.get('body', ''),
            }
        return {'available': False, 'current': __version__, 'latest': remote_ver}
    except Exception as e:
        return {'available': False, 'current': __version__, 'error': str(e)}


def download_and_apply_update(download_url):
    """_updater.bat을 생성하고 실행한 뒤 현재 앱을 종료한다.
    BAT이 다운로드·교체·새 EXE 실행을 모두 담당한다."""

    if not getattr(sys, 'frozen', False):
        return {'success': False, 'error': '개발 환경에서는 자동 업데이트가 지원되지 않습니다.'}

    current_exe = sys.executable
    exe_dir = os.path.dirname(current_exe)
    exe_name = os.path.basename(current_exe)
    new_exe_temp = os.path.join(exe_dir, '_new_update.exe')
    pid = os.getpid()

    # _MEI 임시 폴더 정리 명령
    temp_dir = os.environ.get('TEMP', '')
    mei_cleanup = ''
    if temp_dir:
        mei_cleanup = f'for /d %%D in ("{temp_dir}\\_MEI*") do rd /s /q "%%D" >nul 2>&1'

    try:
        updater_bat = os.path.join(exe_dir, '_updater.bat')
        progress_hta = os.path.join(exe_dir, '_update_progress.hta')

        # ── 안내 팝업 HTA ──
        hta_content = '''<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>MBO Project Leader</title>
<HTA:APPLICATION ID="oApp"
    APPLICATIONNAME="MBO Updater"
    BORDER="none" BORDERSTYLE="normal" CAPTION="no"
    SHOWINTASKBAR="yes" SINGLEINSTANCE="yes" SYSMENU="no"
    WINDOWSTATE="normal"
/>
<style>
body{font-family:'Segoe UI','Malgun Gothic',sans-serif;background:#f0f4ff;
margin:0;display:flex;align-items:center;justify-content:center;height:100%;overflow:hidden}
.box{text-align:center;padding:30px 40px}
.icon{font-size:36px;margin-bottom:12px}
.title{font-size:16px;font-weight:600;color:#1e1b4b;margin-bottom:8px}
.sub{font-size:12px;color:#6b7280}
.dots{display:inline-block;width:20px;text-align:left}
</style>
<script language="VBScript">
Sub Window_OnLoad
    window.resizeTo 360,180
    window.moveTo (window.screen.availWidth-360)/2,(window.screen.availHeight-180)/2
End Sub
</script>
<script language="JavaScript">
var d=0;setInterval(function(){d=(d+1)%4;document.getElementById('dots').innerText=Array(d+1).join('.');},400);
</script>
</head>
<body>
<div class="box">
<div class="icon">&#9203;</div>
<div class="title">&#50629;&#45936;&#51060;&#53944; &#51201;&#50857; &#51473;<span class="dots" id="dots">.</span></div>
<div class="sub">&#51104;&#49884;&#47564; &#44592;&#45796;&#47140;&#51452;&#49464;&#50836;</div>
</div>
</body>
</html>'''
        with open(progress_hta, 'w', encoding='utf-8-sig') as f:
            f.write(hta_content)

        # ── _updater.bat ──
        # BAT이 다운로드 → old 삭제 → new 실행까지 전부 담당
        log_file = os.path.join(exe_dir, 'bat_log.txt')
        # 8.3 짧은 경로를 사용하여 한글 경로 문제 방지
        bat_content = f'''@echo off
chcp 65001 >nul
set "LOG={log_file}"

echo [%date% %time%] ========== 업데이트 시작 ========== > "%LOG%"
echo [%date% %time%] current_exe = {current_exe} >> "%LOG%"
echo [%date% %time%] new_exe_temp = {new_exe_temp} >> "%LOG%"
echo [%date% %time%] download_url = {download_url} >> "%LOG%"
echo [%date% %time%] PID = {pid} >> "%LOG%"
echo [%date% %time%] exe_dir = {exe_dir} >> "%LOG%"
echo [%date% %time%] TEMP = %TEMP% >> "%LOG%"
echo [%date% %time%] CODEPAGE = 65001 >> "%LOG%"

:: ─── 환경 진단 ───
echo [%date% %time%] OS 버전: >> "%LOG%"
ver >> "%LOG%" 2>&1
echo [%date% %time%] certutil 확인 >> "%LOG%"
where certutil >> "%LOG%" 2>&1
echo [%date% %time%] bitsadmin 확인 >> "%LOG%"
where bitsadmin >> "%LOG%" 2>&1

:: ─── 안내 팝업 ───
start "" mshta.exe "{progress_hta}"
echo [%date% %time%] HTA 팝업 실행 >> "%LOG%"

:: ─── old.exe(PID {pid}) 종료 대기 ───
echo [%date% %time%] old.exe 종료 대기 시작 (PID {pid}) >> "%LOG%"
set /a _owc=0
:wait_old
timeout /t 1 /nobreak >nul
tasklist /FI "PID eq {pid}" /NH 2>nul | find /i "{exe_name}" >nul
if not errorlevel 1 (
    set /a _owc+=1
    echo [%date% %time%] old.exe 아직 실행 중... (%_owc%초) >> "%LOG%"
    if %_owc% geq 60 (
        echo [%date% %time%] [오류] old.exe 종료 대기 타임아웃 (60초) >> "%LOG%"
        taskkill /f /pid {pid} >nul 2>&1
        timeout /t 2 /nobreak >nul
    )
    if %_owc% lss 65 goto wait_old
)
echo [%date% %time%] old.exe 종료 확인 >> "%LOG%"
timeout /t 2 /nobreak >nul

:: ─── _MEI 임시 폴더 정리 ───
echo [%date% %time%] _MEI 정리 시작 >> "%LOG%"
{mei_cleanup}
timeout /t 1 /nobreak >nul
echo [%date% %time%] _MEI 정리 완료 >> "%LOG%"

:: ─── 기존 임시 파일 정리 ───
if exist "{new_exe_temp}" (
    echo [%date% %time%] 기존 _new_update.exe 삭제 >> "%LOG%"
    del /f /q "{new_exe_temp}" >nul 2>&1
)

:: ─── 새 EXE 다운로드 (certutil, 방법 1) ───
echo [%date% %time%] [방법1] certutil 다운로드 시작 >> "%LOG%"
echo [%date% %time%] URL = {download_url} >> "%LOG%"
echo [%date% %time%] 저장 위치 = {new_exe_temp} >> "%LOG%"
certutil -urlcache -split -f "{download_url}" "{new_exe_temp}" >> "%LOG%" 2>&1
set "DL_ERR=%errorlevel%"
echo [%date% %time%] certutil 종료코드 = %DL_ERR% >> "%LOG%"

:: 다운로드 파일 존재 확인
if exist "{new_exe_temp}" (
    echo [%date% %time%] [방법1] 파일 생성 확인됨 >> "%LOG%"
    goto dl_done
)
echo [%date% %time%] [방법1] 실패 - 파일 없음 >> "%LOG%"

:: certutil 캐시 정리 후 재시도
echo [%date% %time%] certutil 캐시 정리 >> "%LOG%"
certutil -urlcache -delete "{download_url}" >> "%LOG%" 2>&1

:: ─── 새 EXE 다운로드 (bitsadmin, 방법 2) ───
echo [%date% %time%] [방법2] bitsadmin 다운로드 시작 >> "%LOG%"
bitsadmin /transfer "MBO_Update" /download /priority foreground "{download_url}" "{new_exe_temp}" >> "%LOG%" 2>&1
set "DL_ERR2=%errorlevel%"
echo [%date% %time%] bitsadmin 종료코드 = %DL_ERR2% >> "%LOG%"

if exist "{new_exe_temp}" (
    echo [%date% %time%] [방법2] 파일 생성 확인됨 >> "%LOG%"
    goto dl_done
)
echo [%date% %time%] [방법2] 실패 - 파일 없음 >> "%LOG%"

:: ─── 새 EXE 다운로드 (certutil 재시도, 방법 3) ───
echo [%date% %time%] [방법3] certutil 재시도 (캐시 정리 후) >> "%LOG%"
certutil -urlcache -split -f "{download_url}" "{new_exe_temp}" >> "%LOG%" 2>&1
set "DL_ERR3=%errorlevel%"
echo [%date% %time%] certutil 재시도 종료코드 = %DL_ERR3% >> "%LOG%"

if exist "{new_exe_temp}" (
    echo [%date% %time%] [방법3] 파일 생성 확인됨 >> "%LOG%"
    goto dl_done
)
echo [%date% %time%] [방법3] 실패 - 파일 없음 >> "%LOG%"

:: ─── 모든 다운로드 방법 실패 ───
echo [%date% %time%] [오류] 모든 다운로드 방법 실패 >> "%LOG%"
echo [%date% %time%] 네트워크 연결 상태 확인: >> "%LOG%"
ping -n 1 github.com >> "%LOG%" 2>&1
echo [%date% %time%] DNS 확인: >> "%LOG%"
nslookup github.com >> "%LOG%" 2>&1
taskkill /f /im mshta.exe >nul 2>&1
goto end

:dl_done
echo [%date% %time%] 다운로드 완료 >> "%LOG%"

:: ─── 다운로드 검증 (5MB 이상) ───
for %%F in ("{new_exe_temp}") do set FSIZE=%%~zF
echo [%date% %time%] 파일 크기 = %FSIZE% bytes >> "%LOG%"
if not defined FSIZE (
    echo [%date% %time%] [오류] 파일 크기를 읽을 수 없음 >> "%LOG%"
    taskkill /f /im mshta.exe >nul 2>&1
    goto end
)
if %FSIZE% LSS 5242880 (
    echo [%date% %time%] [오류] 파일 손상 (크기: %FSIZE% bytes, 5MB 미만) >> "%LOG%"
    taskkill /f /im mshta.exe >nul 2>&1
    del /f /q "{new_exe_temp}" >nul 2>&1
    goto end
)
echo [%date% %time%] 파일 검증 통과 >> "%LOG%"

:: ─── old.exe 삭제 ───
echo [%date% %time%] old.exe 삭제 시도: {current_exe} >> "%LOG%"
del /f /q "{current_exe}" >nul 2>&1
if exist "{current_exe}" (
    echo [%date% %time%] old.exe 아직 존재, 3초 후 재시도 >> "%LOG%"
    timeout /t 3 /nobreak >nul
    del /f /q "{current_exe}" >nul 2>&1
)
if exist "{current_exe}" (
    echo [%date% %time%] old.exe 2차 실패, taskkill 후 재시도 >> "%LOG%"
    taskkill /f /im "{exe_name}" >nul 2>&1
    timeout /t 3 /nobreak >nul
    del /f /q "{current_exe}" >nul 2>&1
)
if exist "{current_exe}" (
    echo [%date% %time%] [오류] old.exe 삭제 최종 실패 >> "%LOG%"
    echo [%date% %time%] 실행 중인 프로세스 목록: >> "%LOG%"
    tasklist /FI "IMAGENAME eq {exe_name}" >> "%LOG%" 2>&1
    taskkill /f /im mshta.exe >nul 2>&1
    goto end
) else (
    echo [%date% %time%] old.exe 삭제 성공 >> "%LOG%"
)

:: ─── new.exe → 원래 이름으로 이동 ───
echo [%date% %time%] move 시작: _new_update.exe → {exe_name} >> "%LOG%"
move /Y "{new_exe_temp}" "{current_exe}" >> "%LOG%" 2>&1
echo [%date% %time%] move 종료코드 = %errorlevel% >> "%LOG%"
if not exist "{current_exe}" (
    echo [%date% %time%] [오류] 파일 교체 실패 (move 후 {exe_name} 없음) >> "%LOG%"
    echo [%date% %time%] 디렉토리 내용: >> "%LOG%"
    dir "{exe_dir}" >> "%LOG%" 2>&1
    taskkill /f /im mshta.exe >nul 2>&1
    goto end
)
echo [%date% %time%] move 성공 >> "%LOG%"
for %%F in ("{current_exe}") do echo [%date% %time%] 새 파일 크기 = %%~zF bytes >> "%LOG%"

:: ─── 새 버전 실행 ───
echo [%date% %time%] 새 EXE 실행: {current_exe} >> "%LOG%"
start "" "{current_exe}"
echo [%date% %time%] start 종료코드 = %errorlevel% >> "%LOG%"

:: ─── 새 EXE 프로세스 확인 대기 (최대 30초) ───
set /a _wc=0
:wait_new
timeout /t 1 /nobreak >nul
tasklist /NH 2>nul | find /i "{exe_name}" >nul
if errorlevel 1 (
    set /a _wc+=1
    echo [%date% %time%] 새 EXE 대기 중... (%_wc%초) >> "%LOG%"
    if %_wc% lss 30 goto wait_new
)
if %_wc% geq 30 (
    echo [%date% %time%] [경고] 새 EXE 프로세스 30초 내 미감지 >> "%LOG%"
) else (
    echo [%date% %time%] 새 EXE 프로세스 확인됨 (%_wc%초 후) >> "%LOG%"
)

:: ─── 새 프로그램 실행 확인 후 2초 대기, 팝업 닫기 ───
timeout /t 2 /nobreak >nul
taskkill /f /im mshta.exe >nul 2>&1
echo [%date% %time%] ========== 업데이트 완료 ========== >> "%LOG%"

:: ─── 임시 파일 정리 ───
if exist "{progress_hta}" del /f /q "{progress_hta}" >nul 2>&1

:end
echo [%date% %time%] BAT 종료 >> "%LOG%"
exit
'''
        with open(updater_bat, 'w', encoding='utf-8') as f:
            f.write(bat_content)

        # ── Python 측 사전 로그 (BAT 실행 전 디버깅용) ──
        try:
            with open(log_file, 'w', encoding='utf-8') as lf:
                lf.write(f"[Python] updater_bat = {updater_bat}\n")
                lf.write(f"[Python] bat 파일 존재 = {os.path.exists(updater_bat)}\n")
                lf.write(f"[Python] bat 파일 크기 = {os.path.getsize(updater_bat)}\n")
                lf.write(f"[Python] exe_dir = {exe_dir}\n")
                lf.write(f"[Python] pid = {pid}\n")
                lf.write(f"[Python] Popen 호출 직전\n")
        except Exception:
            pass

        # BAT 실행 - DETACHED_PROCESS로 완전히 독립된 프로세스로 실행
        DETACHED_PROCESS = 0x00000008
        CREATE_NEW_PROCESS_GROUP = 0x00000200
        CREATE_NO_WINDOW = 0x08000000
        subprocess.Popen(
            f'cmd /c "{updater_bat}"',
            creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
            cwd=exe_dir,
            close_fds=True,
        )

        # 현재 앱 종료 (BAT가 충분히 시작된 후)
        def _exit():
            import time
            time.sleep(2)  # BAT가 확실히 실행될 시간 확보
            for w in webview.windows:
                try:
                    w.destroy()
                except Exception:
                    pass
            os._exit(0)

        threading.Thread(target=_exit, daemon=True).start()
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

# Windows: AppUserModelID 설정
if sys.platform == 'win32':
    import ctypes
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('mbo.project.leader.app')

# ============================================================
# 경로 설정
# ============================================================
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    APP_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    APP_DIR = BASE_DIR

DB_PATH = os.path.join(BASE_DIR, "mbo_project_leader.db")


# ============================================================
# 데이터베이스
# ============================================================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS years (
            year INTEGER PRIMARY KEY
        );
        CREATE TABLE IF NOT EXISTS projects (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            year        INTEGER NOT NULL,
            name        TEXT NOT NULL,
            description TEXT DEFAULT '',
            kpi         TEXT DEFAULT '',
            weight      REAL DEFAULT 0,
            priority    INTEGER DEFAULT 1,
            difficulty  TEXT DEFAULT '보통',
            status      TEXT DEFAULT '대기',
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (year) REFERENCES years(year) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS monthly_plans (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id  INTEGER NOT NULL,
            month       INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
            milestone   TEXT DEFAULT '',
            target      TEXT DEFAULT '',
            status      TEXT DEFAULT '미완료',
            note        TEXT DEFAULT '',
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            UNIQUE(project_id, month)
        );
        CREATE TABLE IF NOT EXISTS daily_tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id  INTEGER NOT NULL,
            task_date   TEXT NOT NULL,
            title       TEXT NOT NULL,
            description TEXT DEFAULT '',
            is_done     INTEGER DEFAULT 0,
            priority    INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
    """)
    now_year = datetime.now().year
    conn.execute("INSERT OR IGNORE INTO years (year) VALUES (?)", (now_year,))
    # Migration: difficulty 칼럼 추가
    cols = [r[1] for r in conn.execute("PRAGMA table_info(projects)").fetchall()]
    if "difficulty" not in cols:
        conn.execute("ALTER TABLE projects ADD COLUMN difficulty TEXT DEFAULT '보통'")
    if "target_value" not in cols:
        conn.execute("ALTER TABLE projects ADD COLUMN target_value TEXT DEFAULT ''")
    if "actual_value" not in cols:
        conn.execute("ALTER TABLE projects ADD COLUMN actual_value TEXT DEFAULT ''")
    # 앱 설정 테이블
    conn.execute("""
        CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )
    """)
    # 반복 태스크 템플릿
    conn.execute("""
        CREATE TABLE IF NOT EXISTS recurring_tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id  INTEGER NOT NULL,
            title       TEXT NOT NULL,
            description TEXT DEFAULT '',
            priority    INTEGER DEFAULT 1,
            frequency   TEXT DEFAULT 'weekly',
            day_of_week INTEGER DEFAULT 1,
            day_of_month INTEGER DEFAULT 1,
            end_date    TEXT DEFAULT '',
            is_active   INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    """)
    # Migration: end_date 칼럼 추가
    rt_cols = [r[1] for r in conn.execute("PRAGMA table_info(recurring_tasks)").fetchall()]
    if "end_date" not in rt_cols:
        conn.execute("ALTER TABLE recurring_tasks ADD COLUMN end_date TEXT DEFAULT ''")

    # 태스크 댓글
    conn.execute("""
        CREATE TABLE IF NOT EXISTS task_comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id     INTEGER NOT NULL,
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (task_id) REFERENCES daily_tasks(id) ON DELETE CASCADE
        )
    """)
    conn.commit()
    conn.close()


def dict_row(row):
    """sqlite3.Row → dict"""
    if row is None:
        return None
    return dict(row)


def dict_rows(rows):
    return [dict(r) for r in rows]


# ============================================================
# Markdown → HTML 변환
# ============================================================
def _md_to_html(md_text):
    """Minimal Markdown → HTML converter (no dependencies)."""
    lines = md_text.split('\n')
    html_parts = []
    in_ul = False
    in_ol = False

    for line in lines:
        stripped = line.strip()

        if in_ul and not _re.match(r'^[-*+]\s', stripped):
            html_parts.append('</ul>')
            in_ul = False
        if in_ol and not _re.match(r'^\d+\.\s', stripped):
            html_parts.append('</ol>')
            in_ol = False

        if not stripped:
            html_parts.append('<br>')
            continue

        m = _re.match(r'^(#{1,6})\s+(.*)', stripped)
        if m:
            level = len(m.group(1))
            html_parts.append(f'<h{level}>{m.group(2)}</h{level}>')
            continue

        m = _re.match(r'^[-*+]\s+(.*)', stripped)
        if m:
            if not in_ul:
                html_parts.append('<ul>')
                in_ul = True
            html_parts.append(f'<li>{m.group(1)}</li>')
            continue

        m = _re.match(r'^\d+\.\s+(.*)', stripped)
        if m:
            if not in_ol:
                html_parts.append('<ol>')
                in_ol = True
            html_parts.append(f'<li>{m.group(1)}</li>')
            continue

        if _re.match(r'^([-*_]\s*){3,}$', stripped):
            html_parts.append('<hr>')
            continue

        html_parts.append(f'<p>{stripped}</p>')

    if in_ul:
        html_parts.append('</ul>')
    if in_ol:
        html_parts.append('</ol>')

    result = '\n'.join(html_parts)
    result = _re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', result)
    result = _re.sub(r'\*(.+?)\*', r'<em>\1</em>', result)
    result = _re.sub(r'`(.+?)`', r'<code>\1</code>', result)
    result = _re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" target="_blank">\1</a>', result)
    return result


# ============================================================
# pywebview API 클래스
# ============================================================
class Api:
    """JavaScript에서 window.pywebview.api.method_name() 으로 호출"""

    def get_version(self):
        return __version__

    # ---- Auto Update ----
    def check_for_update(self):
        """GitHub에서 최신 버전 확인"""
        return check_update()

    def apply_update(self, download_url):
        """새 버전 다운로드 후 자동 교체"""
        return download_and_apply_update(download_url)

    # ---- Years ----
    def get_years(self):
        conn = get_db()
        years = [r['year'] for r in conn.execute(
            "SELECT year FROM years ORDER BY year DESC").fetchall()]
        conn.close()
        return years

    def add_year(self, year):
        if not year or year < 2000 or year > 2100:
            return {'error': '올바른 연도를 입력하세요 (2000~2100)'}
        conn = get_db()
        conn.execute("INSERT OR IGNORE INTO years (year) VALUES (?)", (year,))
        conn.commit()
        pc = conn.execute("SELECT COUNT(*) c FROM projects WHERE year=?",
                          (year,)).fetchone()['c']
        conn.close()
        return {'year': year, 'project_count': pc}

    def get_year_stats(self, year):
        conn = get_db()
        pc = conn.execute("SELECT COUNT(*) c FROM projects WHERE year=?",
                          (year,)).fetchone()['c']
        conn.close()
        return {'year': year, 'project_count': pc}

    # ---- Projects ----
    def get_projects(self, year=None, sort='priority_desc'):
        if year is None:
            year = datetime.now().year
        sort_sql = {
            "priority_desc": "ORDER BY priority DESC, id",
            "priority_asc": "ORDER BY priority ASC, id",
            "name_asc": "ORDER BY name COLLATE NOCASE ASC",
            "name_desc": "ORDER BY name COLLATE NOCASE DESC",
            "weight_desc": "ORDER BY weight DESC, id",
            "weight_asc": "ORDER BY weight ASC, id",
            "status": "ORDER BY CASE status WHEN '진행중' THEN 1 WHEN '대기' THEN 2 WHEN '완료' THEN 3 WHEN '취소' THEN 4 END, id",
            "difficulty": "ORDER BY CASE difficulty WHEN '매우 어려움' THEN 1 WHEN '어려움' THEN 2 WHEN '보통' THEN 3 WHEN '쉬움' THEN 4 END, id",
            "created_desc": "ORDER BY created_at DESC",
            "created_asc": "ORDER BY created_at ASC",
        }.get(sort, "ORDER BY priority DESC, id")

        conn = get_db()
        projects = dict_rows(conn.execute(
            f"SELECT * FROM projects WHERE year=? {sort_sql}", (year,)).fetchall())

        for p in projects:
            t = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=?",
                             (p['id'],)).fetchone()['c']
            d = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=? AND is_done=1",
                             (p['id'],)).fetchone()['c']
            plans = dict_rows(conn.execute(
                "SELECT * FROM monthly_plans WHERE project_id=? ORDER BY month",
                (p['id'],)).fetchall())
            comp_m = sum(1 for pl in plans if pl['status'] == '완료')
            total_m = max(sum(1 for pl in plans if pl['milestone'] and pl['milestone'] != 'N/A'), 1)
            p['progress'] = round(comp_m / total_m * 100)
            p['task_total'] = t
            p['task_done'] = d
        conn.close()
        return projects

    def create_project(self, data):
        name = data.get('name', '').strip()
        if not name:
            return {'error': '프로젝트명을 입력하세요'}
        conn = get_db()
        year = data.get('year', datetime.now().year)
        conn.execute("INSERT OR IGNORE INTO years (year) VALUES (?)", (year,))
        cur = conn.execute(
            "INSERT INTO projects (year,name,description,kpi,weight,priority,difficulty,status,target_value,actual_value) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (year, name, data.get('description', ''), data.get('kpi', ''),
             data.get('weight', 0), data.get('priority', 1),
             data.get('difficulty', '보통'), data.get('status', '대기'),
             data.get('target_value', ''), data.get('actual_value', '')))
        conn.commit()
        pid = cur.lastrowid
        p = dict_row(conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone())
        conn.close()
        return p

    def update_project(self, pid, data):
        name = data.get('name', '').strip()
        if not name:
            return {'error': '프로젝트명을 입력하세요'}
        conn = get_db()
        conn.execute(
            "UPDATE projects SET name=?,description=?,kpi=?,weight=?,priority=?,difficulty=?,status=?,target_value=?,actual_value=? WHERE id=?",
            (name, data.get('description', ''), data.get('kpi', ''),
             data.get('weight', 0), data.get('priority', 1),
             data.get('difficulty', '보통'), data.get('status', '대기'),
             data.get('target_value', ''), data.get('actual_value', ''), pid))
        conn.commit()
        p = dict_row(conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone())
        conn.close()
        return p

    def delete_project(self, pid):
        conn = get_db()
        conn.execute("DELETE FROM projects WHERE id=?", (pid,))
        conn.commit()
        conn.close()
        return {'ok': True}

    # ---- Dashboard ----
    def get_dashboard(self, year=None):
        if year is None:
            year = datetime.now().year
        conn = get_db()
        projects = dict_rows(conn.execute(
            "SELECT * FROM projects WHERE year=? ORDER BY priority DESC",
            (year,)).fetchall())

        total_p = len(projects)
        done_p = sum(1 for p in projects if p['status'] == '완료')
        prog_p = sum(1 for p in projects if p['status'] == '진행중')

        progresses = []
        for p in projects:
            t = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=?",
                             (p['id'],)).fetchone()['c']
            d = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=? AND is_done=1",
                             (p['id'],)).fetchone()['c']
            plans = dict_rows(conn.execute(
                "SELECT * FROM monthly_plans WHERE project_id=? ORDER BY month",
                (p['id'],)).fetchall())
            comp_m = sum(1 for pl in plans if pl['status'] == '완료')
            total_m = max(sum(1 for pl in plans if pl['milestone'] and pl['milestone'] != 'N/A'), 1)
            milestone_prog = round(comp_m / total_m * 100)
            p['progress'] = milestone_prog
            p['task_total'] = t
            p['task_done'] = d
            progresses.append(milestone_prog)

        avg_prog = round(sum(progresses) / len(progresses)) if progresses else 0

        today_str = date.today().isoformat()
        t_total = conn.execute(
            "SELECT COUNT(*) c FROM daily_tasks dt JOIN projects p ON dt.project_id=p.id "
            "WHERE p.year=? AND dt.task_date=?",
            (year, today_str)).fetchone()['c']
        t_done = conn.execute(
            "SELECT COUNT(*) c FROM daily_tasks dt JOIN projects p ON dt.project_id=p.id "
            "WHERE p.year=? AND dt.task_date=? AND dt.is_done=1",
            (year, today_str)).fetchone()['c']

        conn.close()
        return {
            'total_projects': total_p,
            'done_projects': done_p,
            'progress_projects': prog_p,
            'avg_progress': avg_prog,
            'today_total': t_total,
            'today_done': t_done,
            'projects': projects
        }

    # ---- Monthly Plans ----
    def get_monthly(self, project_id):
        conn = get_db()
        plans = dict_rows(conn.execute(
            "SELECT * FROM monthly_plans WHERE project_id=? ORDER BY month",
            (project_id,)).fetchall())
        conn.close()
        plan_map = {}
        for p in plans:
            plan_map[str(p['month'])] = p
        return plan_map

    def update_monthly(self, project_id, month, data):
        conn = get_db()
        ex = conn.execute("SELECT id FROM monthly_plans WHERE project_id=? AND month=?",
                          (project_id, month)).fetchone()
        if ex:
            conn.execute(
                "UPDATE monthly_plans SET milestone=?,target=?,status=?,note=? "
                "WHERE project_id=? AND month=?",
                (data.get('milestone', ''), data.get('target', ''),
                 data.get('status', '미완료'), data.get('note', ''),
                 project_id, month))
        else:
            conn.execute(
                "INSERT INTO monthly_plans (project_id,month,milestone,target,status,note) "
                "VALUES (?,?,?,?,?,?)",
                (project_id, month, data.get('milestone', ''), data.get('target', ''),
                 data.get('status', '미완료'), data.get('note', '')))
        conn.commit()
        plan = dict_row(conn.execute(
            "SELECT * FROM monthly_plans WHERE project_id=? AND month=?",
            (project_id, month)).fetchone())
        conn.close()
        return plan

    # ---- Daily Tasks ----
    def get_tasks(self, project_id, task_date=None):
        if task_date is None:
            task_date = date.today().isoformat()
        conn = get_db()
        tasks = dict_rows(conn.execute(
            "SELECT * FROM daily_tasks WHERE project_id=? AND task_date=? "
            "ORDER BY priority DESC, id",
            (project_id, task_date)).fetchall())
        conn.close()
        return tasks

    def get_task_dates(self, project_id, year_month=''):
        conn = get_db()
        if year_month:
            rows = conn.execute(
                "SELECT DISTINCT task_date FROM daily_tasks "
                "WHERE project_id=? AND task_date LIKE ?",
                (project_id, f"{year_month}-%")).fetchall()
        else:
            rows = conn.execute(
                "SELECT DISTINCT task_date FROM daily_tasks WHERE project_id=?",
                (project_id,)).fetchall()
        conn.close()
        return [r['task_date'] for r in rows]

    def create_task(self, data):
        title = data.get('title', '').strip()
        if not title:
            return {'error': '제목을 입력하세요'}
        task_date = data.get('task_date', date.today().isoformat())
        conn = get_db()
        cur = conn.execute(
            "INSERT INTO daily_tasks (project_id,task_date,title,description,priority) "
            "VALUES (?,?,?,?,?)",
            (data['project_id'], task_date, title,
             data.get('description', ''), data.get('priority', 1)))
        conn.commit()
        task = dict_row(conn.execute(
            "SELECT * FROM daily_tasks WHERE id=?", (cur.lastrowid,)).fetchone())
        conn.close()
        return task

    def update_task(self, tid, data):
        conn = get_db()
        if 'is_done' in data:
            conn.execute("UPDATE daily_tasks SET is_done=? WHERE id=?",
                         (data['is_done'], tid))
        if 'title' in data:
            conn.execute(
                "UPDATE daily_tasks SET title=?,description=?,priority=? WHERE id=?",
                (data.get('title', ''), data.get('description', ''),
                 data.get('priority', 1), tid))
        conn.commit()
        task = dict_row(conn.execute(
            "SELECT * FROM daily_tasks WHERE id=?", (tid,)).fetchone())
        conn.close()
        return task

    def delete_task(self, tid):
        conn = get_db()
        conn.execute("DELETE FROM daily_tasks WHERE id=?", (tid,))
        conn.commit()
        conn.close()
        return {'ok': True}

    # ---- Tracking ----
    def get_tracking(self, year=None, sort='priority_desc'):
        if year is None:
            year = datetime.now().year
        sort_sql = {
            "priority_desc": "ORDER BY priority DESC, id",
            "name_asc": "ORDER BY name COLLATE NOCASE ASC",
            "weight_desc": "ORDER BY weight DESC, id",
            "status": ("ORDER BY CASE status WHEN '진행중' THEN 1 WHEN '대기' THEN 2 "
                       "WHEN '완료' THEN 3 WHEN '취소' THEN 4 END, id"),
            "progress_desc": "ORDER BY priority DESC, id",
            "progress_asc": "ORDER BY priority ASC, id",
        }.get(sort, "ORDER BY priority DESC, id")

        conn = get_db()
        projects = dict_rows(conn.execute(
            f"SELECT * FROM projects WHERE year=? {sort_sql}", (year,)).fetchall())

        result = []
        for p in projects:
            t = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=?",
                             (p['id'],)).fetchone()['c']
            d = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=? AND is_done=1",
                             (p['id'],)).fetchone()['c']
            task_progress = round(d / t * 100) if t else 0

            plans = dict_rows(conn.execute(
                "SELECT * FROM monthly_plans WHERE project_id=? ORDER BY month",
                (p['id'],)).fetchall())
            comp_m = sum(1 for pl in plans if pl['status'] == '완료')
            total_m = max(sum(1 for pl in plans if pl['milestone']), 1)
            monthly_progress = round(comp_m / total_m * 100)

            plan_map = {}
            for pl in plans:
                plan_map[str(pl['month'])] = pl

            # 현재 월 마일스톤
            now_month = datetime.now().month
            cur_month_plan = plan_map.get(str(now_month), {})
            current_month_milestone = ''
            if cur_month_plan and cur_month_plan.get('milestone') and cur_month_plan['milestone'] != 'N/A':
                current_month_milestone = cur_month_plan['milestone']

            result.append({
                **p,
                'task_progress': task_progress,
                'monthly_progress': monthly_progress,
                'task_total': t,
                'task_done': d,
                'monthly_plans': plan_map,
                'current_month_milestone': current_month_milestone,
            })

        if sort == 'progress_desc':
            result.sort(key=lambda x: x['task_progress'], reverse=True)
        elif sort == 'progress_asc':
            result.sort(key=lambda x: x['task_progress'])

        conn.close()
        return result

    # ---- Weekly Summary ----
    def get_weekly_summary(self, year=None):
        if year is None:
            year = datetime.now().year
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        conn = get_db()
        rows = conn.execute(
            "SELECT dt.* FROM daily_tasks dt JOIN projects p ON dt.project_id=p.id "
            "WHERE p.year=? AND dt.task_date BETWEEN ? AND ?",
            (year, week_start.isoformat(), week_end.isoformat())).fetchall()
        week_total = len(rows)
        week_done = sum(1 for r in rows if r['is_done'])
        month = today.month
        plans = dict_rows(conn.execute(
            "SELECT mp.*, p.name as project_name FROM monthly_plans mp "
            "JOIN projects p ON mp.project_id=p.id "
            "WHERE p.year=? AND mp.month=? AND mp.milestone != '' AND mp.milestone != 'N/A'",
            (year, month)).fetchall())
        conn.close()
        return {
            'week_start': week_start.isoformat(),
            'week_end': week_end.isoformat(),
            'week_total': week_total,
            'week_done': week_done,
            'month_milestones': plans,
        }

    # ---- Deadline Alert ----
    def get_deadline_alerts(self, year=None):
        """마일스톤 마감 3일 전 알림"""
        if year is None:
            year = datetime.now().year
        today = date.today()
        current_month = today.month
        current_day = today.day
        conn = get_db()
        plans = dict_rows(conn.execute(
            "SELECT mp.*, p.name as project_name FROM monthly_plans mp "
            "JOIN projects p ON mp.project_id=p.id "
            "WHERE p.year=? AND mp.milestone != '' AND mp.milestone != 'N/A' "
            "AND mp.status NOT IN ('완료', '-')",
            (year,)).fetchall())
        conn.close()

        alerts = []
        for pl in plans:
            m = pl['month']
            if m < current_month:
                continue
            if m == 12:
                last_day = 31
            else:
                last_day = (date(year, m + 1, 1) - timedelta(days=1)).day
            deadline = date(year, m, last_day)
            days_left = (deadline - today).days
            if 0 <= days_left <= 3:
                alerts.append({
                    'project_name': pl['project_name'],
                    'milestone': pl['milestone'],
                    'month': m,
                    'days_left': days_left,
                    'deadline': deadline.isoformat(),
                })
        return alerts

    # ---- Weekly Trend ----
    def get_weekly_trend(self, year=None, weeks=8):
        if year is None:
            year = datetime.now().year
        today = date.today()
        conn = get_db()
        result = []
        for w in range(weeks - 1, -1, -1):
            ws = today - timedelta(weeks=w, days=today.weekday())
            we = ws + timedelta(days=6)
            total = conn.execute(
                "SELECT COUNT(*) c FROM daily_tasks dt JOIN projects p ON dt.project_id=p.id "
                "WHERE p.year=? AND dt.task_date BETWEEN ? AND ?",
                (year, ws.isoformat(), we.isoformat())).fetchone()['c']
            done = conn.execute(
                "SELECT COUNT(*) c FROM daily_tasks dt JOIN projects p ON dt.project_id=p.id "
                "WHERE p.year=? AND dt.task_date BETWEEN ? AND ? AND dt.is_done=1",
                (year, ws.isoformat(), we.isoformat())).fetchone()['c']
            label = f"{ws.month}/{ws.day}"
            result.append({'label': label, 'total': total, 'done': done})
        conn.close()
        return result

    # ---- Project Comparison ----
    def get_project_comparison(self, year=None):
        if year is None:
            year = datetime.now().year
        conn = get_db()
        projects = dict_rows(conn.execute(
            "SELECT * FROM projects WHERE year=? ORDER BY priority DESC",
            (year,)).fetchall())
        result = []
        for p in projects:
            t = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=?",
                             (p['id'],)).fetchone()['c']
            d = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=? AND is_done=1",
                             (p['id'],)).fetchone()['c']
            plans = dict_rows(conn.execute(
                "SELECT * FROM monthly_plans WHERE project_id=? ORDER BY month",
                (p['id'],)).fetchall())
            comp_m = sum(1 for pl in plans if pl['status'] == '완료')
            total_m = max(sum(1 for pl in plans if pl['milestone'] and pl['milestone'] != 'N/A'), 1)
            result.append({
                'name': p['name'],
                'task_progress': round(d / t * 100) if t else 0,
                'monthly_progress': round(comp_m / total_m * 100),
                'priority': p['priority'],
                'difficulty': p['difficulty'],
            })
        conn.close()
        return result

    # ---- Recurring Tasks ----
    def get_recurring_tasks(self, project_id):
        conn = get_db()
        rows = dict_rows(conn.execute(
            "SELECT * FROM recurring_tasks WHERE project_id=? ORDER BY id",
            (project_id,)).fetchall())
        conn.close()
        return rows

    def create_recurring_task(self, data):
        title = data.get('title', '').strip()
        if not title:
            return {'error': '제목을 입력하세요'}
        conn = get_db()
        cur = conn.execute(
            "INSERT INTO recurring_tasks (project_id,title,description,priority,frequency,day_of_week,day_of_month,end_date) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (data['project_id'], title, data.get('description', ''),
             data.get('priority', 1), data.get('frequency', 'weekly'),
             data.get('day_of_week', 1), data.get('day_of_month', 1),
             data.get('end_date', '')))
        conn.commit()
        rt = dict_row(conn.execute("SELECT * FROM recurring_tasks WHERE id=?",
                                   (cur.lastrowid,)).fetchone())
        conn.close()
        return rt

    def delete_recurring_task(self, rid):
        conn = get_db()
        # 템플릿 정보 조회 후 삭제
        tpl = conn.execute("SELECT * FROM recurring_tasks WHERE id=?", (rid,)).fetchone()
        if tpl:
            conn.execute(
                "DELETE FROM daily_tasks WHERE project_id=? AND title=? AND is_done=0",
                (tpl['project_id'], tpl['title']))
        conn.execute("DELETE FROM recurring_tasks WHERE id=?", (rid,))
        conn.commit()
        conn.close()
        return {'ok': True}

    def update_recurring_task(self, rid, data):
        """Update recurring task template and sync already-generated undone tasks."""
        new_title = data.get('title', '').strip()
        if not new_title:
            return {'error': '제목을 입력하세요'}
        conn = get_db()
        old = conn.execute("SELECT * FROM recurring_tasks WHERE id=?", (rid,)).fetchone()
        if not old:
            conn.close()
            return {'error': '반복 태스크를 찾을 수 없습니다.'}
        old_title = old['title']
        pid = old['project_id']
        conn.execute(
            "UPDATE recurring_tasks SET title=?,description=?,priority=?,frequency=?,day_of_week=?,day_of_month=?,end_date=? WHERE id=?",
            (new_title, data.get('description', ''), data.get('priority', 1),
             data.get('frequency', 'weekly'), data.get('day_of_week', 1),
             data.get('day_of_month', 1), data.get('end_date', ''), rid))
        # 미완료 태스크 동기화
        conn.execute(
            "UPDATE daily_tasks SET title=?,description=?,priority=? WHERE project_id=? AND title=? AND is_done=0",
            (new_title, data.get('description', ''), data.get('priority', 1), pid, old_title))
        # 주기/요일 변경 시 불일치 태스크 제거
        old_freq = old['frequency']
        new_freq = data.get('frequency', 'weekly')
        freq_changed = (old_freq != new_freq
                        or (new_freq == 'weekly' and old['day_of_week'] != data.get('day_of_week', 1))
                        or (new_freq == 'monthly' and old['day_of_month'] != data.get('day_of_month', 1)))
        if freq_changed:
            undone = dict_rows(conn.execute(
                "SELECT id, task_date FROM daily_tasks WHERE project_id=? AND title=? AND is_done=0",
                (pid, new_title)).fetchall())
            for task in undone:
                td = date.fromisoformat(task['task_date'])
                keep = False
                if new_freq == 'daily':
                    keep = True
                elif new_freq == 'weekly' and td.weekday() == data.get('day_of_week', 1):
                    keep = True
                elif new_freq == 'monthly' and td.day == data.get('day_of_month', 1):
                    keep = True
                if not keep:
                    conn.execute("DELETE FROM daily_tasks WHERE id=?", (task['id'],))
        conn.commit()
        rt = dict_row(conn.execute("SELECT * FROM recurring_tasks WHERE id=?", (rid,)).fetchone())
        conn.close()
        return rt

    def generate_recurring_tasks(self, project_id, target_date=None):
        """Generate tasks from recurring templates for the given date."""
        if target_date is None:
            target_date = date.today().isoformat()
        d = date.fromisoformat(target_date)
        dow = d.weekday()
        dom = d.day
        conn = get_db()
        templates = dict_rows(conn.execute(
            "SELECT * FROM recurring_tasks WHERE project_id=? AND is_active=1",
            (project_id,)).fetchall())
        created = 0
        for t in templates:
            if t.get('end_date') and t['end_date'] < target_date:
                continue
            match = False
            if t['frequency'] == 'daily':
                match = True
            elif t['frequency'] == 'weekly' and t['day_of_week'] == dow:
                match = True
            elif t['frequency'] == 'monthly' and t['day_of_month'] == dom:
                match = True
            if match:
                existing = conn.execute(
                    "SELECT id FROM daily_tasks WHERE project_id=? AND task_date=? AND title=?",
                    (project_id, target_date, t['title'])).fetchone()
                if not existing:
                    conn.execute(
                        "INSERT INTO daily_tasks (project_id,task_date,title,description,priority) "
                        "VALUES (?,?,?,?,?)",
                        (project_id, target_date, t['title'], t['description'], t['priority']))
                    created += 1
        conn.commit()
        conn.close()
        return {'created': created}

    # ---- Task Comments ----
    def get_task_comments(self, task_id):
        conn = get_db()
        rows = dict_rows(conn.execute(
            "SELECT * FROM task_comments WHERE task_id=? ORDER BY created_at DESC",
            (task_id,)).fetchall())
        conn.close()
        return rows

    def add_task_comment(self, task_id, content):
        content = content.strip()
        if not content:
            return {'error': '내용을 입력하세요'}
        conn = get_db()
        cur = conn.execute(
            "INSERT INTO task_comments (task_id, content) VALUES (?,?)",
            (task_id, content))
        conn.commit()
        c = dict_row(conn.execute("SELECT * FROM task_comments WHERE id=?",
                                  (cur.lastrowid,)).fetchone())
        conn.close()
        return c

    def delete_task_comment(self, cid):
        conn = get_db()
        conn.execute("DELETE FROM task_comments WHERE id=?", (cid,))
        conn.commit()
        conn.close()
        return {'ok': True}

    # ---- Clone Project ----
    def clone_project(self, source_pid, target_year):
        conn = get_db()
        src = conn.execute("SELECT * FROM projects WHERE id=?",
                           (source_pid,)).fetchone()
        if not src:
            conn.close()
            return {'error': '원본 프로젝트를 찾을 수 없습니다.'}
        conn.execute("INSERT OR IGNORE INTO years (year) VALUES (?)", (target_year,))
        cur = conn.execute(
            "INSERT INTO projects (year,name,description,kpi,weight,priority,difficulty,status) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (target_year, src['name'], src['description'], src['kpi'],
             src['weight'], src['priority'], src['difficulty'], '대기'))
        new_pid = cur.lastrowid
        # 월별 계획 복제
        plans = conn.execute(
            "SELECT * FROM monthly_plans WHERE project_id=?",
            (source_pid,)).fetchall()
        for pl in plans:
            conn.execute(
                "INSERT INTO monthly_plans (project_id,month,milestone,target,status,note) "
                "VALUES (?,?,?,?,?,?)",
                (new_pid, pl['month'], pl['milestone'], pl['target'], '미완료', pl['note']))
        # 반복 태스크 복제
        recs = conn.execute(
            "SELECT * FROM recurring_tasks WHERE project_id=?",
            (source_pid,)).fetchall()
        for r in recs:
            conn.execute(
                "INSERT INTO recurring_tasks (project_id,title,description,priority,frequency,day_of_week,day_of_month,end_date) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (new_pid, r['title'], r['description'], r['priority'],
                 r['frequency'], r['day_of_week'], r['day_of_month'], r.get('end_date', '')))
        conn.commit()
        p = dict_row(conn.execute("SELECT * FROM projects WHERE id=?",
                                  (new_pid,)).fetchone())
        conn.close()
        return p

    # ---- Export ----
    def export_report(self, year=None, fmt='csv'):
        """Generate CSV report data (returned as string)."""
        if year is None:
            year = datetime.now().year
        conn = get_db()
        projects = dict_rows(conn.execute(
            "SELECT * FROM projects WHERE year=? ORDER BY priority DESC",
            (year,)).fetchall())
        lines = []
        lines.append('프로젝트,상태,가중치,중요도,난이도,Target,실적,태스크총수,태스크완료,달성률,월별달성률')
        for p in projects:
            t = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=?",
                             (p['id'],)).fetchone()['c']
            d = conn.execute("SELECT COUNT(*) c FROM daily_tasks WHERE project_id=? AND is_done=1",
                             (p['id'],)).fetchone()['c']
            tp = round(d / t * 100) if t else 0
            plans = dict_rows(conn.execute(
                "SELECT * FROM monthly_plans WHERE project_id=? ORDER BY month",
                (p['id'],)).fetchall())
            comp_m = sum(1 for pl in plans if pl['status'] == '완료')
            total_m = max(sum(1 for pl in plans if pl['milestone'] and pl['milestone'] != 'N/A'), 1)
            mp = round(comp_m / total_m * 100)
            line = f"{p['name']},{p['status']},{p['weight']},{p['priority']},{p['difficulty']},{p.get('target_value','')},{p.get('actual_value','')},{t},{d},{tp}%,{mp}%"
            lines.append(line)
        lines.append('')
        lines.append('프로젝트,월,마일스톤,상태,목표')
        for p in projects:
            plans = dict_rows(conn.execute(
                "SELECT * FROM monthly_plans WHERE project_id=? ORDER BY month",
                (p['id'],)).fetchall())
            for pl in plans:
                if pl['milestone']:
                    lines.append(f"{p['name']},{pl['month']}월,{pl['milestone']},{pl['status']},{pl['target']}")
        conn.close()
        return '\n'.join(lines)

    def save_csv_file(self, year=None):
        """Open native save dialog and write CSV report to chosen location."""
        if year is None:
            year = datetime.now().year
        csv_data = self.export_report(year, 'csv')
        try:
            result = webview.windows[0].create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=f'MBO_Report_{year}.csv',
                file_types=('CSV Files (*.csv)',)
            )
        except Exception:
            return {'ok': False, 'message': '파일 저장 대화상자를 열 수 없습니다.'}
        if not result:
            return {'ok': False, 'message': 'cancelled'}
        file_path = result if isinstance(result, str) else result[0]
        try:
            with open(file_path, 'w', encoding='utf-8-sig', newline='') as f:
                f.write(csv_data)
            return {'ok': True, 'path': file_path}
        except Exception as e:
            return {'ok': False, 'message': str(e)}

    # ---- Gantt ----
    def get_gantt(self, year=None):
        if year is None:
            year = datetime.now().year
        conn = get_db()
        projects = dict_rows(conn.execute(
            "SELECT * FROM projects WHERE year=? ORDER BY priority DESC, id",
            (year,)).fetchall())

        result = []
        for p in projects:
            plans = dict_rows(conn.execute(
                "SELECT * FROM monthly_plans WHERE project_id=? ORDER BY month",
                (p['id'],)).fetchall())
            plan_map = {}
            for pl in plans:
                plan_map[str(pl['month'])] = pl
            result.append({**p, 'monthly_plans': plan_map})
        conn.close()
        return result

    # ---- Current Month Milestone ----
    def get_current_milestone(self, project_id, year, month):
        conn = get_db()
        plan = conn.execute(
            "SELECT milestone, status FROM monthly_plans WHERE project_id=? AND month=?",
            (project_id, month)).fetchone()
        conn.close()
        if plan:
            return {'milestone': plan['milestone'] or '', 'status': plan['status'] or ''}
        return {'milestone': '', 'status': ''}

    # ---- Notification ----
    def get_notification(self):
        import hashlib
        import urllib.request

        raw = ''
        updated = ''
        source = 'none'

        # GitHub 원격 로딩 (캐시 우회)
        try:
            import time as _time
            cache_bust_url = f"{GITHUB_NOTIFICATION_URL}?t={int(_time.time())}"
            req = urllib.request.Request(
                cache_bust_url,
                headers={'User-Agent': 'MBO-Project-Leader'}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                raw = resp.read().decode('utf-8')
                source = 'remote'
                updated = datetime.now().strftime('%Y-%m-%d %H:%M') + ' (온라인)'
        except Exception:
            pass

        # 2) 원격 실패 시 로컬 파일 폴백
        if not raw.strip():
            notification_path = os.path.join(BASE_DIR, 'notification.md')
            if not os.path.exists(notification_path):
                notification_path = os.path.join(APP_DIR, 'notification.md')
            if os.path.exists(notification_path):
                with open(notification_path, 'r', encoding='utf-8') as f:
                    raw = f.read()
                mtime = os.path.getmtime(notification_path)
                updated = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M') + ' (로컬)'
                source = 'local'

        if not raw.strip():
            return {'raw': '', 'html': '', 'updated': '', 'hash': ''}

        content_hash = hashlib.md5(raw.strip().encode('utf-8')).hexdigest()
        # DB에서 읽음 여부 확인
        conn = get_db()
        row = conn.execute("SELECT value FROM app_settings WHERE key='notification_read_hash'").fetchone()
        read_hash = row['value'] if row else ''
        conn.close()
        return {'raw': raw, 'html': _md_to_html(raw), 'updated': updated,
                'hash': content_hash, 'is_read': content_hash == read_hash}

    def mark_notification_read(self, content_hash):
        conn = get_db()
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('notification_read_hash', ?)",
            (content_hash,))
        conn.commit()
        conn.close()
        return {'ok': True}

    def get_setting(self, key):
        conn = get_db()
        row = conn.execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
        conn.close()
        return {'value': row['value'] if row else ''}

    def set_setting(self, key, value):
        conn = get_db()
        conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", (key, value))
        conn.commit()
        conn.close()
        return {'ok': True}


# ============================================================
# 엔트리 포인트
# ============================================================
def _set_window_icon(icon_path):
    """Set window and taskbar icon via Win32 API (pywebview workaround)."""
    if sys.platform != 'win32' or not icon_path:
        return
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        shell32 = ctypes.windll.shell32

        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x0010
        LR_DEFAULTSIZE = 0x0040
        hicon_big = user32.LoadImageW(0, icon_path, IMAGE_ICON, 48, 48, LR_LOADFROMFILE)
        hicon_small = user32.LoadImageW(0, icon_path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE)

        if not hicon_big:
            return

        import time
        time.sleep(0.5)
        hwnd = user32.FindWindowW(None, webview.windows[0].title)
        if not hwnd:
            return

        WM_SETICON = 0x0080
        ICON_BIG = 1
        ICON_SMALL = 0
        user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big)
        user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small or hicon_big)
    except Exception:
        pass


def _cleanup_update_files():
    """앱 시작 3초 후 업데이트 임시 파일(_updater.bat, _update_progress.hta, _new_update.exe) 삭제"""
    import time
    time.sleep(3)
    for fname in ['_updater.bat', '_update_progress.hta', '_new_update.exe']:
        fpath = os.path.join(BASE_DIR, fname)
        try:
            if os.path.exists(fpath):
                os.remove(fpath)
        except Exception:
            pass


def main():
    init_db()
    api = Api()
    html_path = os.path.join(APP_DIR, 'index.html')
    icon_path = os.path.abspath(os.path.join(APP_DIR, 'app_icon.ico'))
    icon = icon_path if os.path.exists(icon_path) else None

    # 업데이트 임시 파일 정리 (시작 3초 후)
    threading.Thread(target=_cleanup_update_files, daemon=True).start()

    window = webview.create_window(
        f'MBO Project Leader v{__version__}',
        url=html_path,
        js_api=api,
        width=1280,
        height=800,
        min_size=(800, 600),
    )

    if icon:
        threading.Thread(target=_set_window_icon, args=(icon,), daemon=True).start()

    webview.start(debug=False, icon=icon)


if __name__ == "__main__":
    main()
