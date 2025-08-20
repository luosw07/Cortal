# Cortal – 课程门户

Cortal 是一个轻量级的课程管理系统，适用于大学课程主页。它提供现代、简洁的苹果风界面，方便学生和助教（TA）查看课程信息、发布讨论、提交作业并进行批改。本项目后端采用 **Node.js/Express**，前端使用原生 JS/HTML/CSS。

## 功能概览

### 学生端

* **课程主页** – 浏览课程介绍和公告，支持 Markdown 与 LaTeX 渲染。
* **作业管理** – 下载作业 PDF，上传 PDF 作业（未批改前可替换），查看已批改的成绩、评语和反馈文件。主页会显示个人综合成绩仪表。
* **考试通知** – 查看考试时间和说明，同样支持 Markdown/LaTeX。
* **课程资料** – 下载教学资源，可按标签筛选。
* **讨论区** – 发表主题、评论并回复他人。回复会通过邮件与站内通知提醒原作者。
* **通知中心** – 右上角铃铛显示未读数，点击查看所有通知；点击某条涉及作业的通知可跳转到对应作业详情。
* **忘记密码** – 提交邮箱即可获得带令牌的重设链接，无需管理员审批。

### 管理员/助教端

* **用户管理** – 查看所有用户（学生/助教），审核注册、静音/解除静音学生。
* **课程内容维护** – 发布和编辑公告、作业、资料及考试通知，上传 PDF 等文件。
* **作业批改** – 独立批改页面列出未批改与已批改的提交，按时间排序。可在线批注 PDF、填写分数与评语，并生成反馈。批改后系统发送邮件及站内通知，带跳转链接。
* **讨论区管理** – 删除或归档主题和评论；可静音违规学生。
* **导出成绩** – 一键导出 CSV 成绩单。

## 安装与部署

### 环境要求

* Node.js（建议 18 及以上）
* npm
* （可选）SMTP 邮箱用于发送邮件通知，未配置则邮件内容将输出到控制台。

### 本地开发

1. 安装依赖：

   ```bash
   npm install
   ```

2. 复制 `.env.example` 为 `.env`，并配置以下环境变量：

   ```ini
   PORT=3000
   JWT_SECRET=自定义密钥
   # SMTP 配置（可选，但推荐）
   SMTP_HOST=smtp.example.com
   SMTP_PORT=465
   SMTP_USER=your@example.com
   SMTP_PASS=邮箱授权码
   SMTP_FROM=Cortal <your@example.com>
   PUBLIC_BASE_URL=http://localhost:3000
   ```

3. 启动开发服务器：

   ```bash
   npm run dev
   ```

4. 在浏览器访问 `http://localhost:3000`，通过注册表单创建学生或助教账户（助教需提供邀请码，可在后台查看邀请码）。

### 生产部署

1. 推荐使用 **PM2** 守护进程：

   ```bash
   sudo npm install -g pm2
   pm2 start server/index.js --name cortal
   pm2 save
   pm2 startup
   ```

2. 配置 **Nginx 反向代理**（示例）：

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

3. 使用 Let’s Encrypt 或其他方式配置 HTTPS。

### 数据持久化

所有数据（用户、作业、提交、资源、考试、通知等）存储于 `server/data.json`。服务器启动时读取该文件，数据变化时保存至该文件。部署时注意备份该文件，以防丢失历史数据。

### 安全提示

* 密码使用 bcrypt 哈希存储，请设置强壮的 `JWT_SECRET`。
* 助教身份拥有课程完全控制权，请妥善保管邀请码。
* SMTP 凭证和 `.env` 文件应保密，不要上传到公开仓库。

## 使用说明

* 学生注册后需等待管理员审批才能提交作业或发帖。
* 管理员可以在用户列表直接静音/解除静音学生；静音学生无法提交或发帖。
* 作业批改界面支持手绘批注，可在页面左上预览并下载学生原文件。
* 当作业被批改时，学生会收到邮件及站内通知。点击通知可打开对应作业详情查看成绩。

## 许可

项目用于教学示范，可自由修改与二次开发。