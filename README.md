# ことば · 多语言学习

面向零基础学习者的语言学习监督工具，目前支持日语、英语和西班牙语。学习状态通过 Node API 保存到云端 MySQL，数据库凭据不会发送到浏览器。

每种语言拥有独立的每日任务、课程进度、测验统计和 SRS 复习记录；切换语言不会覆盖其他语言的学习档案。旧版日语数据会在登录后自动迁移到日语档案。

## 架构

```text
React / Vite
    ↓  HTTPS / JSON API
Node.js / Express
    ↓  TLS
Cloud MySQL
```

数据库包含：

- `users`：账户与密码哈希
- `sessions`：服务端登录会话
- `learning_states`：每个用户的多语言学习档案

登录页支持邮箱登录和新用户注册。注册密码使用 `scrypt` 和独立随机盐保存，服务端不会保存明文密码。

普通 HTTP 部署使用 `HttpOnly` 会话 Cookie。直接打开静态 `index.html` 时，为兼容 `file://`，会改用本机 API 和 Bearer 会话。

## 首次配置

1. 复制 `.env.example` 为 `.env`。
2. 在 `.env` 中填写云端 MySQL 地址、端口、数据库名和数据库用户。
3. 设置首次登录使用的 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 和显示名。
4. 安装依赖并初始化数据库：

```bash
npm install
npm run db:init
```

`db:init` 会创建所需数据表。如果邮箱已经存在，它会更新该账户的显示名和密码。

如果云服务商提供了 MySQL CA 证书，请把路径填入 `DB_SSL_CA_PATH`。不使用 TLS 的内网数据库才应设置 `DB_SSL=false`。

自建 MySQL 使用自签名证书时，推荐从服务器复制签发证书的 CA 文件，并保持：

```dotenv
DB_SSL=true
DB_SSL_CA_PATH=D:/certs/mysql-ca.pem
DB_SSL_REJECT_UNAUTHORIZED=true
```

如果暂时无法取得 CA，并且确认连接的是自己控制的服务器，可以使用仅加密、不验证服务器身份的模式：

```dotenv
DB_SSL=true
DB_SSL_CA_PATH=
DB_SSL_REJECT_UNAUTHORIZED=false
```

第二种方式仍会加密流量，但不能防止中间人冒充数据库服务器，不建议作为长期生产配置。

不要把 `.env` 提交到 Git，也不要把数据库密码写进前端代码。云端防火墙应只允许运行 API 的服务器 IP 访问 MySQL 端口。

用户第一次登录时，如果浏览器里存在旧版 `localStorage` 学习记录，系统会在首次保存成功后将其迁移到 MySQL 并移除本地副本。

## 开发运行

双击 `start-site.cmd`，或运行：

```bash
npm run dev
```

这会同时启动：

- Web：http://127.0.0.1:5173
- API：http://127.0.0.1:3001

Vite 会将 `/api` 请求代理到本地 API。

默认开放注册。需要暂停新用户注册时，在 `.env` 中设置：

```dotenv
ALLOW_REGISTRATION=false
```

登录与注册接口会按客户端 IP 限制尝试频率。生产环境只有在 Express 直接位于可信反向代理之后时，才设置 `TRUST_PROXY=true`。

## 生产运行

```bash
npm run build
set NODE_ENV=production
npm start
```

生产模式由 Express 同时提供 `dist` 静态页面和 `/api`，默认地址为 `http://127.0.0.1:3001`。对公网部署时应通过 Nginx 或 Caddy 配置 HTTPS 反向代理，并将 `API_HOST` 设置为 `0.0.0.0`。

## 验证

```bash
npm run lint
npm run build
npm run test:cloud
```

`test:cloud` 会使用临时账户验证真实注册流程，并在完成后立即删除该测试账户。
