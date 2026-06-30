name: 南医大通知监控

on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: 检出代码
        uses: actions/checkout@v4

      - name: 设置 Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: 测试网络连通性
        run: |
          echo "=== 研究生招生网 ==="
          curl -sI --max-time 10 -A "Mozilla/5.0" "https://yjszs.njmu.edu.cn/10166/list.htm" | head -5
          echo ""
          echo "=== 研究生院 ==="
          curl -sI --max-time 10 -A "Mozilla/5.0" "https://yjsy.njmu.edu.cn/tzgg_19149/list.htm" | head -5
          echo ""
          echo "=== DNS 解析 ==="
          nslookup yjszs.njmu.edu.cn 2>&1 | head -5
          echo "---"
          nslookup yjsy.njmu.edu.cn 2>&1 | head -5

      - name: 查看 state.json
        run: |
          if [ -f state.json ]; then
            echo "✅ state.json 存在"
          else
            echo "📝 不存在"
          fi

      - name: 运行监控脚本
        env:
          PUSHPLUS_TOKEN: ${{ secrets.PUSHPLUS_TOKEN }}
        run: node monitor.js

      - name: 提交 state.json
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add state.json
          git diff --staged --quiet || git commit -m "📝 自动更新 state.json"
          git push
