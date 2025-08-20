# Cortal 课程门户

Cortal 是一个基于 **Node.js**（Express）和轻量化 **JavaScript** 前端构建的课程门户网站。它支持密码注册与登录、学生账号审批、公告发布、作业上传与在线批改、资源管理、考试通知、支持 Markdown/LaTeX 的讨论论坛（含回复功能），并提供个性化成绩仪表盘。界面参考苹果设计语言，采用干净的卡片、圆角按钮和淡雅配色。

## 功能简介

- **公告与课程信息**：教师可以发布公告并编辑课程描述。公告显示在首页，并通过邮件和站内通知提醒所有注册用户。课程信息以卡片形式展示。

- **注册与登录**：用户以姓名、邮箱和密码注册。学生需提供学号和中文姓名；助教需输入邀请码（默认 `TA2025`）。学生注册后进入*待审批*状态，管理员审批后方可发帖和提交作业。系统会向所有管理员发送邮件和站内通知。密码使用 bcrypt 加密存储，登录成功后发放 JWT 令牌。用户可以通过邮件重置密码，无需管理员审批。

- **作业与在线批改**：每个作业包括标题、描述（支持 Markdown/LaTeX）、截止日期和 PDF 文件。作业详情页分为三部分：PDF 浏览（多页查看与缩放）、提交区域（学生上传 PDF 并可预览，评分后显示成绩与评语）、以及仪表盘。教师在 PDF 上直接批注并打分，系统用 `pdf-lib` 合并批注。成绩以彩色仪表条显示，分为七个等级：A+、A、A‑、B、C、D、Failed。

- **作业仪表盘**：作业页面包含统计仪表盘，展示提交人数与总人数、平均分，以及各等级人数分布；学生和助教均可查看。

- **首页仪表盘**：登录后首页显示个人综合成绩仪表，按所有已评分作业的平均分计算，并按 A+≥95、A 90–94、A‑ 85–89、B 80–84、C 70–79、D 60–69、Failed <60 分级，颜色随等级变化。

- **资源与考试**：教师可以上传带标签的学习资源（PDF、Word 等），学生可按标签筛选。考试通知包括标题、时间和描述（支持 Markdown/LaTeX）。

- **讨论论坛（含回复）**：用户可以创建帖子和评论，正文支持 Markdown 和 LaTeX，可附加文件（PDF、图片）。用户可以回复某条评论，回复将标注“↳ 回复 …”，原评论作者会收到邮件和站内通知。助教标有“TA”标签，可归档或删除帖子和评论。

- **通知系统**：所有重要事件（公告、作业提交、评分发布、考试通知、评论回复）都会发送邮件和站内通知。导航栏右上角的铃铛显示未读数量，点击可查看通知列表。

- **管理后台**：后台以多个标签页分区：课程信息、公告、作业、资源、考试、论坛和学生。管理员可以编辑课程信息、发布和删除公告、创建与管理作业/资源/考试、管理讨论（归档/删除）、审批或拒绝学生注册、禁言/解禁学生，并更新邀请码。成绩可导出为 CSV。

## 本地开发

1. **安装依赖**

   ```bash
   cd course-portal
   npm install
   ```

2. **启动开发服务器**

   ```bash
   npm run dev
   ```

   服务器默认运行在 **http://localhost:3000**，支持实时重载。首次访问会提示注册。

3. **数据存储**

   示例项目将数据存储在内存并写入 `server/data.json`，适用于演示。重启服务器后数据仍在，但并发写入不安全。生产环境请使用数据库替代。

## 部署指南

1. **准备环境**：在 CentOS/Ubuntu 服务器上安装 Node.js 和 npm。将 `course-portal` 项目复制到 `/var/www/Cortal` 等目录。

2. **配置环境变量**：在项目根目录创建 `.env`，配置如下：

   ```env
   PORT=3000
   JWT_SECRET=请更换为安全随机值
   PUBLIC_BASE_URL=https://your.domain
   SMTP_HOST=smtp.example.com
   SMTP_PORT=465
   SMTP_USER=你的邮箱
   SMTP_PASS=邮箱SMTP密码
   SMTP_FROM=Cortal <你的邮箱>
   ```

3. **安装依赖**：

   ```bash
   cd /var/www/Cortal
   npm install --production
   ```

4. **使用 PM2 运行**（推荐）：

   ```bash
   sudo npm install -g pm2
   pm2 start server/index.js --name cortal
   pm2 save
   pm2 startup
   ```

   PM2 会在后台守护 Node 进程，并在崩溃后自动重启。

5. **配置 Nginx 反向代理**：安装 Nginx，并添加配置：

   ```nginx
   server {
       listen 80;
       server_name your.domain;
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   重载 Nginx：`sudo systemctl reload nginx`。如需 HTTPS，请申请证书并调整配置。

6. **持久化**：示例通过 `data.json` 持久化，生产环境应接入数据库以保证数据一致性。

7. **邮件发送**：确保 SMTP 凭证正确，并开放服务器的 465 或 587 端口；可通过“忘记密码”功能测试邮件发送是否成功。

## 许可协议

本项目采用 MIT 许可发布。