const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1231',
    database: 'adminDB'
});

db.connect(err => {
    if (err) throw err;
    console.log("Connected to MySQL Database!");
});

// Serve the login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login Route
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT * FROM admins WHERE username = ? AND password = ?";

    db.query(sql, [email, password], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ success: false, message: "Internal server error" });
        }
        if (result.length > 0) {
            return res.json({ success: true, message: "Login successful!" });
        } else {
            return res.json({ success: false, message: "Invalid email or password" });
        }
    });
});

// /getOptionsByDate Endpoint
// /getOptionsByDate Endpoint
app.post('/getOptionsByDate', (req, res) => {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({ success: false, message: "Missing date." });
    }
  
    // Convert provided date into a weekday name
    const dayName = new Date(date).toLocaleString('en-us', { weekday: 'long' });
    console.log(`Received date: ${date}, converted to day: ${dayName}`);
  
    // Query the Schedule table for the given day using db (not connection)
    const query = 'SELECT * FROM Schedule WHERE day = ?';
    db.query(query, [dayName], (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ success: false, message: "Database error." });
      }
      
      if (results.length === 0) {
        return res.json({ success: false, message: "No schedule options available for the selected date." });
      }
      
      // Group results by subject and class. Each group will have an array of time slots.
      const options = {};
      results.forEach(row => {
        const key = `${row.subject}-${row.class}`;
        if (!options[key]) {
          options[key] = {
            subject: row.subject,
            class: row.class,
            slots: []
          };
        }
        // Format the time slot without seconds.
        const formattedFromTime = row.from_time.slice(0, 5); // e.g., "10:20"
        const formattedToTime = row.to_time.slice(0, 5);       // e.g., "12:00"
        const slot = `${formattedFromTime} - ${formattedToTime}`;
        options[key].slots.push(slot);
      });
      
      const subjectOptions = Object.values(options);
      console.log("Returning options:", subjectOptions);
      return res.json({ success: true, subjects: subjectOptions });
    });
});

// Get Schedule Endpoint
app.post('/getSchedule', (req, res) => {
    const { date, subject, className, slot } = req.body;
    if (!date || !subject || !className || !slot) {
        return res.status(400).json({ success: false, message: "Missing required fields." });
    }
    
    // Convert the provided date to a weekday name
    const day = new Date(date).toLocaleString('en-us', { weekday: 'long' });
    
    // Parse the slot string into fromTime and toTime
    const times = slot.split(" - ");
    if (times.length !== 2) {
        return res.status(400).json({ success: false, message: "Invalid slot format." });
    }
    const [fromTime, toTime] = times;
    // Append ":00" to match the TIME format stored in the database
    const formattedFromTime = fromTime + ":00";
    const formattedToTime = toTime + ":00";
    
    // Query the Schedule table with day, subject, class, and the formatted times.
    const query = `
      SELECT class, subject 
      FROM Schedule 
      WHERE day = ? AND subject = ? AND class = ? AND from_time = ? AND to_time = ?
    `;
    db.query(query, [day, subject, className, formattedFromTime, formattedToTime], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }
        if (results.length === 0) {
            return res.json({ success: false, message: "No schedule found." });
        }
        
        // If schedule exists, retrieve the students from the corresponding class table.
        const studentQuery = `SELECT name, roll_number FROM ${className}`;
        db.query(studentQuery, (err, students) => {
            if (err) {
                console.error("Error fetching students:", err);
                return res.status(500).json({ success: false, message: "Error fetching students" });
            }
            res.json({ success: true, className, subject, students });
        });
    });
});



// Multer for Image Upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'static/uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// Image upload endpoint
app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(req.file.path), req.file.filename);

        const flaskResponse = await axios.post('http://localhost:5000/process', form, {
            headers: form.getHeaders()
        });

        res.json({
            success: true,
            message: "Image processed",
            result: flaskResponse.data.result
        });

    } catch (error) {
        console.error('Flask processing error:', error);
        res.status(500).json({
            success: false,
            message: error.response?.data?.error || 'Face processing failed'
        });
    }
});

// Attendance Update Route with `Actual Hours` Calculation
app.post('/updateAttendance', (req, res) => {
    console.log("Payload received:", req.body);

    const { date, className, subject, fromTime, toTime, verifiedStudents } = req.body;

    if (!date || !className || !subject || !fromTime || !toTime) {
        return res.json({ success: false, message: "Incomplete data" });
    }

    // Time conversion to decimal hours
    function timeToDecimal(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours + minutes / 60;
    }

    const actualHours = Math.ceil(timeToDecimal(toTime) - timeToDecimal(fromTime));

    // First, reset `Total Hours` to 0 and insert `Actual Hours` for all students
    const resetQuery = `
        INSERT INTO details1 (\`Date\`, \`Class\`, \`Subject\`, \`From\`, \`To\`, \`Total Hours\`, \`Actual Hours\`, \`Name\`)
        SELECT ?, ?, ?, ?, ?, 0, ?, name 
        FROM ${className}
        WHERE name NOT IN (?)
    `;

    db.query(resetQuery, [date, className, subject, fromTime, toTime, actualHours, verifiedStudents], (err, result) => {
        if (err) {
            console.error("Error resetting attendance:", err);
            return res.status(500).json({ success: false, message: "Database error during reset" });
        }

        // Insert verified students with correct Total Hours and Actual Hours
        const verifiedValues = verifiedStudents.map(name => [date, className, subject, fromTime, toTime, actualHours, actualHours, name]);

        const insertQuery = `
            INSERT INTO details1 (\`Date\`, \`Class\`, \`Subject\`, \`From\`, \`To\`, \`Total Hours\`, \`Actual Hours\`, \`Name\`)
            VALUES ?
        `;

        db.query(insertQuery, [verifiedValues], (err, result) => {
            if (err) {
                console.error("Error updating attendance:", err);
                return res.status(500).json({ success: false, message: "Database error during attendance update" });
            }
            res.json({ success: true, message: "Attendance updated successfully" });
        });
    });
});

// Server Listener
app.listen(3000, () => {
    console.log("Server running on port http://localhost:3000");
});
