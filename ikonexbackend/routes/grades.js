const express = require('express');
const router = express.Router();
const pool = require('../db');

function validateGrade({ min_mark, max_mark, grade, points }) {
  const min = Number(min_mark);
  const max = Number(max_mark);
  const pts = Number(points);

  if (!grade) return 'Grade label is required';
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 'Minimum and maximum marks are required';
  if (min < 0 || max > 100 || min > max) return 'Grade range must be between 0 and 100';
  if (!Number.isFinite(pts) || pts < 0) return 'Points must be zero or higher';
  return null;
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM grade_config ORDER BY min_mark DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const error = validateGrade(req.body);
  if (error) return res.status(400).json({ error });

  const { min_mark, max_mark, grade, points, remarks } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO grade_config (min_mark, max_mark, grade, points, remarks)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [min_mark, max_mark, grade, points, remarks || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const error = validateGrade(req.body);
  if (error) return res.status(400).json({ error });

  const { min_mark, max_mark, grade, points, remarks } = req.body;
  try {
    const result = await pool.query(
      `UPDATE grade_config
       SET min_mark=$1, max_mark=$2, grade=$3, points=$4, remarks=$5
       WHERE id=$6 RETURNING *`,
      [min_mark, max_mark, grade, points, remarks || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Grade scale not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM grade_config WHERE id=$1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Grade scale not found' });
    res.json({ message: 'Grade scale deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
