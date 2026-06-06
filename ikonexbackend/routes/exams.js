const express = require('express');
const router = express.Router();
const pool = require('../db');

async function subjectBelongsToStream(streamId, subjectId) {
  const result = await pool.query(
    `SELECT 1
     FROM stream_subjects
     WHERE stream_id = $1 AND subject_id = $2`,
    [streamId, subjectId]
  );
  return result.rows.length > 0;
}

// GET all exams
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, s.name AS stream_name, sub.name AS subject_name, sub.code AS subject_code
      FROM exams e
      LEFT JOIN streams s ON e.stream_id = s.id
      LEFT JOIN subjects sub ON e.subject_id = sub.id
      ORDER BY e.year DESC, e.term ASC, e.name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET exams by stream
router.get('/stream/:streamId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, sub.name AS subject_name, sub.code AS subject_code
       FROM exams e
       LEFT JOIN subjects sub ON e.subject_id = sub.id
       WHERE e.stream_id=$1
       ORDER BY e.year DESC, e.term ASC, e.name ASC`,
      [req.params.streamId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create exam
router.post('/', async (req, res) => {
  const { name, exam_type, term, year, stream_id, subject_id } = req.body;
  if (!name || !exam_type || !stream_id || !subject_id) {
    return res.status(400).json({ error: 'Name, exam_type, stream_id and subject_id are required' });
  }

  try {
    const isValidSubject = await subjectBelongsToStream(stream_id, subject_id);
    if (!isValidSubject) {
      return res.status(400).json({ error: 'Selected subject is not assigned to this stream' });
    }

    const result = await pool.query(
      `INSERT INTO exams (name, exam_type, term, year, stream_id, subject_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, exam_type, term, year, stream_id, subject_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update exam
router.put('/:id', async (req, res) => {
  const { name, exam_type, term, year, stream_id, subject_id } = req.body;
  if (!name || !exam_type || !stream_id || !subject_id) {
    return res.status(400).json({ error: 'Name, exam_type, stream_id and subject_id are required' });
  }

  try {
    const isValidSubject = await subjectBelongsToStream(stream_id, subject_id);
    if (!isValidSubject) {
      return res.status(400).json({ error: 'Selected subject is not assigned to this stream' });
    }

    const result = await pool.query(
      `UPDATE exams SET name=$1, exam_type=$2, term=$3, year=$4, stream_id=$5, subject_id=$6
       WHERE id=$7 RETURNING *`,
      [name, exam_type, term, year, stream_id, subject_id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE exam
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM exams WHERE id=$1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    res.json({ message: 'Exam deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
