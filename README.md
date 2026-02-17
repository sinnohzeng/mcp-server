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

## 在新电脑上使用（客户端配置教程）

在任何一台电脑上，只需 **一步配置** 即可让 Claude Code 连接到本 MCP 文档服务。

### 第 1 步：找到配置文件

Claude Code 的全局配置文件位于：

| 操作系统 | 路径 |
|---------|------|
| macOS | `~/.claude/settings.json` |
| Linux | `~/.claude/settings.json` |
| Windows | `%USERPROFILE%\.claude\settings.json` |

如果文件或目录不存在，手动创建即可。

### 第 2 步：编辑配置

**情况 A：文件不存在或为空**

直接写入以下内容：

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

**情况 B：文件已有其他配置**

在现有的 `mcpServers` 对象中追加 `api-docs` 条目。如果之前没有 `mcpServers` 字段，新增即可：

```json
{
  "permissions": {},
  "mcpServers": {
    "existing-server": {},
    "api-docs": {
      "type": "streamable-http",
      "url": "https://mcp.zixuan.net/mcp"
    }
  }
}
```

### 第 3 步：重启 Claude Code

配置修改后，需要 **完全退出并重新打开** Claude Code 会话才能加载新的 MCP 连接。

- **VSCode 插件**：关闭当前 Claude Code 面板，重新打开
- **CLI 终端**：退出当前会话（Ctrl+C），重新运行 `claude`

### 第 4 步：验证连接

在 Claude Code 中输入 `/mcp` 查看 MCP 状态，应能看到：

- 服务名：`api-docs`
- 状态：connected
- 工具：`list_docs`、`read_doc`、`search_docs`

也可以直接让 Claude 调用工具来验证：

> 请用 list_docs 工具列出所有可用的文档

### 快速配置命令（一键复制）

如果你习惯命令行，在新电脑上执行一行命令即可：

**macOS / Linux：**

```bash
mkdir -p ~/.claude && echo '{"mcpServers":{"api-docs":{"type":"streamable-http","url":"https://mcp.zixuan.net/mcp"}}}' > ~/.claude/settings.json
```

> 注意：如果 `~/.claude/settings.json` 已有内容，此命令会覆盖。已有配置请手动编辑合并。

**Windows (PowerShell)：**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude" | Out-Null; '{"mcpServers":{"api-docs":{"type":"streamable-http","url":"https://mcp.zixuan.net/mcp"}}}' | Set-Content "$env:USERPROFILE\.claude\settings.json"
```

### 连接前提

- 电脑需要能访问公网（HTTPS 443 端口出站）
- MCP 服务端地址：`https://mcp.zixuan.net/mcp`
- 健康检查地址：`https://mcp.zixuan.net/health`（浏览器可直接打开验证）

### 常见问题

| 问题 | 解决方案 |
|------|---------|
| MCP 状态显示 disconnected | 浏览器打开 `https://mcp.zixuan.net/health` 检查服务是否正常 |
| 工具调用超时 | 确认当前网络未拦截 443 端口出站请求 |
| 提示 unknown server | 确认 JSON 格式正确，`mcpServers` 拼写无误 |
| 配置后没有变化 | 必须完全重启 Claude Code 会话，仅新建对话不够 |
| Windows 路径找不到 | 确认路径为 `%USERPROFILE%\.claude\`，不是 `%APPDATA%` |

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
