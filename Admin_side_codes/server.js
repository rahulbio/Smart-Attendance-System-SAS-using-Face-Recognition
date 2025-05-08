const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const port = 3001;

// Parse URL-encoded bodies (from HTML forms)
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL connection configuration
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1231',
    database: 'adminDB'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Serve static files (HTML, CSS, JS) from the public folder
app.use(express.static('public'));

// Define route for "/" to serve the index.html file (login page)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login POST endpoint – verifies credentials from the form
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const sql = 'SELECT * FROM students WHERE email = ?';
    
    db.query(sql, [email], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).send('Internal Server Error');
        }
        // If no user is found or password doesn't match, alert the user
        if (results.length === 0 || results[0].password !== password) {
            return res.send(`<script>alert('Invalid email or password'); window.location.href = '/index.html';</script>`);
        }
        // On success, redirect to the dashboard with the student name as a query parameter
        const student = results[0];
        res.redirect(`/dashboard?name=${encodeURIComponent(student.name)}`);
    });
});

// Dashboard route to display the student dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Attendance Report Endpoint – returns detailed attendance records for the student
// Attendance Report Endpoint – returns detailed attendance records for the student
// Attendance Report Endpoint – returns detailed attendance records for the student
app.get('/attendanceReport', (req, res) => {
    const studentName = req.query.name;
    if (!studentName) {
      return res.status(400).json({ error: 'Missing student name parameter' });
    }
    // Use DATE_FORMAT to return the date as 'YYYY-MM-DD'
    const sql = `
      SELECT DATE_FORMAT(Date, '%Y-%m-%d') AS Date, Class, Subject, \`From\`, \`To\`, \`Total Hours\`, \`Actual Hours\`
      FROM details1
      WHERE Name = ?
      ORDER BY Date ASC
    `;
    db.query(sql, [studentName], (err, results) => {
      if (err) {
        console.error('Error fetching attendance report:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    });
  });
  


  

// Attendance endpoint – queries the details1 table to compute attendance per subject
app.get('/attendance', (req, res) => {
    const studentName = req.query.name;
    if (!studentName) {
        return res.status(400).send("Missing student name parameter");
    }
    // Query details1 ensuring we ignore rows with NULL values in critical columns
    const sql = `
        SELECT Subject, 
               SUM(\`Total Hours\`) AS PresentHours, 
               SUM(\`Actual Hours\`) AS ActualHours 
        FROM details1 
        WHERE Name = ? 
          AND \`Total Hours\` IS NOT NULL 
          AND \`Actual Hours\` IS NOT NULL 
        GROUP BY Subject
    `;
    
    db.query(sql, [studentName], (err, results) => {
        if (err) {
            console.error('Attendance query error:', err);
            return res.status(500).send("Database error");
        }
        // Build an attendance object with calculated percentages per subject
        const attendance = {};
        results.forEach(row => {
            const presentHours = row.PresentHours || 0;
            const actualHours = row.ActualHours || 0;
            let presentPercentage = 0, absentPercentage = 0;
            if (actualHours > 0) {
                presentPercentage = (presentHours / actualHours) * 100;
                absentPercentage = 100 - presentPercentage;
            }
            attendance[row.Subject] = {
                present: presentPercentage.toFixed(2),
                absent: absentPercentage.toFixed(2)
            };
        });
        res.json(attendance);
    });
});


// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
