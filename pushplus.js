/**
 * PushPlus 微信推送工具
 * 文档：https://www.pushplus.plus/doc/
 */

const https = require('https');
const http = require('http');

/**
 * 通过 PushPlus 发送微信通知
 * @param {string} token - PushPlus 用户令牌
 * @param {string} title - 消息标题
 * @param {string} content - 消息内容（支持HTML）
 * @param {string} [topic] - 群组编码（可选）
 * @returns {Promise<object>}
 */
function sendPushPlus(token, title, content, topic) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      token,
      title,
      content,
      topic: topic || '',
      template: 'html',
      channel: 'wechat',
    });

    const options = {
      hostname: 'www.pushplus.plus',
      path: '/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ code: 500, msg: 'parse error', raw: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

module.exports = { sendPushPlus };
