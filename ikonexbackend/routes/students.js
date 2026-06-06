const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all students (with stream name)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, st.name AS stream_name
      FROM students s
      LEFT JOIN streams st ON s.stream_id = st.id
      ORDER BY s.last_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET students by stream
router.get('/stream/:streamId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, st.name AS stream_name
       FROM students s
       LEFT JOIN streams st ON s.stream_id = st.id
       WHERE s.stream_id = $1 ORDER BY s.last_name ASC`,
      [req.params.streamId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single student
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, st.name AS stream_name
      FROM students s
      LEFT JOIN streams st ON s.stream_id = st.id
      WHERE s.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST register student
router.post('/', async (req, res) => {
  const { first_name, last_name, admission_number, date_of_birth, gender, stream_id } = req.body;
  if (!first_name || !last_name || !admission_number) {
    return res.status(400).json({ error: 'First name, last name and admission number are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO students (first_name, last_name, admission_number, date_of_birth, gender, stream_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [first_name, last_name, admission_number, date_of_birth, gender, stream_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Admission number already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT update student
router.put('/:id', async (req, res) => {
  const { first_name, last_name, admission_number, date_of_birth, gender, stream_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE students SET first_name=$1, last_name=$2, admission_number=$3,
       date_of_birth=$4, gender=$5, stream_id=$6 WHERE id=$7 RETURNING *`,
      [first_name, last_name, admission_number, date_of_birth, gender, stream_id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE student
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM students WHERE id=$1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;