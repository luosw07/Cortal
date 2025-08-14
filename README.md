# Foundations of Algebra Course Portal

This repository contains a dynamic web portal for the **Foundations of Algebra** course.  It is built with an **Express/Node.js** back end and a lightweight vanilla JavaScript front end styled after Apple’s Human Interface Guidelines.  The portal allows instructors to post announcements and assignments, manage resources and exams, moderate discussions, review and grade PDF submissions, and communicate privately with students.  Students can register, browse materials, submit assignments as PDFs, participate in discussion forums and view their scores.  A notification system keeps everyone informed of important events via email and an in‑app bell.

## Key Features

- **Announcements** – Instructors can publish course announcements.  Emails are sent to registered users and announcements are visible on the home page for guests.

- **Assignments with Inline Grading** – Each assignment has a dedicated detail page with three panels: (1) a multi‑page PDF viewer powered by `pdf.js`; (2) a submission panel with a polished upload control that previews the student’s PDF; and (3) a grading panel displaying the score, comments and a download link for the merged feedback file.  Teaching assistants annotate directly on top of the PDF and assign grades; the annotations are merged into the PDF using `pdf‑lib`.

- **Resource Downloads** – Course notes, problem sets and other files can be uploaded by instructors and downloaded by students.  Files live under the `server/uploads/resources` directory.

- **Exam Notifications** – Upcoming assessments can be added with a title, date/time and description.  They appear on the exams page and notify all students.

- **Enhanced Registration & Permissions** – Students must register with their name, email, student ID and Chinese name.  Registrations require **administrator approval**; pending students can browse the site but cannot post or submit assignments.  Teaching assistants register via an invitation code configurable in the admin panel.

- **Discussion Forum** – Users can start discussion threads and post comments with Markdown/LaTeX formatting and optional file attachments.  Each thread opens in its own page showing the original post, attachments and chronological comments.  Teaching assistants are labelled with a “TA” badge and can archive or delete threads/comments.  Administrators can also **mute** students by student ID, preventing them from posting or submitting until unmuted.

- **Grade Dashboard** – A dedicated **Scores** page displays the average grade and number of graded submissions for each assignment.  Students can compare their performance to the class average; administrators see the same table for high‑level insight.

- **Private Messaging** – Users can send private messages to any email address.  The **Messages** page lists incoming messages, allows reading and marking them as read, and includes a composer for new messages.  The recipient receives an email and an in‑app notification.

- **Notifications** – Important actions (submissions, grades posted, new announcements, exam notices, new messages) generate both an email and an in‑app notification.  A bell icon with a label shows the number of unread notifications; clicking it reveals the notification panel.

- **Administration Panel** – All management tasks live on a single page: editing course information, publishing announcements, creating assignments/exams/resources, moderating discussions, reviewing grade statistics, adjusting the TA invitation code, approving or rejecting pending student registrations, and muting/unmuting students.

- **Apple‑Inspired Design** – The front end uses system fonts, light colours, translucent panels and rounded cards to echo Apple’s design language.  The interface scales gracefully from desktop to mobile screens.

## Local Development

1. **Install prerequisites** – Ensure you have [Node.js](https://nodejs.org/) (version 14 or later) and npm installed.

2. **Install dependencies**:

   ```bash
   cd course-portal
   npm install
   ```

3. **Start the development server**:

   ```bash
   npm run dev
   ```

   The server runs on **http://localhost:3000**.  During development it automatically reloads on back‑end changes via nodemon.  Open this URL in your browser to access the portal.

4. **First‑time registration** – When visiting the portal for the first time you will be prompted to enter your name, email and role.  Students must provide a student ID and Chinese name.  Teaching assistants need a valid invitation code (the default is `TA2025`; administrators can change it).  Student registrations are stored as *pending* until an administrator approves them in the admin panel.

5. **Data storage** – For demonstration purposes, all data lives in in‑memory arrays.  Restarting the server will reset announcements, assignments, submissions, forum posts and registration state.  For persistent storage you would integrate a database (e.g. PostgreSQL) and replace the in‑memory data structures.

## Deployment

To deploy the portal on a server you may follow these general steps:

1. **Prepare the environment** – Install Node.js on your server and clone or copy the `course-portal` directory.  In production you should set environment variables such as `PORT` and credentials for an SMTP server (see below).

2. **Configure email** – The current implementation uses Nodemailer’s *stream* transport, which writes outgoing emails to the console.  In a real deployment you should configure an SMTP transport:

   ```js
   const transporter = nodemailer.createTransport({
     host: 'smtp.example.com',
     port: 587,
     secure: false,
     auth: {
       user: process.env.SMTP_USER,
       pass: process.env.SMTP_PASS,
     },
   });
   ```

   Store your SMTP credentials in environment variables and never commit them to source control.

3. **Install dependencies**:

   ```bash
   cd course-portal
   npm install --production
   ```

4. **Run the server** – Use the built‑in start script to launch the app:

   ```bash
   npm start
   ```

   Or run `node server/index.js` directly.  The application will listen on the port defined by `PORT` (default 3000).

5. **Reverse proxy and SSL** – In a production environment you should run the Node.js process behind a reverse proxy like Nginx or Apache, handle HTTPS termination, and proxy requests to the Node server.  Refer to your proxy’s documentation for configuration details.

6. **Persistence** – To retain data across restarts you should integrate a database.  Replace the in‑memory arrays in `server/index.js` with database queries and updates.  You may also wish to store uploaded files in a cloud storage service.

## Additional Feature Ideas

This portal implements many core features of modern learning management systems, but there is room to grow.  Below are some suggestions inspired by platforms like Canvas and Gradescope.  If you would like to add any of these, please let me know:

- **Rubrics & Structured Grading** – Define detailed scoring criteria for each assignment so that graders apply consistent standards and students understand how their work is evaluated.
- **Group Assignments & Peer Review** – Allow students to submit work in teams and review each other’s submissions, similar to Canvas’s group and peer review tools.
- **Calendar Integration** – Provide calendar feeds for assignment deadlines and exam dates that students can subscribe to in Outlook or Google Calendar.
- **Analytics Dashboard** – Generate charts showing grade distributions, submission timelines and forum engagement to help instructors monitor course progress.
- **Export & Backup** – Offer administrators the ability to export grades, forum posts and resources as CSV or PDF for archiving.

Feel free to suggest other improvements!  This project is intentionally modular so new pages, modules and APIs can be added with minimal disruption.

## License

This project is released under the MIT License.