"""Repeatable benchmark: run against a production build (next start) on :3000.
usage: bench.py <label>  -> writes /home/claude/stack/bench-<label>.json"""
import json, sys, time, statistics, subprocess, os
from playwright.sync_api import sync_playwright
LABEL = sys.argv[1]
BASE = 'http://127.0.0.1:3000'
LOG = '/home/claude/stack/requests.log'
RUNS = 5
def psql(sql): return subprocess.run(['psql','-h','127.0.0.1','-p','54322','-U','postgres','-tAc',sql],capture_output=True,text=True).stdout.strip()
def log_lines():
    try: return open(LOG).read().splitlines()
    except FileNotFoundError: return []
def med(xs): return round(statistics.median(xs), 1) if xs else None
EID = psql("select id from employees where employee_code='1007'")
ADMIN_PAGES = ['/admin/dashboard', '/admin/employees', f'/admin/employees/{EID}', '/admin/attendance', '/admin/productivity',
               '/admin/activity', '/admin/leave', '/admin/payroll', '/admin/salary-slips', '/admin/notifications',
               '/admin/approvals', '/admin/compliance', '/admin/compliance/controls', '/admin/audit-logs', '/admin/roles']
STAFF_PAGES = ['/admin/dashboard', '/admin/attendance', '/admin/productivity', '/admin/leave', '/admin/notifications']
result = {'label': LABEL, 'pages': {}, 'login': {}, 'api': {}, 'client_nav': {}}

def login(pg, email, pw):
    pg.goto(BASE + '/login', wait_until='networkidle')
    pg.fill('input[name=email]', email); pg.fill('input[name=password]', pw)
    t0 = time.perf_counter()
    with pg.expect_response(lambda r: '/auth/v1/token' in r.url) as tok:
        pg.click('button[type=submit]')
    t_token = (time.perf_counter() - t0) * 1000
    pg.wait_for_url('**/dashboard', timeout=180000)
    pg.wait_for_load_state('load')
    t_dash = (time.perf_counter() - t0) * 1000
    return t_token, t_dash

def measure_page(pg, path):
    samples = []
    for i in range(RUNS + 1):
        before = len(log_lines())
        pg.goto(BASE + path, wait_until='load', timeout=240000)
        pg.wait_for_timeout(1200)
        nav = pg.evaluate("""() => { const n = performance.getEntriesByType('navigation')[0];
          const js = performance.getEntriesByType('resource').filter(r => r.initiatorType === 'script' || r.name.endsWith('.js'));
          return { ttfb: n.responseStart - n.requestStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd,
                   html: n.encodedBodySize, js: js.reduce((a, r) => a + (r.encodedBodySize || r.transferSize || 0), 0), jsFiles: js.length }; }""")
        lines = log_lines()[before:]
        nav['db_requests'] = len([l for l in lines if ' /rest/v1 ' in l])
        nav['auth_requests'] = len([l for l in lines if ' /auth/v1 ' in l])
        nav['db_ms'] = sum(int(l.split()[-1]) for l in lines)
        if i > 0: samples.append(nav)  # first load warms the route
    return {k: med([s[k] for s in samples]) for k in samples[0]}

with sync_playwright() as p:
    b = p.chromium.launch()
    psql('select pg_stat_statements_reset()')
    for role, email, pw, pages in [('super_admin', 'rohit@quoreb2b.com', 'Quore#2026admin', ADMIN_PAGES), ('agent', 'anis@quoreb2b.com', 'Quore#2026staff', STAFF_PAGES)]:
        logins = []
        for _ in range(3):
            ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
            logins.append(login(pg, email, pw)); ctx.close()
        result['login'][role] = {'token_ms': med([l[0] for l in logins]), 'to_dashboard_ms': med([l[1] for l in logins])}
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
        login(pg, email, pw)
        result['pages'][role] = {path: measure_page(pg, path) for path in pages}
        if role == 'super_admin':
            # API endpoints with the signed-in cookies
            for api in ['/api/time']:
                ts = []
                for _ in range(10):
                    t0 = time.perf_counter(); r = ctx.request.get(BASE + api); ts.append((time.perf_counter() - t0) * 1000)
                result['api'][api] = {'median_ms': med(ts), 'status': r.status}
            # client-side navigation through the side menu
            for label, target in [('Employees', '/admin/employees'), ('Attendance', '/admin/attendance'), ('Command center', '/admin/dashboard')]:
                ts = []
                for _ in range(RUNS):
                    pg.goto(BASE + '/admin/leave', wait_until='load'); pg.wait_for_timeout(800)
                    t0 = time.perf_counter()
                    pg.locator('[data-sidebar=menu-button]', has_text=label).first.click()
                    pg.wait_for_url('**' + target, timeout=120000); pg.wait_for_load_state('load')
                    pg.locator('main h1').first.wait_for(timeout=120000)
                    ts.append((time.perf_counter() - t0) * 1000)
                result['client_nav'][label] = med(ts)
        ctx.close()
    b.close()
top = psql("""select round(total_exec_time::numeric,1)||'|'||calls||'|'||round(mean_exec_time::numeric,2)||'|'||rows||'|'||left(regexp_replace(query,'\\s+',' ','g'),160)
              from pg_stat_statements where query not ilike '%pg_stat_statements%' order by total_exec_time desc limit 25""")
result['db_top'] = top.splitlines()
result['db_total'] = psql("select round(sum(total_exec_time)::numeric,1)||' ms over '||sum(calls)||' statements' from pg_stat_statements where query not ilike '%pg_stat_statements%'")
json.dump(result, open(f'/home/claude/stack/bench-{LABEL}.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in result.items() if k not in ('db_top',)}, indent=1)[:6000])
