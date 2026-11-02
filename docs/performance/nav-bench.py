import sys, time, statistics
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:3000'; out={}
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1440,'height':900})
    pg.goto(BASE+'/login', wait_until='networkidle')
    pg.fill('input[name=email]','rohit@quoreb2b.com'); pg.fill('input[name=password]','Quore#2026admin')
    pg.click('button[type=submit]'); pg.wait_for_url('**/dashboard'); pg.wait_for_timeout(2000)
    for dwell in (0, 250):
        for label, target in [('Employees','/admin/employees'),('Attendance','/admin/attendance'),('Command center','/admin/dashboard'),('Leave','/admin/leave'),('Payroll runs','/admin/payroll')]:
            ts=[]
            for _ in range(5):
                start = '/admin/notifications'
                pg.goto(BASE+start, wait_until='load'); pg.wait_for_timeout(1200)
                link = pg.locator('[data-sidebar=menu-button]', has_text=label).first
                link.hover(); pg.wait_for_timeout(dwell)
                t0=time.perf_counter(); link.click()
                pg.wait_for_url('**'+target, timeout=120000); pg.locator('main h1').first.wait_for(timeout=120000)
                ts.append((time.perf_counter()-t0)*1000)
            out[f'{label} (hover {dwell}ms)']=round(statistics.median(ts),1)
    b.close()
print(sys.argv[1], out)
