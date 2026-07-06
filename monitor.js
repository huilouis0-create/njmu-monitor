/**
 * 南京医科大学研究生网站通知监控脚本
 *
 * 监控两个网站：
 *   1. 研究生招生网 - 招生动态: https://yjszs.njmu.edu.cn/10166/list.htm
 *   2. 研究生院 - 通知公告: https://yjsy.njmu.edu.cn/tzgg_19149/list.htm
 *
 * 修复要点：
 *   - 抓取失败不再当作“没有新通知”，会推送故障提醒并让 Actions 失败。
 *   - 新通知只有在 PushPlus 推送成功后才写入 state，避免漏推。
 *   - 对列表中的近期通知抓取详情页内容指纹，同一个 URL 内容更新也会提醒。
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sendPushPlus } = require('./pushplus');

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 45000);
const FETCH_RETRIES = Number(process.env.FETCH_RETRIES || 3);
const DETAIL_CHECK_LIMIT_PER_SITE = Number(process.env.DETAIL_CHECK_LIMIT_PER_SITE || 8);

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

function parseAdmissionsList(html) {
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
      url: absoluteUrl('https://yjszs.njmu.edu.cn/10166/list.htm', linkMatch[1]),
      title,
      date: dateMatch[1],
      siteIndex: 0,
    });
  }
  return dedupeItems(items);
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

function fetchUrl(url, attempt = 1) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      family: 4,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 AppleWebKit monitor',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(data);
      });
    });

    req.on('error', (error) => reject(error));
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.end();
  }).catch(async (error) => {
    if (attempt >= FETCH_RETRIES) throw error;
    const delay = 3000 * attempt;
    console.warn(`   第 ${attempt} 次抓取失败：${error.message}，${delay / 1000}s 后重试`);
    await sleep(delay);
    return fetchUrl(url, attempt + 1);
  });
}

function makeKey(item) {
  return item.url;
}

function loadState(filePath) {
  const state = { seenSet: new Set(), records: {} };
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

  const data = JSON.stringify(
    {
      seen: [...state.seenSet].sort(),
      items,
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
  fs.writeFileSync(filePath, data, 'utf8');
}

async function enrichWithDetailFingerprints(items) {
  const counts = new Map();
  for (const item of items) {
    const count = counts.get(item.siteIndex) || 0;
    if (count >= DETAIL_CHECK_LIMIT_PER_SITE) continue;
    counts.set(item.siteIndex, count + 1);

    try {
      const detailHtml = await fetchUrl(item.url);
      item.contentHash = contentFingerprint(detailHtml);
    } catch (error) {
      item.detailError = error.message || String(error);
      console.warn(`   详情页指纹抓取失败：${item.title} - ${item.detailError}`);
    }
  }
}

function buildMessage(items) {
  const groups = {};
  for (const item of items) {
    const siteName = SITES[item.siteIndex]?.name || '未知站点';
    if (!groups[siteName]) groups[siteName] = [];
    groups[siteName].push(item);
  }

  let html = '<h3>南医大研究生通知提醒</h3>';
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
  let html = '<h3>南医大通知监控异常</h3><p>本次检查未能完整访问学校网站，请稍后重试或查看 Actions 日志。</p><ul>';
  for (const error of errors) {
    html += `<li>${error.site}: ${error.error}</li>`;
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

  for (const site of SITES) {
    console.log(`\n正在检查：${site.name}`);
    console.log(`   URL: ${site.url}`);
    try {
      const html = await fetchUrl(site.url);
      const items = site.parse(html).map((item) => ({ ...item, siteIndex: site.siteIndex }));
      console.log(`   解析到 ${items.length} 条通知`);
      allItems.push(...items);
    } catch (error) {
      const message = error.message || error.code || String(error);
      console.error(`   抓取失败：${message}`);
      errors.push({ site: site.name, error: message });
    }
  }

  allItems.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.url.localeCompare(a.url);
  });

  await enrichWithDetailFingerprints(allItems);

  const changes = [];
  const now = new Date().toISOString();

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
      changes.push({ ...item, changeType: 'new' });
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

  console.log(`\n统计：共 ${allItems.length} 条通知，新增/更新 ${changes.length} 条`);

  if (changes.length > 0) {
    const pushItems = changes.slice(0, 10);
    const title = `南医大研究生通知 ${changes.length} 条`;
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

  saveState(stateFile, state);
  console.log(`\n状态已保存到 ${stateFile}`);

  if (errors.length > 0) {
    console.log('\n部分网站检查失败，正在推送异常提醒...');
    try {
      await pushOrThrow(token, '南医大通知监控异常', buildErrorMessage(errors));
    } catch (error) {
      console.error(`异常提醒推送失败：${error.message}`);
    }

    process.exitCode = 2;
  }

  return { total: allItems.length, changes: changes.length, errors };
}

if (require.main === module) {
  main().catch((error) => {
    console.error('脚本异常：', error);
    process.exit(1);
  });
}

module.exports = { main, SITES };
