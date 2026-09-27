# 免费部署：Cloudflare Workers + D1

这里是独立的 Cloudflare 后端。前端继续使用 GitHub Pages，接口仍是 `POST /api/submissions`。
本目录不会启动或重新部署 Render，也不依赖根目录的 Node/Postgres 后端。

## 1. 登录 Cloudflare

先注册 https://dash.cloudflare.com/ 的免费账号，然后在项目目录的终端运行：

```bash
cd cloudflare
npm ci
npx wrangler login
```

浏览器会打开授权页，登录你自己的账号并授权 Wrangler。不要把密码或 API token 发到聊天中。

## 2. 创建数据库并填写 ID

```bash
npm run db:create
```

命令会创建名为 `pairwise-study` 的 D1 数据库，并显示 `database_id`。
如果工具询问是否自动修改配置，选择 **No**，因为配置中的 `DB` 绑定已经准备好。
打开本目录的 `wrangler.jsonc`，只把 `database_id` 的全零占位值替换成刚得到的真实 ID。
保留 `binding` 为 `DB`，保留 `database_name` 为 `pairwise-study`。
如果数据库已经存在，不要重复创建，运行 `npx wrangler d1 list` 找到原来的 ID。

## 3. 创建线上表并发布后端

```bash
npm run db:migrate
npm run deploy
```

迁移会创建表和视图，不会清空已有数据。两个命令都必须在 `cloudflare/` 目录中运行。
部署结束会显示 `https://pairwise-study-api.你的账号子域.workers.dev`，使用输出中的实际地址。

打开这个地址后加 `/api/health`，应该看到 `{"ok":true}`。这个检查也会验证 D1 表已创建。
直接访问地址根路径返回 Not found 是正常的，这里仅托管 API。

## 4. 切换问卷前端

打开 GitHub 仓库 → Settings → Secrets and variables → Actions → **Variables**。
把 `VITE_API_BASE_URL` 更新成刚得到的 Workers HTTPS 地址，不带 `/api` 或其他路径。

在仓库 Actions 页面找到 **Deploy survey to GitHub Pages**，点击 **Run workflow**，分支选 `main`。
使用一次新的运行，而不是只重跑之前的 deploy 步骤，以确保前端重新构建时使用新地址。
部署完成后刷新网页。尚未提交成功的答案可以直接重试，无需重新填写。

允许的前端来源在 `wrangler.jsonc` 的 `vars.ALLOWED_ORIGINS` 中，已填好 `https://huqyang.github.io`。
改域名或 studyConfig 后，需要同时更新配置并重新部署 Worker 和前端。

## 5. 查看和备份结果

Cloudflare 控制台 → **D1 SQL Database** → `pairwise-study`。
在 Console 中执行：

```sql
SELECT id, study_id, study_version, received_at FROM submissions ORDER BY received_at DESC;
SELECT * FROM responses ORDER BY submission_id, answer_order;
```

`submissions` 中每份问卷保存为一条记录（包含完整答案 JSON）；`responses` 是按答案展开的只读视图。
相同提交 ID 的相同答案重复提交只会返回原回执，不会重复入库；不同答案复用 ID 会被拒绝。
公开 API 不提供读取/下载其他参与者答案的功能，研究者通过 Cloudflare 账号访问数据。

下载 SQL 备份到当前电脑：

```bash
npm run db:export
```

生成的 `study-backup.sql` 包含研究数据，已在本目录 gitignore 中排除。
备份应定期执行；免费额度和限制请以 Cloudflare 当前文档为准。

## 已经在 Render 提交的答案

修改 API 地址不会自动搬运旧数据。旧的成功回执仍指向 Render 上的那次提交。
迁移前请备份 Render 数据；浏览器中保留的原始答案也不要清除。
如果这些旧答案也需要导入 D1，请先准备导出的数据文件，再按原提交 ID 导入，避免重复计算参与者。
在旧数据备份和新接口验证完成前，不要删除或重新部署使用临时 SQLite 的 Render 实例。

## 本地验证

```bash
npm test
```

测试使用真正的本地 Workers/D1 模拟器，覆盖来源校验、完整问卷入库、并发重试去重、冲突拒绝、无效数据拒绝、查询视图和重启后数据保留；不会连接线上 D1。

开发服务器：先 `npx wrangler d1 migrations apply DB --local`，再 `npm run dev`。
本地前端开发时，把 `http://localhost:5173` 加到 `ALLOWED_ORIGINS`，并把本地 `.env` 的 `VITE_API_BASE_URL` 指向 Wrangler 输出的本地 URL。

验证规则的可移植版本位于 `validation.js`，与 `server/store.js` 保持相同的请求约定；它读取同一份 `src/studyConfig.js`。

官方参考：https://developers.cloudflare.com/d1/get-started/
