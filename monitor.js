/**
 * 南京医科大学网站通知监控脚本
 *
 * 监控四个网站：
 *   1. 研究生招生网 - 招生动态: https://yjszs.njmu.edu.cn/10166/list.htm
 *   2. 研究生院 - 通知公告: https://yjsy.njmu.edu.cn/tzgg_19149/list.htm
 *   3. 教学管理处 - 教学运行: https://jxglc.njmu.edu.cn/20051/list.htm
 *   4. 第一临床医学院 - 通知公告: https://dylc.njmu.edu.cn/20747/list.htm
 *
 * 可靠性策略：
 *   - 列表页并行抓取，单次短暂故障只记录，连续失败才告警。
 *   - 新通知只有在 PushPlus 推送成功后才写入 state，避免漏推。
 *   - 对列表中的近期通知抓取详情页内容指纹，同一个 URL 内容更新也会提醒。
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sendPushPlus } = require('./pushplus');

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
const FETCH_RETRIES = Number(process.env.FETCH_RETRIES || 3);
const RETRY_BASE_DELAY_MS = Number(process.env.RETRY_BASE_DELAY_MS || 5000);
const FAILURE_ALERT_THRESHOLD = Number(process.env.FAILURE_ALERT_THRESHOLD || 2);
const DETAIL_CHECK_LIMIT_PER_SITE = Number(process.env.DETAIL_CHECK_LIMIT_PER_SITE || 8);
const DETAIL_REQUEST_TIMEOUT_MS = Number(process.env.DETAIL_REQUEST_TIMEOUT_MS || 12000);
const DETAIL_FETCH_RETRIES = Number(process.env.DETAIL_FETCH_RETRIES || 1);
const DETAIL_FETCH_CONCURRENCY = Number(process.env.DETAIL_FETCH_CONCURRENCY || 3);
const MAX_REDIRECTS = 5;

const SITES = [
  {
    name: '研究生招生网 - 招生动态',
    url: 'https://yjszs.njmu.edu.cn/10166/list.htm',
    siteIndex: 0,
    parse: (html) => parseAdmissionsList(html),
  },
  {
    name: '研究生院 - 通知公告',
    url: 'https://yjsy.njmu.edu.cn/tzgg_19149/list.htm',
    siteIndex: 1,
    parse: (html) => parseGraduateSchoolList(html),
  },
  {
    name: '教学管理处 - 教学运行',
    url: 'https://jxglc.njmu.edu.cn/20051/list.htm',
    siteIndex: 2,
    parse: (html) => parseTeachingOperationsList(html),
  },
  {
    name: '第一临床医学院 - 通知公告',
    url: 'https://dylc.njmu.edu.cn/20747/list.htm',
    siteIndex: 3,
    parse: (html) => parseFirstClinicalSchoolAnnouncementsList(html),
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function stripHtml(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function contentFingerprint(html) {
  const normalized = stripHtml(html);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function absoluteUrl(baseUrl, href) {
  return new URL(href, baseUrl).href;
}

function parseSimpleNewsList(html, baseUrl, siteIndex) {
  const items = [];
  const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRegex.exec(html)) !== null) {
    const block = match[1];
    const linkMatch = block.match(/<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
    const titleAttr = block.match(/<a\b[^>]*title=['"]([^'"]*)['"]/i);
    const dateMatch = block.match(/(\d{4}-\d{2}-\d{2})/);
    if (!linkMatch || !dateMatch || !/page\.htm/i.test(linkMatch[1])) continue;

    const title = decodeHtml(titleAttr ? titleAttr[1] : stripHtml(linkMatch[2])).trim();
    items.push({
      url: absoluteUrl(baseUrl, linkMatch[1]),
      title,
      date: dateMatch[1],
      siteIndex,
    });
  }
  return dedupeItems(items);
}

function parseAdmissionsList(html) {
  return parseSimpleNewsList(html, 'https://yjszs.njmu.edu.cn/10166/list.htm', 0);
}

function parseTeachingOperationsList(html) {
  return parseSimpleNewsList(html, 'https://jxglc.njmu.edu.cn/20051/list.htm', 2);
}

function parseFirstClinicalSchoolAnnouncementsList(html) {
  return parseSimpleNewsList(html, 'https://dylc.njmu.edu.cn/20747/list.htm', 3);
}

function parseGraduateSchoolList(html) {
  const items = [];
  const blockRegex = /<div\s+class=["']jzlb\s+clearfix["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/gi;
  let match;
  while ((match = blockRegex.exec(html)) !== null) {
    const block = match[0];
    const linkMatch = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const dateMatch = block.match(/<div\s+class=["']fbsj4["'][^>]*>\s*(\d{4}-\d{2}-\d{2})/i);
    if (!linkMatch || !dateMatch) continue;

    items.push({
      url: absoluteUrl('https://yjsy.njmu.edu.cn/tzgg_19149/list.htm', linkMatch[1]),
      title: stripHtml(linkMatch[2]),
      date: dateMatch[1],
      siteIndex: 1,
    });
  }

  if (items.length > 0) return dedupeItems(items);

  const linkRegex = /<a\b[^>]*href=["']([^"']*\/page\.htm)["'][^>]*>([\s\S]*?)<\/a>\s*[\s\S]{0,300}?(\d{4}-\d{2}-\d{2})/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    items.push({
      url: absoluteUrl('https://yjsy.njmu.edu.cn/tzgg_19149/list.htm', match[1]),
      title: stripHtml(match[2]),
      date: match[3],
      siteIndex: 1,
    });
  }
  return dedupeItems(items);
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function requestOnce(url, timeoutMs, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    let settled = false;
    let req;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      callback(value);
    };

    const overallTimer = setTimeout(() => {
      const error = new Error(`request timeout after ${timeoutMs}ms`);
      error.code = 'ETIMEDOUT';
      req?.destroy(error);
    }, timeoutMs);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || undefined,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      family: 4,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    };

    req = client.request(options, (res) => {
      const statusCode = res.statusCode || 0;
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          finish(reject, new Error(`too many redirects for ${url}`));
          return;
        }

        const redirectUrl = new URL(res.headers.location, url).href;
        if (settled) return;
        settled = true;
        clearTimeout(overallTimer);
        requestOnce(redirectUrl, timeoutMs, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (statusCode >= 400) {
        res.resume();
        finish(reject, new Error(`HTTP ${statusCode}`));
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => finish(resolve, data));
      res.on('error', (error) => finish(reject, error));
    });

    req.on('error', (error) => finish(reject, error));
    req.setTimeout(timeoutMs, () => {
      const error = new Error(`socket timeout after ${timeoutMs}ms`);
      error.code = 'ETIMEDOUT';
      req.destroy(error);
    });
    req.end();
  });
}

function errorMessage(error) {
  const message = error?.message || String(error);
  return error?.code && !message.includes(error.code) ? `${error.code}: ${message}` : message;
}

async function fetchUrl(url, options = {}) {
  const attempts = Math.max(1, Number(options.attempts ?? FETCH_RETRIES));
  const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? REQUEST_TIMEOUT_MS));
  const label = options.label || url;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const body = await requestOnce(url, timeoutMs);
      if (options.validate) options.validate(body);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;

      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.warn(
        `   ${label} 第 ${attempt}/${attempts} 次抓取失败：${errorMessage(error)}，` +
          `${delay / 1000}s 后重试`
      );
      await sleep(delay);
    }
  }

  const finalError = new Error(
    `${label} 连续 ${attempts} 次抓取失败：${errorMessage(lastError)}`
  );
  finalError.code = lastError?.code;
  throw finalError;
}

function makeKey(item) {
  return item.url;
}

function loadState(filePath) {
  const state = { seenSet: new Set(), records: {}, health: {} };
  try {
    if (!fs.existsSync(filePath)) return state;

    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    if (Array.isArray(data)) {
      state.seenSet = new Set(data);
      return state;
    }

    if (Array.isArray(data.seen)) {
      state.seenSet = new Set(data.seen);
    }

    if (data.items && typeof data.items === 'object') {
      state.records = data.items;
    }

    if (data.health && typeof data.health === 'object') {
      state.health = data.health;
    }
  } catch (error) {
    console.error('读取 state.json 失败：', error.message);
  }
  return state;
}

function saveState(filePath, state) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const items = {};
  for (const url of Object.keys(state.records).sort()) {
    items[url] = state.records[url];
  }

  const health = {};
  for (const url of Object.keys(state.health || {}).sort()) {
    health[url] = state.health[url];
  }

  const data = JSON.stringify(
    {
      seen: [...state.seenSet].sort(),
      items,
      health,
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
  fs.writeFileSync(filePath, data, 'utf8');
}

function updateSiteHealth(state, site, error, now, alertThreshold = FAILURE_ALERT_THRESHOLD) {
  if (!state.health || typeof state.health !== 'object') state.health = {};

  const previous = state.health[site.url] || {};
  const initialized = previous.initialized ?? Boolean(previous.lastSuccessAt);
  if (!error) {
    const recovered = Number(previous.consecutiveFailures || 0) > 0;
    state.health[site.url] = {
      siteName: site.name,
      initialized: true,
      consecutiveFailures: 0,
      alertSent: false,
      lastCheckedAt: now,
      lastSuccessAt: now,
      lastFailureAt: previous.lastFailureAt || null,
      lastError: null,
    };
    return {
      consecutiveFailures: 0,
      persistent: false,
      shouldAlert: false,
      recovered,
      needsBaseline: !initialized,
    };
  }

  const consecutiveFailures = Number(previous.consecutiveFailures || 0) + 1;
  const alertSent = Boolean(previous.alertSent);
  state.health[site.url] = {
    siteName: site.name,
    initialized,
    consecutiveFailures,
    alertSent,
    lastCheckedAt: now,
    lastSuccessAt: previous.lastSuccessAt || null,
    lastFailureAt: now,
    lastError: errorMessage(error),
  };

  return {
    consecutiveFailures,
    persistent: consecutiveFailures >= alertThreshold,
    shouldAlert: consecutiveFailures >= alertThreshold && !alertSent,
    recovered: false,
    needsBaseline: false,
  };
}

function markSiteAlerted(state, siteUrl) {
  if (state.health?.[siteUrl]) state.health[siteUrl].alertSent = true;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
}

async function enrichWithDetailFingerprints(items) {
  const counts = new Map();
  const candidates = [];

  for (const item of items) {
    const count = counts.get(item.siteIndex) || 0;
    if (count >= DETAIL_CHECK_LIMIT_PER_SITE) continue;
    counts.set(item.siteIndex, count + 1);
    candidates.push(item);
  }

  await mapWithConcurrency(candidates, DETAIL_FETCH_CONCURRENCY, async (item) => {
    try {
      const detailHtml = await fetchUrl(item.url, {
        attempts: DETAIL_FETCH_RETRIES,
        timeoutMs: DETAIL_REQUEST_TIMEOUT_MS,
        label: `详情页 ${item.url}`,
      });
      item.contentHash = contentFingerprint(detailHtml);
    } catch (error) {
      item.detailError = errorMessage(error);
      console.warn(`   详情页指纹抓取失败：${item.title} - ${item.detailError}`);
    }
  });
}

function buildMessage(items) {
  const groups = {};
  for (const item of items) {
    const siteName = SITES[item.siteIndex]?.name || '未知站点';
    if (!groups[siteName]) groups[siteName] = [];
    groups[siteName].push(item);
  }

  let html = '<h3>南医大网站通知提醒</h3>';
  for (const [siteName, groupItems] of Object.entries(groups)) {
    html += `<h4>${siteName}</h4><ul>`;
    for (const item of groupItems) {
      const tag = item.changeType === 'updated' ? '内容更新' : '新增通知';
      html += `<li><strong>[${tag}]</strong> <a href="${item.url}" target="_blank">${item.title}</a><br><small>${item.date}</small></li>`;
    }
    html += '</ul>';
  }
  return html;
}

function buildErrorMessage(errors) {
  let html =
    '<h3>南医大通知监控持续异常</h3>' +
    '<p>学校网站已连续多轮无法访问，已排除单次网络抖动。程序会继续自动重试。</p><ul>';
  for (const error of errors) {
    html +=
      `<li>${error.site}：连续 ${error.consecutiveFailures} 轮失败` +
      `<br><small>${error.error}</small></li>`;
  }
  html += '</ul>';
  return html;
}

async function pushOrThrow(token, title, content) {
  const result = await sendPushPlus(token, title, content);
  console.log(`   推送结果：${JSON.stringify(result)}`);
  if (result.code !== 200) {
    throw new Error(`PushPlus 返回异常：${result.msg || JSON.stringify(result)}`);
  }
  return result;
}

async function main() {
  const token = process.env.PUSHPLUS_TOKEN;
  if (!token) {
    console.error('错误：未设置 PUSHPLUS_TOKEN 环境变量');
    process.exit(1);
  }

  const stateFile = process.env.STATE_FILE || path.join(__dirname, 'state.json');
  const state = loadState(stateFile);
  console.log(`已加载 ${state.seenSet.size} 条已知通知`);

  const allItems = [];
  const errors = [];
  const baselineSiteIndexes = new Set();
  const now = new Date().toISOString();

  const siteResults = await Promise.all(
    SITES.map(async (site) => {
      console.log(`\n正在检查：${site.name}`);
      console.log(`   URL: ${site.url}`);

      let parsedItems = [];
      try {
        await fetchUrl(site.url, {
          label: site.name,
          validate: (html) => {
            parsedItems = site
              .parse(html)
              .map((item) => ({ ...item, siteIndex: site.siteIndex }));
            if (parsedItems.length === 0) {
              throw new Error('页面返回成功，但未解析到任何通知，可能是拦截页或页面结构变化');
            }
          },
        });
        return { site, items: parsedItems, error: null };
      } catch (error) {
        return { site, items: [], error };
      }
    })
  );

  for (const result of siteResults) {
    const health = updateSiteHealth(state, result.site, result.error, now);
    if (!result.error) {
      console.log(`   ${result.site.name} 解析到 ${result.items.length} 条通知`);
      if (health.recovered) console.log(`   ${result.site.name} 已恢复访问，故障计数已清零`);
      if (health.needsBaseline) baselineSiteIndexes.add(result.site.siteIndex);
      allItems.push(...result.items);
      continue;
    }

    const message = errorMessage(result.error);
    console.error(
      `   ${result.site.name} 抓取失败：${message}（连续 ${health.consecutiveFailures} 轮）`
    );
    errors.push({
      site: result.site.name,
      siteUrl: result.site.url,
      error: message,
      ...health,
    });
  }

  allItems.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.url.localeCompare(a.url);
  });

  await enrichWithDetailFingerprints(allItems);

  const changes = [];
  let baselineItems = 0;

  for (const item of allItems) {
    const key = makeKey(item);
    const previous = state.records[key];
    const alreadySeen = state.seenSet.has(key);

    const record = {
      url: item.url,
      title: item.title,
      date: item.date,
      siteIndex: item.siteIndex,
      contentHash: item.contentHash || previous?.contentHash || null,
      lastSeenAt: now,
    };

    if (!alreadySeen) {
      if (baselineSiteIndexes.has(item.siteIndex)) {
        baselineItems += 1;
      } else {
        changes.push({ ...item, changeType: 'new' });
      }
    } else if (previous) {
      const contentChanged =
        item.contentHash && previous.contentHash && item.contentHash !== previous.contentHash;
      const titleChanged = item.title && previous.title && item.title !== previous.title;
      const dateChanged = item.date && previous.date && item.date !== previous.date;
      if (contentChanged || titleChanged || dateChanged) {
        changes.push({ ...item, changeType: 'updated' });
      }
    }

    state.seenSet.add(key);
    state.records[key] = record;
  }

  if (baselineItems > 0) {
    console.log(`\n首次接入已保存 ${baselineItems} 条现有通知作为基线，不推送历史内容。`);
  }
  console.log(`\n统计：共 ${allItems.length} 条通知，新增/更新 ${changes.length} 条`);

  if (changes.length > 0) {
    const pushItems = changes.slice(0, 10);
    const title = `南医大网站通知 ${changes.length} 条`;
    console.log('\n正在推送新通知/更新通知...');
    await pushOrThrow(token, title, buildMessage(pushItems));

    console.log('\n通知列表：');
    for (const item of changes) {
      const tag = item.changeType === 'updated' ? '更新' : '新增';
      console.log(`   [${tag}] [${item.date}] ${item.title}`);
      console.log(`          ${item.url}`);
    }
  } else {
    console.log('\n没有新通知或内容更新。');
  }

  const alertErrors = errors.filter((error) => error.shouldAlert);
  if (alertErrors.length > 0) {
    console.log('\n网站已达到连续失败阈值，正在推送一次异常提醒...');
    try {
      await pushOrThrow(token, '南医大通知监控持续异常', buildErrorMessage(alertErrors));
      for (const error of alertErrors) markSiteAlerted(state, error.siteUrl);
    } catch (error) {
      console.error(`异常提醒推送失败：${error.message}`);
    }
  } else if (errors.length > 0) {
    console.log(
      `\n本轮故障尚未达到连续 ${FAILURE_ALERT_THRESHOLD} 轮阈值，` +
        '暂不推送异常提醒；下轮会自动重试。'
    );
  }

  saveState(stateFile, state);
  console.log(`\n状态已保存到 ${stateFile}`);

  const persistentErrors = errors.filter((error) => error.persistent);
  if (persistentErrors.length > 0) {
    process.exitCode = 2;
  }

  return {
    total: allItems.length,
    changes: changes.length,
    errors,
    persistentErrors,
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error('脚本异常：', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  SITES,
  fetchUrl,
  parseAdmissionsList,
  parseGraduateSchoolList,
  parseTeachingOperationsList,
  parseFirstClinicalSchoolAnnouncementsList,
  updateSiteHealth,
  markSiteAlerted,
  buildErrorMessage,
};
