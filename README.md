# Cortal – Course Portal

Cortal is a web-based course portal built with **Node.js** (Express) and a lightweight **vanilla JavaScript** front end.  It supports password‑protected registration and login, pending student approval, announcements, assignments with PDF submissions and inline grading, resources, exams, a Markdown/LaTeX–enabled discussion forum with replies, and personalised grade dashboards.  The interface draws inspiration from Apple’s design language: clean cards, rounded buttons and subtle colours.

## Features

- **Announcements & Course Info** – Instructors can publish announcements and edit the course description.  Announcements appear on the home page and trigger both email and in‑app notifications.  Course information is displayed in a dedicated card on the home page.

- **Registration & Login** – Users register with a name, email, password and role.  Students must also provide a student ID and Chinese name; teaching assistants register using an invitation code (`TA2025` by default).  Student registrations are stored as *pending* until approved by an administrator.  When a student registers, all admins receive an email and a notification.  Passwords are hashed with bcrypt.  Users can request a password reset: a time‑limited token is emailed to them, and they can reset the password without administrator involvement.

- **Assignments with Inline Grading** – Each assignment consists of a title, description (supports Markdown and LaTeX), due date and a PDF file.  On the assignment detail page students can view the PDF, upload their submission and preview it, and see their grade once graded.  Instructors annotate directly on the PDF using `pdf.js` and `pdf‑lib`, assign a numeric score and comment, and optionally upload a feedback file.  Grades are displayed as coloured gauges with seven bands (A+, A, A‑, B, C, D, Failed).

- **Assignment Dashboards** – Each assignment detail page includes a dashboard summarising class progress: number of submissions vs. total students, average grade and a bar chart showing the distribution across grade bands.  Students and teaching assistants see the same high‑level view.

- **Home Dashboard** – On the home page logged‑in students see their overall average grade across all graded assignments.  The dashboard uses the same coloured gauge to indicate the grade band (A+ ≥95, A 90–94, A‑ 85–89, B 80–84, C 70–79, D 60–69, Failed <60).

- **Resources & Exams** – Instructors can upload resources (PDF, Word, etc.) with optional comma‑separated tags and set exam notifications.  Resources can be filtered by tag.  Exam notices display the title, date/time and description with Markdown/LaTeX support.

- **Discussion Forum with Replies** – Anyone can create discussion threads and comment using Markdown and LaTeX.  Comments may include file attachments (PDFs and images).  Users can reply to specific comments; replies are labelled “↳ Reply to …” and notifications are sent to the original author.  Teaching assistants are identified with a “TA” badge and can archive or delete posts and comments.

- **Notifications** – All important events—new announcements, assignment submissions, grades posted, exam notices, new comments and replies—generate an email and an in‑app notification.  A bell icon shows the number of unread notifications; clicking it opens the notifications page.

- **Administration Panel** – Admin tasks are organised into tabs: Course Info, Announcements, Assignments, Resources, Exams, Discussions and Students.  Administrators can edit course information, publish and delete announcements, create and manage assignments/resources/exams, moderate discussions (archive/delete), approve or reject pending students, mute/unmute students and update the TA invitation code.  Grades can be exported to CSV.

## Local Development

1. **Install prerequisites** – Ensure [Node.js](https://nodejs.org/) (version 16 or later) and npm are installed on your machine.

2. **Install dependencies**:

   ```bash
   cd course-portal
   npm install
   ```

3. **Run the development server**:

   ```bash
   npm run dev
   ```

   The server runs on **http://localhost:3000** and automatically reloads on back‑end changes via nodemon.  Open this URL in your browser to access the portal.

4. **First‑time registration** – When visiting the portal for the first time you will be prompted to register.  Students must provide a student ID and Chinese name; teaching assistants must supply the invitation code.  Student accounts remain pending until approved by an administrator.  Administrators can log in immediately.

5. **Data storage** – For demonstration purposes, data is held in memory and persisted to `server/data.json`.  Restarting the server retains data, but concurrent writes are not safe.  For production use a database.

## Deployment

1. **Prepare your server** – Install Node.js and npm on your CentOS/Ubuntu server.  Copy the `course-portal` directory to a location such as `/var/www/Cortal`.

2. **Configure environment variables** – Create a `.env` file in the project root and set:

   ```env
   PORT=3000
   JWT_SECRET=change-this-secret
   PUBLIC_BASE_URL=https://your.domain
   SMTP_HOST=smtp.example.com
   SMTP_PORT=465
   SMTP_USER=your-email@example.com
   SMTP_PASS=your-smtp-password
   SMTP_FROM=Cortal <your-email@example.com>
   ```

   `PUBLIC_BASE_URL` is used in password reset emails.  Configure the SMTP variables for Nodemailer so that emails are delivered; without them emails will be logged to the console.

3. **Install dependencies**:

   ```bash
   cd /var/www/Cortal
   npm install --production
   ```

4. **Run with PM2** (recommended):

   ```bash
   sudo npm install -g pm2
   pm2 start server/index.js --name cortal
   pm2 save
   pm2 startup
   ```

   PM2 keeps the Node.js process alive and restarts it on failure or reboot.  Use `pm2 logs cortal` to view logs.

5. **Configure Nginx** – Install Nginx and add a reverse proxy configuration:

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

   Reload Nginx with `sudo systemctl reload nginx`.  For HTTPS, obtain a TLS certificate and adjust the server block accordingly.

6. **Persistent storage** – To maintain data across restarts and support concurrent users, integrate a database.  Replace the in‑memory arrays in `server/index.js` with database queries and update functions.

7. **Email delivery** – Ensure your SMTP credentials are valid and outbound SMTP is allowed on your server.  You can test email delivery by requesting a password reset.

## License

This project is licensed under the MIT License.