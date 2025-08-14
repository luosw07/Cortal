# Cortal Course Portal – Foundations of Algebra

## Introduction

This project is a dynamic course portal for the *Foundations of Algebra* course. It provides an Apple‑style user interface and implements essential functionality for managing course information, assignments, discussions and resources. The portal is built using **Node.js** with the Express framework and uses **EJS** for server‑side rendering.

## Features

- **Home page** – shows important announcements and latest forum discussions.
- **Assignment management** – lists assignments with due dates, allows teaching assistants to publish assignments, and lets students upload PDF submissions. Submissions are stored in the `uploads/` folder. (In a production environment this should be replaced by persistent storage.)
- **PDF upload & placeholder annotation support** – assignments accept PDF submissions; integration with `pdf-lib` is included for future annotation and merging work.
- **Resources page** – placeholder for downloadable materials with a clean download button layout.
- **Exams page** – placeholder for exam notifications.
- **Forum** – simple discussion forum where authenticated users can create threads and view posts.
- **Authentication** – very basic email login (auto‑register as student) with session handling. Users can log out. For demonstration purposes the first part of the email before `@` is used as a display name. Roles (`student`/`ta`) are stored in memory.

The user interface is heavily inspired by Apple’s design: clean navigation bar, soft shadows and rounded cards.

## Installation & Development

### Requirements

- Node.js ≥ 16
- npm

### Setup

```bash
# clone the repository and install dependencies
git clone https://github.com/luosw07/Cortal.git
cd Cortal
npm install

# start the development server
npm start

# The application will run on http://localhost:3000
```

For live reload during development you can use:

```bash
npm run dev
```

This uses `nodemon` to restart the server on file changes.

### Directory structure

- `app.js` – main entry point of the Express application.
- `views/` – EJS templates for pages and partials (navigation bar).
- `public/` – static assets such as CSS files.
- `uploads/` – folder where submitted PDFs are stored.
- `package.json` – project metadata and dependencies.

### Deployment

To deploy on a server, ensure that environment variables such as `PORT` are set appropriately. Install dependencies using `npm install`, then run `npm start`. For production deployments you should replace the in‑memory storage with a proper database, secure session keys, and implement robust authentication and authorization.

## 中文说明

### 项目简介

该项目为《代数学基础》课程的动态网站。整个网站采用苹果风格的界面设计，功能包括：课程通知展示、作业发布与提交、PDF 上传与预留批注支持、资料下载、考试通知、论坛讨论，以及简易的用户登陆与登出功能。代码基于 **Node.js** 的 Express 框架，页面使用 **EJS** 模板渲染。

### 功能概览

- **首页** – 显示重要通知和最新讨论。
- **作业管理** – 教学助理可以发布作业，学生可以上传 PDF 作业。在当前示例中，提交的文件保存在 `uploads/` 目录。
- **PDF 上传与批注** – 集成了 `pdf-lib`，为将来的 PDF 合并与批注提供扩展可能。
- **资料下载页** – 以苹果风格的下载按钮展示可下载的资料（当前为空）。
- **考试页** – 考试通知的展示页（当前为空）。
- **讨论区** – 学生用户可以发起讨论并回复。
- **登陆/登出** – 输入邮箱即可登录；未登录状态作为访客浏览。session 存储在内存中。

### 安装与开发

1. 确保已安装 Node.js（版本 ≥ 16）和 npm。
2. 克隆仓库并安装依赖：

   ```bash
   git clone https://github.com/luosw07/Cortal.git
   cd Cortal
   npm install
   ```

3. 运行开发服务器：

   ```bash
   npm start
   ```

   默认在 `http://localhost:3000` 提供服务。如果需要在开发过程中自动重载服务器，可以执行 `npm run dev`。

### 部署

在服务器部署时，请配置 `PORT` 等环境变量，运行 `npm install` 安装依赖后，执行 `npm start` 启动服务。生产环境下应替换内存存储为数据库，强化用户认证与权限控制，并将 session key 存入安全配置。

## Future Work & Suggestions

This skeleton covers the basic structure requested in the project instructions. To fully meet all requirements, further development is needed:

1. **Enhanced authentication & authorization** – implement proper user roles (student, TA, admin) with persistent storage, registration review, and moderation features.
2. **Assignment grading & feedback** – integrate PDF annotation (via pdf.js or pdf-lib) to allow TAs to mark up submissions and provide downloadable feedback files, including multi‑page preview with zoom and drawing tools.
3. **Forum moderation** – provide admin/TA tools to pin, delete, archive or mute users; upload attachments; implement private messaging and notifications.
4. **Notification system** – centralised notification hub (bell icon) that aggregates email and site messages; show counts and allow clearing notifications.
5. **Resource management** – allow uploading and organising of lecture notes, slides and other materials; provide secure downloads.
6. **Statistics dashboards** – build grading scales for students to view their performance over time and analytics dashboards for teaching staff.
7. **UI polish** – continue refining the UI to more closely mirror Apple’s design aesthetic; modularise pages into distinct views and add interactive elements where appropriate.

If you have additional feature suggestions, feel free to file an issue or discuss it in the forum. The project is open to improvement.
