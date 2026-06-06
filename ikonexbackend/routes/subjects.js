const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all subjects
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET subjects for a specific stream
router.get('/stream/:streamId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sub.* FROM subjects sub
      JOIN stream_subjects ss ON sub.id = ss.subject_id
      WHERE ss.stream_id = $1 ORDER BY sub.name ASC
    `, [req.params.streamId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single subject with assigned streams
router.get('/:id', async (req, res) => {
  try {
    const subject = await pool.query('SELECT * FROM subjects WHERE id=$1', [req.params.id]);
    if (subject.rows.length === 0) return res.status(404).json({ error: 'Subject not found' });

    const streams = await pool.query(`
      SELECT st.*
      FROM streams st
      JOIN stream_subjects ss ON st.id = ss.stream_id
      WHERE ss.subject_id = $1
      ORDER BY st.name ASC
    `, [req.params.id]);

    res.json({ ...subject.rows[0], streams: streams.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create subject
router.post('/', async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
  try {
    const result = await pool.query(
      'INSERT INTO subjects (name, code) VALUES ($1,$2) RETURNING *',
      [name, code]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Subject name or code already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT update subject
router.put('/:id', async (req, res) => {
  const { name, code } = req.body;
  try {
    const result = await pool.query(
      'UPDATE subjects SET name=$1, code=$2 WHERE id=$3 RETURNING *',
      [name, code, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Subject not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE subject
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM subjects WHERE id=$1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Subject not found' });
    res.json({ message: 'Subject deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST assign subject to stream
router.post('/assign', async (req, res) => {
  const { stream_id, subject_id } = req.body;
  if (!stream_id || !subject_id) return res.status(400).json({ error: 'stream_id and subject_id are required' });
  try {
    const result = await pool.query(
      'INSERT INTO stream_subjects (stream_id, subject_id) VALUES ($1,$2) RETURNING *',
      [stream_id, subject_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Subject already assigned to this stream' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE unassign subject from stream
router.delete('/assign/:streamId/:subjectId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM stream_subjects WHERE stream_id=$1 AND subject_id=$2',
      [req.params.streamId, req.params.subjectId]
    );
    res.json({ message: 'Subject unassigned from stream' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
