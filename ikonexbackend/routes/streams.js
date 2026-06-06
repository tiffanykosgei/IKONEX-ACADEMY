const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all streams
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM streams ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single stream with its students and assigned subjects
router.get('/:id', async (req, res) => {
  try {
    const stream = await pool.query('SELECT * FROM streams WHERE id = $1', [req.params.id]);
    if (stream.rows.length === 0) return res.status(404).json({ error: 'Stream not found' });

    const students = await pool.query(
      'SELECT * FROM students WHERE stream_id = $1 ORDER BY last_name ASC',
      [req.params.id]
    );
    const subjects = await pool.query(
      `SELECT sub.*
       FROM subjects sub
       JOIN stream_subjects ss ON sub.id = ss.subject_id
       WHERE ss.stream_id = $1
       ORDER BY sub.name ASC`,
      [req.params.id]
    );

    res.json({ ...stream.rows[0], students: students.rows, subjects: subjects.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create stream
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Stream name is required' });
  try {
    const result = await pool.query(
      'INSERT INTO streams (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Stream name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT update stream
router.put('/:id', async (req, res) => {
  const { name } = req.body;
  try {
    const result = await pool.query(
      'UPDATE streams SET name = $1 WHERE id = $2 RETURNING *',
      [name, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Stream not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE stream
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM streams WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Stream not found' });
    res.json({ message: 'Stream deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
