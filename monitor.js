/**
 * 南京医科大学研究生网站通知监控脚本
 *
 * 监控两个网站：
 *   1. 研究生招生网 - 招生动态: https://yjszs.njmu.edu.cn/10166/list.htm
 *   2. 研究生院 - 通知公告: https://yjsy.njmu.edu.cn/tzgg_19149/list.htm
 *
 * 工作方式：
 *   1. 读取本地 state.json 中已见过的通知（按 URL 唯一标识）
 *   2. 抓取两个网站的最新通知列表
 *   3. 对比发现新通知 → 通过 PushPlus 推送到微信
 *   4. 更新 state.json
 *
 * 环境变量：
 *   PUSHPLUS_TOKEN  - PushPlus 用户令牌（必填）
 *   STATE_FILE      - 状态文件路径（默认 ./state.json）
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { sendPushPlus } = require('./pushplus');

// ===== 配置 =====

const SITES = [
  {
    name: '🎓 研究生招生网 - 招生动态',
    url: 'https://yjszs.njmu.edu.cn/10166/list.htm',
    // 解析函数：从 HTML 中提取通知列表
    parse: (html) => {
      const items = [];
      // 匹配 <li class="news nX clearfix"> ... </li>
      const liRegex = /<li\s+class="news\s+n\d+\s+clearfix">([\s\S]*?)<\/li>/g;
      let match;
      while ((match = liRegex.exec(html)) !== null) {
        const block = match[1];
        const titleMatch = block.match(/<a[^>]*href='([^']+)'[^>]*title='([^']*)'/);
        const dateMatch = block.match(/<span\s+class="news_meta">(\d{4}-\d{2}-\d{2})<\/span>/);
        if (titleMatch && dateMatch) {
          const href = titleMatch[1];
          const fullUrl = href.startsWith('http') ? href : `https://yjszs.njmu.edu.cn${href}`;
          items.push({
            url: fullUrl,
            title: titleMatch[2],
            date: dateMatch[1],
            siteIndex: 0,
          });
        }
      }
      return items;
    },
  },
  {
    name: '📋 研究生院 - 通知公告',
    url: 'https://yjsy.njmu.edu.cn/tzgg_19149/list.htm',
    parse: (html) => {
      const items = [];
      // 匹配 <div class="jzlb clearfix"> ... </div></div>
      // 注意：该站点的 <div class="fbsj4"> 没有闭合 </div>，所以不能用简单的非贪婪匹配
      const jzlbRegex = /<div\s+class="jzlb\s+clearfix">([\s\S]*?)<\/div>\s*<\/div>/g;
      let match;
      while ((match = jzlbRegex.exec(html)) !== null) {
        const block = match[0]; // 用整个匹配块而不是捕获组
        const linkMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        const dateMatch = block.match(/<div\s+class="fbsj4">(\d{4}-\d{2}-\d{2})/);
        if (linkMatch && dateMatch) {
          const href = linkMatch[1];
          const fullUrl = href.startsWith('http') ? href : `https://yjsy.njmu.edu.cn${href}`;
          const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
          items.push({
            url: fullUrl,
            title,
            date: dateMatch[1],
            siteIndex: 1,
          });
        }
      }
      return items;
    },
  },
];

// ===== 辅助函数 =====

/** 抓取 URL 返回 HTML */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = url.startsWith('https') ? https : http;
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    };
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/** 生成通知的唯一键（用 URL 作为唯一标识） */
function makeKey(item) {
  return item.url;
}

/** 加载已见过的通知集合 */
function loadState(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      // 支持 JSON 和 JSON 每行一个的格式
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          return new Set(data);
        }
        if (data && data.seen) {
          return new Set(data.seen);
        }
      } catch {
        // 按行解析
        const lines = raw.trim().split('\n').filter(Boolean);
        return new Set(lines);
      }
    }
  } catch (e) {
    console.error('读取状态文件失败:', e.message);
  }
  return new Set();
}

/** 保存已见过的通知集合 */
function saveState(filePath, seenSet) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const data = JSON.stringify({ seen: [...seenSet], updatedAt: new Date().toISOString() }, null, 2);
  fs.writeFileSync(filePath, data, 'utf-8');
}

/** 构建推送消息的 HTML 内容 */
function buildMessage(newItems) {
  const siteNames = ['研究生招生网', '研究生院'];
  const groups = {};
  for (const item of newItems) {
    const sn = siteNames[item.siteIndex] || '未知';
    if (!groups[sn]) groups[sn] = [];
    groups[sn].push(item);
  }

  let html = '<h3>📢 新通知提醒</h3>';
  for (const [siteName, items] of Object.entries(groups)) {
    html += `<h4>${siteName}</h4><ul>`;
    for (const item of items) {
      html += `<li><a href="${item.url}" target="_blank">${item.title}</a><br><small>${item.date}</small></li>`;
    }
    html += '</ul>';
  }
  return html;
}

/** 构建纯文本消息（备用） */
function buildText(newItems) {
  const siteNames = ['研究生招生网', '研究生院'];
  let text = '📢 南医大新通知提醒\n' + '='.repeat(20) + '\n\n';
  const groups = {};
  for (const item of newItems) {
    const sn = siteNames[item.siteIndex] || '未知';
    if (!groups[sn]) groups[sn] = [];
    groups[sn].push(item);
  }
  for (const [siteName, items] of Object.entries(groups)) {
    text += `【${siteName}】\n`;
    for (const item of items) {
      text += `  • ${item.title}\n    日期: ${item.date}\n    链接: ${item.url}\n\n`;
    }
  }
  return text;
}

// ===== 主函数 =====

async function main() {
  const token = process.env.PUSHPLUS_TOKEN;
  if (!token) {
    console.error('❌ 错误：未设置 PUSHPLUS_TOKEN 环境变量');
    process.exit(1);
  }

  const stateFile = process.env.STATE_FILE || path.join(__dirname, 'state.json');
  const seenSet = loadState(stateFile);
  console.log(`已加载 ${seenSet.size} 条已知通知`);

  const allItems = [];
  const errors = [];

  for (const site of SITES) {
    console.log(`\n📡 正在检查: ${site.name}`);
    console.log(`   URL: ${site.url}`);
    try {
      const html = await fetchUrl(site.url);
      const items = site.parse(html);
      console.log(`   解析到 ${items.length} 条通知`);
      allItems.push(...items);
    } catch (e) {
   const errMsg = e.message || e.code || JSON.stringify(e);
   console.error(`   ❌ 抓取失败: ${errMsg}`);
   console.error(`      完整错误:`, e);
   errors.push({ site: site.name, error: errMsg });
    }
  }

  // 按日期排序（最新的在前）
  allItems.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.url.localeCompare(a.url);
  });

  // 找出新通知
  const newItems = [];
  for (const item of allItems) {
    const key = makeKey(item);
    if (!seenSet.has(key)) {
      newItems.push(item);
      seenSet.add(key);
    }
  }

  console.log(`\n📊 统计：共 ${allItems.length} 条通知，新增 ${newItems.length} 条`);

  // 发送推送
  if (newItems.length > 0) {
    // 最多推送最近 10 条，避免消息过长
    const pushItems = newItems.slice(0, 10);
    if (newItems.length > 10) {
      console.log(`   还有 ${newItems.length - 10} 条新通知未在本次推送中显示`);
    }

    const title = `📢 南医大新通知 (${newItems.length}条)`;
    const htmlContent = buildMessage(pushItems);
    const textContent = buildText(pushItems);

    console.log(`\n📤 正在推送通知到微信...`);
    try {
      const result = await sendPushPlus(token, title, htmlContent);
      console.log(`   推送结果: ${JSON.stringify(result)}`);
      if (result.code === 200) {
        console.log('   ✅ 推送成功！');
      } else {
        console.error(`   ⚠️ 推送返回异常: ${result.msg}`);
      }
    } catch (e) {
      console.error(`   ❌ 推送失败: ${e.message}`);
    }

    // 打印新通知到控制台
    console.log('\n📋 新通知列表:');
    for (const item of newItems) {
      console.log(`   [${item.date}] ${item.title}`);
      console.log(`           ${item.url}`);
    }
  } else {
    console.log('\n✅ 没有新通知。一切正常。');
  }

  // 保存状态
  saveState(stateFile, seenSet);
  console.log(`\n💾 状态已保存到 ${stateFile}`);

  // 如果有错误，汇总报告
  if (errors.length > 0) {
    console.log('\n⚠️ 部分网站检查失败:');
    for (const e of errors) {
      console.log(`   - ${e.site}: ${e.error}`);
    }
  }

  return { total: allItems.length, new: newItems.length, errors };
}

// 执行
if (require.main === module) {
  main().catch((e) => {
    console.error('❌ 脚本异常:', e);
    process.exit(1);
  });
}

module.exports = { main, SITES };
