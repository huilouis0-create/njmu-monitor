const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAdmissionsList,
  parseGraduateSchoolList,
  parseTeachingOperationsList,
  parseFirstClinicalSchoolAnnouncementsList,
  updateSiteHealth,
  markSiteAlerted,
  buildErrorMessage,
} = require('./monitor');

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
});
