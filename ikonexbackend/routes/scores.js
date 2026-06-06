const express = require('express');
const router = express.Router();
const pool = require('../db');

// Helper: get grade from marks
async function getGrade(pool, marks) {
  const result = await pool.query(
    'SELECT grade, points, remarks FROM grade_config WHERE $1 BETWEEN min_mark AND max_mark LIMIT 1',
    [marks]
  );
  return result.rows[0] || { grade: 'N/A', points: 0, remarks: '' };
}

function maxMarksForExamType(examType) {
  return examType === 'cat' ? 30 : 70;
}

async function getExam(examId) {
  const result = await pool.query(
    `SELECT e.*, sub.name AS subject_name, sub.code AS subject_code
     FROM exams e
     LEFT JOIN subjects sub ON e.subject_id = sub.id
     WHERE e.id=$1`,
    [examId]
  );
  return result.rows[0];
}

async function getTermResults(examId) {
  const exam = await getExam(examId);
  if (!exam) return null;

  const result = await pool.query(`
    SELECT
      s.id,
      s.first_name,
      s.last_name,
      s.admission_number,
      COALESCE(SUM(CASE WHEN e.exam_type = 'cat' THEN sc.marks ELSE 0 END), 0) AS cat_total,
      COALESCE(MAX(CASE WHEN e.exam_type = 'exam' THEN sc.marks ELSE NULL END), 0) AS main_exam
    FROM students s
    LEFT JOIN scores sc ON sc.student_id = s.id
    LEFT JOIN exams e ON e.id = sc.exam_id
      AND e.stream_id = $1
      AND e.subject_id = $2
      AND e.term = $3
      AND e.year = $4
    WHERE s.stream_id = $1
    GROUP BY s.id, s.first_name, s.last_name, s.admission_number
  `, [exam.stream_id, exam.subject_id, exam.term, exam.year]);

  const rows = [];
  for (const student of result.rows) {
    const catAverage = Number((parseFloat(student.cat_total || 0) / 2).toFixed(2));
    const mainExam = Number(parseFloat(student.main_exam || 0).toFixed(2));
    const total = Number((catAverage + mainExam).toFixed(2));
    const gradeInfo = await getGrade(pool, total);

    rows.push({
      id: student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      admission_number: student.admission_number,
      scores: [{
        subject_name: exam.subject_name,
        code: exam.subject_code,
        cat_average: catAverage.toFixed(2),
        main_exam: mainExam.toFixed(2),
        marks: total.toFixed(2),
      }],
      cat_average: catAverage.toFixed(2),
      main_exam: mainExam.toFixed(2),
      total: total.toFixed(2),
      average: total.toFixed(2),
      grade: gradeInfo.grade,
      points: gradeInfo.points,
    });
  }

  rows.sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
  rows.forEach((row, index) => { row.position = index + 1; });

  return { exam, rows };
}

async function getAllTermResults(streamId) {
  const params = [];
  const streamFilter = streamId ? 'WHERE e.stream_id = $1' : '';
  if (streamId) params.push(streamId);

  const groupsRes = await pool.query(`
    SELECT DISTINCT
      e.stream_id,
      st.name AS stream_name,
      e.subject_id,
      sub.name AS subject_name,
      sub.code AS subject_code,
      e.term,
      e.year
    FROM exams e
    LEFT JOIN streams st ON st.id = e.stream_id
    LEFT JOIN subjects sub ON sub.id = e.subject_id
    ${streamFilter}
    ORDER BY e.year DESC, e.term ASC, st.name ASC, sub.name ASC
  `, params);

  const rows = [];
  for (const group of groupsRes.rows) {
    const result = await pool.query(`
      SELECT
        s.id,
        s.first_name,
        s.last_name,
        s.admission_number,
        COALESCE(SUM(CASE WHEN e.exam_type = 'cat' THEN sc.marks ELSE 0 END), 0) AS cat_total,
        COALESCE(MAX(CASE WHEN e.exam_type = 'exam' THEN sc.marks ELSE NULL END), 0) AS main_exam
      FROM students s
      LEFT JOIN scores sc ON sc.student_id = s.id
      LEFT JOIN exams e ON e.id = sc.exam_id
        AND e.stream_id = $1
        AND e.subject_id = $2
        AND e.term = $3
        AND e.year = $4
      WHERE s.stream_id = $1
      GROUP BY s.id, s.first_name, s.last_name, s.admission_number
    `, [group.stream_id, group.subject_id, group.term, group.year]);

    const groupRows = [];
    for (const student of result.rows) {
      const catAverage = Number((parseFloat(student.cat_total || 0) / 2).toFixed(2));
      const mainExam = Number(parseFloat(student.main_exam || 0).toFixed(2));
      const total = Number((catAverage + mainExam).toFixed(2));
      const gradeInfo = await getGrade(pool, total);

      groupRows.push({
        id: `${group.stream_id}-${group.subject_id}-${group.term}-${group.year}-${student.id}`,
        student_id: student.id,
        stream_id: group.stream_id,
        stream_name: group.stream_name,
        subject_id: group.subject_id,
        subject_name: group.subject_name,
        subject_code: group.subject_code,
        term: group.term,
        year: group.year,
        first_name: student.first_name,
        last_name: student.last_name,
        admission_number: student.admission_number,
        cat_average: catAverage.toFixed(2),
        main_exam: mainExam.toFixed(2),
        total: total.toFixed(2),
        average: total.toFixed(2),
        grade: gradeInfo.grade,
        points: gradeInfo.points,
      });
    }

    groupRows.sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
    groupRows.forEach((row, index) => { row.position = index + 1; });
    rows.push(...groupRows);
  }

  return rows;
}

// GET scores for a student (all exams)
router.get('/student/:studentId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sc.*, sub.name AS subject_name, sub.code,
             e.name AS exam_name, e.exam_type, e.term, e.year
      FROM scores sc
      JOIN subjects sub ON sc.subject_id = sub.id
      JOIN exams e ON sc.exam_id = e.id
      WHERE sc.student_id = $1
      ORDER BY e.year DESC, sub.name ASC
    `, [req.params.studentId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET scores for a student in one exam
router.get('/student/:studentId/exam/:examId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sc.*, sub.name AS subject_name, sub.code,
             e.name AS exam_name, e.exam_type, e.term, e.year
      FROM scores sc
      JOIN subjects sub ON sc.subject_id = sub.id
      JOIN exams e ON sc.exam_id = e.id
      WHERE sc.student_id = $1 AND sc.exam_id = $2
      ORDER BY sub.name ASC
    `, [req.params.studentId, req.params.examId]);

    const rows = [];
    for (const score of result.rows) {
      const gradeInfo = await getGrade(pool, score.marks);
      rows.push({ ...score, grade: gradeInfo.grade, points: gradeInfo.points, remarks: gradeInfo.remarks });
    }

    const total = rows.reduce((sum, s) => sum + parseFloat(s.marks), 0);
    const average = rows.length > 0 ? Number((total / rows.length).toFixed(2)) : 0;
    const overallGrade = await getGrade(pool, average);

    res.json({
      scores: rows,
      total: Number(total.toFixed(2)),
      average,
      grade: overallGrade.grade,
      points: overallGrade.points,
      remarks: overallGrade.remarks,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET class performance for a subject in an exam
router.get('/exam/:examId/subject/:subjectId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sc.*, s.first_name, s.last_name, s.admission_number,
             RANK() OVER (ORDER BY sc.marks DESC) AS subject_position
      FROM scores sc
      JOIN students s ON sc.student_id = s.id
      WHERE sc.exam_id=$1 AND sc.subject_id=$2
      ORDER BY sc.marks DESC
    `, [req.params.examId, req.params.subjectId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET full results for an exam (all students, all subjects, with rankings)
router.get('/exam/:examId/results', async (req, res) => {
  try {
    const termResults = await getTermResults(req.params.examId);
    if (!termResults) return res.status(404).json({ error: 'Exam not found' });
    res.json(termResults.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET calculated results for all exam groups, optionally filtered by class/stream
router.get('/results', async (req, res) => {
  try {
    const rows = await getAllTermResults(req.query.stream_id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST record a score
router.post('/', async (req, res) => {
  const { student_id, subject_id, exam_id, marks } = req.body;
  if (student_id == null || subject_id == null || exam_id == null || marks == null) {
    return res.status(400).json({ error: 'student_id, subject_id, exam_id and marks are required' });
  }
  try {
    const exam = await getExam(exam_id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const maxMarks = maxMarksForExamType(exam.exam_type);
    if (marks < 0 || marks > maxMarks) {
      return res.status(400).json({ error: `Marks must be between 0 and ${maxMarks}` });
    }

    const validRes = await pool.query(`
      SELECT s.id
      FROM students s
      JOIN exams e ON e.stream_id = s.stream_id
      LEFT JOIN stream_subjects ss ON ss.stream_id = e.stream_id AND ss.subject_id = $2
      WHERE s.id = $1
        AND e.id = $3
        AND ss.id IS NOT NULL
        AND (e.subject_id IS NULL OR e.subject_id = $2)
    `, [student_id, subject_id, exam_id]);

    if (validRes.rows.length === 0) {
      return res.status(400).json({ error: 'Student, subject and exam must belong to the same stream and subject' });
    }

    const result = await pool.query(
      `INSERT INTO scores (student_id, subject_id, exam_id, marks)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [student_id, subject_id, exam_id, marks]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Score already recorded for this student/subject/exam' });
    res.status(500).json({ error: err.message });
  }
});

// PUT update a score
router.put('/:id', async (req, res) => {
  const { marks } = req.body;
  try {
    const scoreRes = await pool.query(`
      SELECT e.exam_type
      FROM scores sc
      JOIN exams e ON e.id = sc.exam_id
      WHERE sc.id = $1
    `, [req.params.id]);
    if (scoreRes.rows.length === 0) return res.status(404).json({ error: 'Score not found' });

    const maxMarks = maxMarksForExamType(scoreRes.rows[0].exam_type);
    if (marks < 0 || marks > maxMarks) {
      return res.status(400).json({ error: `Marks must be between 0 and ${maxMarks}` });
    }

    const result = await pool.query(
      'UPDATE scores SET marks=$1 WHERE id=$2 RETURNING *',
      [marks, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Score not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a score
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM scores WHERE id=$1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Score not found' });
    res.json({ message: 'Score deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
