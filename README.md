# Cortal – Course Portal

Cortal is a lightweight web application for managing university courses. It provides a modern, Apple‑style interface for students and teaching assistants (TAs) to interact with course content, submit assignments, participate in discussions, and handle grading.  The project is built with **Node.js/Express** on the back end and vanilla JS/HTML/CSS on the front end.

## Features

### For Students

* **Course homepage** – Browse course information and announcements with full Markdown and LaTeX support.
* **Assignments** – Download assignment PDFs, upload your submission as a PDF (with replacement before grading), view your grade and feedback when available, and see an overall grade gauge on the home page.
* **Exam notifications** – View upcoming exams with rich‑text descriptions (Markdown/LaTeX).
* **Resources** – Download supplemental files; filter by tags.
* **Discussion forum** – Post new threads, comment, and reply. Replies notify the original poster via email and in‑app notification.
* **Notifications** – A bell icon shows unread notifications; clicking opens the notification list. Notifications link back to the relevant assignment or thread.
* **Password reset** – Request a reset link via email and set a new password without admin approval.

### For TAs/Admins

* **Student/TA roster** – View all registered users, approve pending students, and mute/unmute students directly from the list.
* **Announcements, assignments, resources, exams** – Create, edit, and delete. Upload assignment PDFs and resources.
* **Assignment grading** – Dedicated grading pages show ungraded and graded submissions. Annotate submissions with drawings, assign a grade and comments, and optionally upload feedback. After grading, the student receives an email/notification linking back to the assignment.
* **Discussion moderation** – Delete or archive threads and comments. Mute users when necessary.
* **Data export** – Export grades to CSV.

## Installation

### Prerequisites

* Node.js (v18 or higher recommended)
* npm
* (Optional) A mail provider supporting SMTP to send email notifications. If not configured, Cortal will fall back to logging emails to the console.

### Local Development

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the following variables as needed:

   ```ini
   PORT=3000
   JWT_SECRET=your‑secret
   # SMTP configuration (optional but recommended)
   SMTP_HOST=smtp.example.com
   SMTP_PORT=465
   SMTP_USER=your@example.com
   SMTP_PASS=your‑smtp‑password
   SMTP_FROM=Cortal <your@example.com>
   PUBLIC_BASE_URL=http://localhost:3000
   ```

3. Run in development mode:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` in your browser.  Use the register form to create a student or admin account (admins require the current TA invitation code available in the Admin dashboard).

### Production Deployment

1. **Install PM2 (recommended)** to keep the Node process alive:

   ```bash
   sudo npm install -g pm2
   pm2 start server/index.js --name cortal
   pm2 save
   pm2 startup
   ```

2. **Nginx reverse proxy** (example):

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

3. Configure SSL/TLS via Let’s Encrypt or your certificate provider.

### Data Persistence

User data, assignments, submissions, resources, exams, and notifications are stored in `server/data.json`.  This file is loaded at startup and saved whenever changes occur.  Back up this file to retain data across deployments.

### Security Notes

* Passwords are stored hashed using bcrypt.  Use a strong `JWT_SECRET`.
* The admin role allows full control over course data.  Protect the TA invitation code.
* SMTP credentials should be kept secret.

## Usage Tips

* Students must be approved by an admin before they can submit or post in forums.
* TAs can mute a student to prevent them from posting or submitting; unmute to restore access.
* The grading interface automatically merges annotations with the first page of the student’s PDF to produce feedback.  Annotate anywhere on the page before submitting the grade.
* Notifications accumulate on the bell icon; click to view details.  Assignment‑related notifications link back to the assignment.

## License

This project is provided for educational purposes and may be modified freely.