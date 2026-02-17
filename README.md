# MCP Documentation Server

个人 API 参考文档的 MCP（Model Context Protocol）服务。通过 Streamable HTTP 协议向 Claude Code 等 AI 工具暴露文档查询能力，在任意项目中均可直接调用。

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/index.ts` | MCP 服务主程序（Express + Streamable HTTP） |
| `deploy.sh` | 自动部署脚本（systemd timer 调用） |
| `docs/` | Markdown 文档目录（按 provider 分类） |
| `package.json` | Node.js 依赖 |
| `tsconfig.json` | TypeScript 配置 |

## 架构

```
Claude Code (任意项目)
    │
    └──→ https://mcp.zixuan.net/mcp  (Streamable HTTP)
              │
         Nginx (443/SSL, *.zixuan.net 泛域名证书)
              │
         Node.js (:3927, systemd: mcp-docs.service)
              │
         /home/ecs-user/mcp-docs-server/docs/
         ├── feishu/   飞书开放平台 API
         └── gemini/   Google Gemini API
```

### MCP 暴露的工具

| 工具 | 描述 | 参数 |
|------|------|------|
| `list_docs` | 列出所有可用文档的路径 | `provider?` — 按提供商过滤 |
| `read_doc` | 读取指定文档全文 | `path` — 文档相对路径 |
| `search_docs` | 全文搜索所有文档 | `query`, `provider?`, `maxResults?` |

### 请求流程

```
POST /mcp (Initialize) → 获取 session ID
POST /mcp (tools/list) → 返回可用工具列表
POST /mcp (tools/call)  → 调用 list_docs / read_doc / search_docs
GET  /mcp               → SSE 通道（server → client 通知）
DELETE /mcp             → 终止会话
GET  /health            → 健康检查（不走 MCP 协议）
```

## 客户端配置

在 `~/.claude/settings.json` 中添加全局 MCP 连接（对所有项目生效）：

```json
{
  "mcpServers": {
    "api-docs": {
      "type": "streamable-http",
      "url": "https://mcp.zixuan.net/mcp"
    }
  }
}
```

配置后需重启 Claude Code 会话才能生效。

## 文档维护

### 添加 / 更新文档

在任意设备上 clone 本仓库，向 `docs/` 目录添加 Markdown 文件，push 即可：

```bash
git clone https://github.com/sinnohzeng/mcp-server.git
cd mcp-server

# 添加新的 API 提供商
mkdir -p docs/openai
cp some-doc.md docs/openai/

# 更新现有文档
vim docs/feishu/消息/发送消息.md

git add docs/
git commit -m "add: OpenAI API docs"
git push
```

**文档更新无需重启服务**——MCP 服务每次调用时实时读取文件系统。

### 自动部署机制

服务器运行着 systemd timer（`mcp-deploy.timer`），每 **5 分钟**自动检查 GitHub：

```
git push  →  (≤5 min)  →  服务器 git pull
                              │
                              ├─ 只改了 docs/  → 立即生效，无需重启
                              └─ 改了 src/ 或 package.json → 自动 rebuild + restart
```

### 手动触发部署

```bash
ssh 172.20.82.160 "/home/ecs-user/mcp-docs-server/deploy.sh"
```

### 查看部署日志

```bash
ssh 172.20.82.160 "journalctl -u mcp-deploy --no-pager -n 20"
```

## 服务器运维

### 服务管理

```bash
# 查看状态
ssh 172.20.82.160 "sudo systemctl status mcp-docs"

# 重启服务
ssh 172.20.82.160 "sudo systemctl restart mcp-docs"

# 查看服务日志
ssh 172.20.82.160 "journalctl -u mcp-docs -f"

# 查看自动部署定时器
ssh 172.20.82.160 "sudo systemctl list-timers mcp-deploy.timer"
```

### 关键路径

| 路径 | 说明 |
|------|------|
| `/home/ecs-user/mcp-docs-server/` | 项目根目录 |
| `/etc/systemd/system/mcp-docs.service` | 主服务 systemd 单元 |
| `/etc/systemd/system/mcp-deploy.timer` | 自动部署定时器 |
| `/etc/systemd/system/mcp-deploy.service` | 自动部署服务单元 |
| `/etc/nginx/conf.d/mcp.conf` | Nginx 反向代理配置 |
| `/etc/nginx/ssl/fullchain.cer` | SSL 证书（*.zixuan.net） |
| `/etc/nginx/ssl/privkey.key` | SSL 私钥 |
| `/etc/sudoers.d/mcp-deploy` | 免密重启授权 |

### SSL 证书续期

证书来自当前服务器（172.20.82.136）的 acme.sh，有效期至 2026-05-16。续期后需同步到 MCP 服务器：

```bash
# 从主服务器复制新证书
scp ~/.acme.sh/'*.zixuan.net_ecc'/fullchain.cer 172.20.82.160:/tmp/
scp ~/.acme.sh/'*.zixuan.net_ecc'/'*.zixuan.net.key' 172.20.82.160:/tmp/

# 在 MCP 服务器上替换并重载
ssh 172.20.82.160 "sudo mv /tmp/fullchain.cer /etc/nginx/ssl/ && sudo mv /tmp/*.zixuan.net.key /etc/nginx/ssl/privkey.key && sudo nginx -s reload"
```

### DNS

- 域名：`mcp.zixuan.net`
- 解析：`A` → `8.216.41.254`（Cloudflare DNS-only，不走代理）
- 管理：Cloudflare Dashboard（zixuan.net zone）

## 本地开发

```bash
npm install
npm run dev      # tsx 热重载
npm run build    # TypeScript 编译
npm start        # 生产模式运行
```

环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3927` | 监听端口 |
| `DOCS_DIR` | `./docs` | 文档目录路径 |

## 扩展文档

添加新的 API 提供商只需在 `docs/` 下新建目录：

```
docs/
├── feishu/       # 已有
├── gemini/       # 已有
├── openai/       # 新增示例
├── cloudflare/   # 新增示例
└── ...
```

MCP 工具的 `provider` 参数即为目录名，无需修改代码。
