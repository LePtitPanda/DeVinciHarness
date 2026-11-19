# De Vinci (DeVinciHarness prototype)

School integration for ESILV students. Read-only by design:

- **Moodle** (learning.devinci.fr): sign in once in an app window (the school's own login page); the app keeps only Moodle's mobile-app token, encrypted by the OS. Only allowlisted read functions can be called.
- **Schedule**: your personal iCal link (https://ical.devinci.me/…) or a downloaded .ics file.
- **Agent tools**: `school_schedule`, `school_courses`, `school_course_contents`, `school_read_file`, `school_deadlines`, `school_announcements`.
- **Home page** (sidebar → De Vinci): exams, deadlines, this week, and "What do you want to study?", which opens a normal session.
- Course files the AI reads can be added to the library through the app's normal import.
