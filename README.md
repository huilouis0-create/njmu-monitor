# 南京医科大学研究生网站通知监控 + 微信推送

自动监控南医大两个网站的新通知，并通过微信实时推送。

## 监控目标

| 网站 | 链接 |
|------|------|
| 🎓 研究生招生网 - 招生动态 | https://yjszs.njmu.edu.cn/10166/list.htm |
| 📋 研究生院 - 通知公告 | https://yjsy.njmu.edu.cn/tzgg_19149/list.htm |

## 工作原理

1. 每 30 分钟抓取一次两个网站的通知列表
2. 与上次已见过的通知对比，发现新通知
3. 通过 **PushPlus** 推送到你的微信
4. 保存已通知记录，避免重复推送

## 快速开始

### 第一步：注册 PushPlus 获取 Token

1. 打开 [PushPlus 官网](https://www.pushplus.plus/)
2. 微信扫码登录
3. 在"一对一推送"页面，复制你的 **Token**（一串32位字符）

### 第二步：将代码上传到 GitHub

1. 在 GitHub 上[创建一个新仓库](https://github.com/new)
2. 在本地终端执行：

```bash
cd 本项目目录
git init
git add .
git commit -m "初始化：南医大通知监控"
git remote add origin https://github.com/你的用户名/你的仓库名.git
git branch -M main
git push -u origin main
```

### 第三步：配置 GitHub Secrets

1. 打开你刚创建的 GitHub 仓库
2. 进入 **Settings → Secrets and variables → Actions**
3. 点击 **New repository secret**
4. **Name** 填：`PUSHPLUS_TOKEN`
5. **Secret** 填：你从 PushPlus 复制的 Token
6. 点击 **Add secret**

### 第四步：启用 Actions

1. 进入仓库的 **Actions** 选项卡
2. 左侧找到 **"南医大通知监控"**
3. 点击 **Enable workflow**
4. 点击右侧 **Run workflow** → **Run workflow** 手动测试一次

### 第五步：验证推送

- 在工作流运行成功后（约1分钟），你的微信会收到一条测试推送消息
- 如果收到消息，说明配置成功！以后有新通知会自动推送到微信

## 定时频率

当前设置为 **每 30 分钟检查一次**（在 `.github/workflows/monitor.yml` 中配置）。

如需修改，编辑文件中的 cron 表达式：

```yaml
- cron: '*/30 * * * *'   # 每30分钟
- cron: '0 * * * *'       # 每小时整点
- cron: '*/10 * * * *'    # 每10分钟
```

## 本地测试（可选）

如果你想在提交前本地测试：

```bash
# Windows:
set PUSHPLUS_TOKEN=你的Token
node monitor.js

# PowerShell:
$env:PUSHPLUS_TOKEN="你的Token"
node monitor.js
```

## 项目文件说明

| 文件 | 说明 |
|------|------|
| `monitor.js` | 核心监控脚本，抓取网站 + 对比新通知 + 推送微信 |
| `pushplus.js` | PushPlus 微信推送工具模块 |
| `state.json` | 自动生成，记录已通知过的通知 URL（避免重复推送） |
| `.github/workflows/monitor.yml` | GitHub Actions 定时工作流配置 |

## 通知样式预览

收到微信消息后，会显示：

```
📢 南医大新通知 (3条)

【研究生招生网】
  • 南京医科大学2026年...
    日期: 2026-06-26
    链接: https://yjszs.njmu.edu.cn/...

【研究生院】
  • 关于做好2026级...
    日期: 2026-06-10
    链接: https://yjsy.njmu.edu.cn/...
```
