const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  fetchUrl,
  parseAdmissionsList,
  parseGraduateSchoolList,
  parseTeachingOperationsList,
  parseFirstClinicalSchoolAnnouncementsList,
  updateSiteHealth,
  markSiteAlerted,
  buildErrorMessage,
} = require('./monitor');

async function localServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return server;
}

test('慢 DNS 超过 Agent 默认超时后，在请求时限内仍能成功', async (t) => {
  const server = await localServer(t, (req, res) => res.end('notice list'));
  const originalAgent = http.globalAgent;
  // Scale the production 5s Agent timeout down to 50ms. DNS takes 150ms,
  // comfortably within the explicit 1s request deadline.
  const agent = new http.Agent({
    keepAlive: true,
    timeout: 50,
    lookup: (hostname, options, callback) => {
      setTimeout(() => callback(null, '127.0.0.1', 4), 150);
    },
  });
  http.globalAgent = agent;
  t.after(() => {
    http.globalAgent = originalAgent;
    agent.destroy();
  });

  const body = await fetchUrl(`http://slow-dns.test:${server.address().port}/`, {
    attempts: 1,
    timeoutMs: 1000,
  });
  assert.equal(body, 'notice list');
});

test('服务器无响应时仍按请求时限终止', async (t) => {
  const server = await localServer(t, () => {});
  const start = Date.now();
  await assert.rejects(
    fetchUrl(`http://127.0.0.1:${server.address().port}/`, { attempts: 1, timeoutMs: 1000 }),
    (error) => {
      assert.equal(error.code, 'ETIMEDOUT');
      assert.match(error.message, /timeout after \d+ms/);
      assert.match(error.message, /limit=1000ms, phase=waiting-response, host=127\.0\.0\.1/);
      return true;
    }
  );
  assert.ok(Date.now() - start >= 900, '不得提前触发默认短超时');
});

test('DNS 一直不返回时，总时限仍能终止请求', async (t) => {
  const originalAgent = http.globalAgent;
  const agent = new http.Agent({ keepAlive: true, timeout: 50, lookup: () => {} });
  http.globalAgent = agent;
  t.after(() => {
    http.globalAgent = originalAgent;
    agent.destroy();
  });
  const start = Date.now();
  await assert.rejects(
    fetchUrl('http://stalled-dns.test/', { attempts: 1, timeoutMs: 1000 }),
    (error) => {
      assert.equal(error.code, 'ETIMEDOUT');
      assert.match(error.message, /phase=dns\/tcp/);
      return true;
    }
  );
  assert.ok(Date.now() - start >= 900, 'DNS 阶段也应使用显式请求时限');
});

test('响应正文未完成时，总时限仍能终止请求', async (t) => {
  const server = await localServer(t, (req, res) => res.write('partial notice'));
  await assert.rejects(
    fetchUrl(`http://127.0.0.1:${server.address().port}/`, { attempts: 1, timeoutMs: 1000 }),
    (error) => {
      assert.equal(error.code, 'ETIMEDOUT');
      assert.match(error.message, /phase=response-body/);
      return true;
    }
  );
});

test('解析研究生招生网通知并去重', () => {
  const html = `
    <ul>
      <li class="news n1 clearfix">
        <a href="/2026/0730/c10166a123/page.htm" title="招生通知 &amp; 补充说明">通知</a>
        <span class="news_meta">2026-07-30</span>
      </li>
      <li>
        <a href="/2026/0730/c10166a123/page.htm">重复通知</a>
        <span>2026-07-30</span>
      </li>
    </ul>`;

  assert.deepEqual(parseAdmissionsList(html), [
    {
      url: 'https://yjszs.njmu.edu.cn/2026/0730/c10166a123/page.htm',
      title: '招生通知 & 补充说明',
      date: '2026-07-30',
      siteIndex: 0,
    },
  ]);
});

test('解析研究生院通知', () => {
  const html = `
    <div class="jzlb clearfix">
      <div><a href="/2026/0729/c19149a456/page.htm"><span>培养工作通知</span></a></div>
      <div><div class="fbsj4">2026-07-29</div></div>
    </div>`;

  assert.deepEqual(parseGraduateSchoolList(html), [
    {
      url: 'https://yjsy.njmu.edu.cn/2026/0729/c19149a456/page.htm',
      title: '培养工作通知',
      date: '2026-07-29',
      siteIndex: 1,
    },
  ]);
});

test('解析教学管理处教学运行通知', () => {
  const html = `
    <ul class="news_list list2">
      <li class="news n1 clearfix">
        <span class="news_title">
          <a href='/2026/0806/c20051a305240/page.htm' title='2025级本科生转专业笔试、面试通知'>通知</a>
        </span>
        <span class="news_meta">2026-08-06</span>
      </li>
    </ul>`;

  assert.deepEqual(parseTeachingOperationsList(html), [
    {
      url: 'https://jxglc.njmu.edu.cn/2026/0806/c20051a305240/page.htm',
      title: '2025级本科生转专业笔试、面试通知',
      date: '2026-08-06',
      siteIndex: 2,
    },
  ]);
});

test('解析第一临床医学院通知公告', () => {
  const html = `
    <ul class="news_list list2">
      <li class="news n1 clearfix">
        <span class="news_title">
          <a href='/2024/0527/c20747a264569/page.htm' target='_blank'
             title='关于推荐四位同学申报2024年度最具影响力本科毕业生的公示'>公告</a>
        </span>
        <span class="news_meta">2024-05-27</span>
      </li>
    </ul>`;

  assert.deepEqual(parseFirstClinicalSchoolAnnouncementsList(html), [
    {
      url: 'https://dylc.njmu.edu.cn/2024/0527/c20747a264569/page.htm',
      title: '关于推荐四位同学申报2024年度最具影响力本科毕业生的公示',
      date: '2024-05-27',
      siteIndex: 3,
    },
  ]);
});

test('单次失败不告警，连续两次失败只告警一次，成功后清零', () => {
  const state = { health: {} };
  const site = { name: '测试站点', url: 'https://example.edu/list.htm' };

  const first = updateSiteHealth(state, site, new Error('timeout'), '2026-07-30T00:00:00Z', 2);
  assert.equal(first.consecutiveFailures, 1);
  assert.equal(first.persistent, false);
  assert.equal(first.shouldAlert, false);

  const second = updateSiteHealth(state, site, new Error('timeout'), '2026-07-30T00:30:00Z', 2);
  assert.equal(second.consecutiveFailures, 2);
  assert.equal(second.persistent, true);
  assert.equal(second.shouldAlert, true);

  markSiteAlerted(state, site.url);
  const third = updateSiteHealth(state, site, new Error('timeout'), '2026-07-30T01:00:00Z', 2);
  assert.equal(third.persistent, true);
  assert.equal(third.shouldAlert, false);

  const recovered = updateSiteHealth(state, site, null, '2026-07-30T01:30:00Z', 2);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.needsBaseline, true);
  assert.equal(state.health[site.url].consecutiveFailures, 0);
  assert.equal(state.health[site.url].alertSent, false);

  const nextSuccess = updateSiteHealth(state, site, null, '2026-07-30T02:00:00Z', 2);
  assert.equal(nextSuccess.needsBaseline, false);
});

test('持续异常消息包含连续失败轮数', () => {
  const html = buildErrorMessage([
    { site: '测试站点', consecutiveFailures: 2, error: 'ETIMEDOUT: timeout' },
  ]);
  assert.match(html, /连续 2 轮失败/);
  assert.match(html, /ETIMEDOUT/);
  assert.doesNotMatch(html, /已排除/);
});
