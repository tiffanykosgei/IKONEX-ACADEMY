const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes (we'll add these one by one)
app.use('/api/streams',  require('./routes/streams'));
app.use('/api/students', require('./routes/students'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/exams',    require('./routes/exams'));
app.use('/api/scores',   require('./routes/scores'));
app.use('/api/reports',  require('./routes/reports'));
app.use('/api/grades',   require('./routes/grades'));

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Ikonex Academy API is running' });
});

const PORT = process.env.PORT || 5000;
async function start() {
  await pool.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE');

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server', err);
  process.exit(1);
});
