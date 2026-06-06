const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db');

const router = express.Router();

async function getGrade(marks) {
  const lookupMark = Math.floor(Number(marks) || 0);
  const result = await pool.query(
    'SELECT grade, points, remarks FROM grade_config WHERE $1 BETWEEN min_mark AND max_mark LIMIT 1',
    [lookupMark]
  );
  return result.rows[0] || { grade: 'N/A', points: 0, remarks: '-' };
}

async function getStudent(studentId) {
  const result = await pool.query(`
    SELECT s.*, st.name AS stream_name
    FROM students s
    LEFT JOIN streams st ON st.id = s.stream_id
    WHERE s.id = $1
  `, [studentId]);
  return result.rows[0];
}

async function getStudentTermSubjects(studentId, term, year) {
  const result = await pool.query(`
    SELECT
      sub.id AS subject_id,
      sub.name AS subject_name,
      sub.code,
      COALESCE(SUM(CASE WHEN e.exam_type = 'cat' THEN sc.marks ELSE 0 END), 0) AS cat_total,
      COALESCE(MAX(CASE WHEN e.exam_type = 'exam' THEN sc.marks ELSE NULL END), 0) AS main_exam
    FROM scores sc
    JOIN exams e ON e.id = sc.exam_id
    JOIN subjects sub ON sub.id = sc.subject_id
    WHERE sc.student_id = $1
      AND e.term = $2
      AND e.year = $3
    GROUP BY sub.id, sub.name, sub.code
    ORDER BY sub.name ASC
  `, [studentId, term, year]);

  const subjects = [];
  for (const row of result.rows) {
    const catAverage = Number((parseFloat(row.cat_total || 0) / 2).toFixed(2));
    const mainExam = Number(parseFloat(row.main_exam || 0).toFixed(2));
    const total = Number((catAverage + mainExam).toFixed(2));
    const grade = await getGrade(total);

    subjects.push({
      subject_id: row.subject_id,
      subject_name: row.subject_name,
      code: row.code,
      cat_average: catAverage.toFixed(2),
      main_exam: mainExam.toFixed(2),
      total: total.toFixed(2),
      grade: grade.grade,
      points: grade.points,
      remarks: grade.remarks,
    });
  }

  return subjects;
}

async function getStreamTermRanking(streamId, term, year) {
  const result = await pool.query(`
    SELECT
      s.id,
      s.first_name,
      s.last_name,
      s.admission_number,
      COALESCE(SUM(subject_totals.subject_total), 0) AS total,
      COALESCE(ROUND(AVG(subject_totals.subject_total), 2), 0) AS average
    FROM students s
    LEFT JOIN (
      SELECT
        sc.student_id,
        sc.subject_id,
        COALESCE(SUM(CASE WHEN e.exam_type = 'cat' THEN sc.marks ELSE 0 END), 0) / 2
          + COALESCE(MAX(CASE WHEN e.exam_type = 'exam' THEN sc.marks ELSE NULL END), 0) AS subject_total
      FROM scores sc
      JOIN exams e ON e.id = sc.exam_id
      WHERE e.term = $2
        AND e.year = $3
      GROUP BY sc.student_id, sc.subject_id
    ) subject_totals ON subject_totals.student_id = s.id
    WHERE s.stream_id = $1
    GROUP BY s.id, s.first_name, s.last_name, s.admission_number
    ORDER BY total DESC, average DESC, s.last_name ASC, s.first_name ASC
  `, [streamId, term, year]);

  const rows = [];
  for (const row of result.rows) {
    const total = Number(parseFloat(row.total || 0).toFixed(2));
    const average = Number(parseFloat(row.average || 0).toFixed(2));
    const grade = await getGrade(average);
    rows.push({
      ...row,
      total: total.toFixed(2),
      average: average.toFixed(2),
      grade: grade.grade,
      points: grade.points,
      remarks: grade.remarks,
    });
  }

  rows.forEach((row, index) => {
    row.position = index + 1;
  });

  return rows;
}

async function buildStudentReport(studentId, term, year) {
  if (!term || !year) {
    const error = new Error('Term and year are required');
    error.statusCode = 400;
    throw error;
  }

  const student = await getStudent(studentId);
  if (!student) {
    const error = new Error('Student not found');
    error.statusCode = 404;
    throw error;
  }

  const subjects = await getStudentTermSubjects(studentId, term, year);
  const total = Number(subjects.reduce((sum, subject) => sum + parseFloat(subject.total || 0), 0).toFixed(2));
  const average = subjects.length > 0 ? Number((total / subjects.length).toFixed(2)) : 0;
  const grade = await getGrade(average);
  const ranking = student.stream_id ? await getStreamTermRanking(student.stream_id, term, year) : [];
  const rankRow = ranking.find(row => String(row.id) === String(studentId));

  return {
    student,
    stream_name: student.stream_name,
    term,
    year,
    subjects,
    total: total.toFixed(2),
    average: average.toFixed(2),
    grade: grade.grade,
    points: grade.points,
    remarks: grade.remarks,
    position: rankRow?.position || null,
    class_size: ranking.length,
  };
}

const COLORS = {
  green: '#064e3b',
  greenSoft: '#d1fae5',
  border: '#e5e7eb',
  text: '#111827',
  muted: '#6b7280',
  panel: '#f8fafc',
  white: '#ffffff',
  blue: '#0f766e',
};

function drawReportHeader(doc, title, subtitle) {
  doc.roundedRect(50, 42, 495, 86, 8).fill(COLORS.green);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(23).text('IKONEX ACADEMY', 70, 66);
  doc.fillColor(COLORS.greenSoft).font('Helvetica-Bold').fontSize(13).text(title, 70, 96);
  if (subtitle) {
    doc.fillColor(COLORS.white).font('Helvetica').fontSize(9).text(subtitle, 390, 70, {
      width: 130,
      align: 'right',
    });
  }
  doc.fillColor(COLORS.text);
  doc.y = 150;
}

function drawMetaCards(doc, cards, y) {
  const gap = 12;
  const width = (495 - gap * 2) / 3;

  cards.forEach((card, index) => {
    const x = 50 + index * (width + gap);
    doc.roundedRect(x, y, width, 58, 7).fillAndStroke(COLORS.panel, COLORS.border);
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7.5).text(card.label.toUpperCase(), x + 10, y + 12, {
      width: width - 20,
    });
    doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(9).text(card.value || '-', x + 10, y + 30, {
      width: width - 20,
    });
  });

  doc.fillColor(COLORS.text);
  return y + 78;
}

function drawDetailGrid(doc, items, y) {
  const gap = 10;
  const width = (495 - gap * 2) / 3;
  let currentY = y;

  items.forEach((item, index) => {
    const column = index % 3;
    if (index > 0 && column === 0) currentY += 52;
    const x = 50 + column * (width + gap);
    doc.roundedRect(x, currentY, width, 42, 6).fillAndStroke(COLORS.white, COLORS.border);
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7).text(item.label.toUpperCase(), x + 9, currentY + 9, {
      width: width - 18,
    });
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(9).text(item.value || '-', x + 9, currentY + 24, {
      width: width - 18,
    });
  });

  doc.fillColor(COLORS.text);
  return currentY + 62;
}

function ensureSpace(doc, height) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function writeStudentReportPdf(doc, report) {
  drawReportHeader(doc, 'Student Report Card', `${report.term} ${report.year}`);
  const generatedAt = new Date().toLocaleString('en-GB');
  const studentName = `${report.student.first_name} ${report.student.last_name}`;

  let y = drawMetaCards(doc, [
    { label: 'Report For', value: studentName },
    { label: 'Date Generated', value: generatedAt },
    { label: 'Generated By', value: 'Current user' },
  ], 148);

  doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(12).text('Student Information', 50, y);
  y += 22;
  y = drawDetailGrid(doc, [
    { label: 'Student', value: studentName },
    { label: 'Admission No', value: report.student.admission_number },
    { label: 'Class', value: report.stream_name || 'N/A' },
    { label: 'Term', value: `${report.term} ${report.year}` },
    { label: 'Position', value: report.position ? `${report.position} of ${report.class_size}` : '-' },
    { label: 'Average', value: report.average },
  ], y);

  const columns = [
    { label: 'Subject', x: 65, width: 140 },
    { label: 'Code', x: 210, width: 45 },
    { label: 'CAT Avg', x: 260, width: 55 },
    { label: 'Exam', x: 320, width: 50 },
    { label: 'Total', x: 375, width: 50 },
    { label: 'Grade', x: 430, width: 40 },
    { label: 'Remarks', x: 475, width: 60 },
  ];

  doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(12).text('Subject Performance', 50, y);
  y += 22;
  doc.roundedRect(50, y, 495, 34, 6).fill(COLORS.panel);
  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8);
  columns.forEach(column => doc.text(column.label.toUpperCase(), column.x, y + 12, { width: column.width }));
  y += 34;

  doc.font('Helvetica').fontSize(9);
  if (report.subjects.length === 0) {
    doc.fillColor(COLORS.muted).text('No marks have been entered for this student in the selected term.', 65, y + 14);
    y += 44;
  } else {
    for (const [index, subject] of report.subjects.entries()) {
      doc.y = y;
      ensureSpace(doc, 32);
      y = doc.y;
      if (index % 2 === 1) doc.rect(50, y, 495, 30).fill('#fbfcfe');
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(8.5);
      doc.text(subject.subject_name, columns[0].x, y + 10, { width: columns[0].width });
      doc.text(subject.code || '-', columns[1].x, y + 10, { width: columns[1].width });
      doc.text(subject.cat_average, columns[2].x, y + 10, { width: columns[2].width });
      doc.text(subject.main_exam, columns[3].x, y + 10, { width: columns[3].width });
      doc.font('Helvetica-Bold').text(subject.total, columns[4].x, y + 10, { width: columns[4].width });
      doc.fillColor(COLORS.blue).text(subject.grade, columns[5].x, y + 10, { width: columns[5].width });
      doc.fillColor(COLORS.text).font('Helvetica').text(subject.remarks || '-', columns[6].x, y + 10, { width: columns[6].width });
      doc.moveTo(50, y + 30).lineTo(545, y + 30).strokeColor(COLORS.border).stroke();
      y += 30;
    }
  }

  y += 18;
  doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(12).text('Summary', 50, y);
  y += 20;
  drawDetailGrid(doc, [
    { label: 'Total Marks', value: report.total },
    { label: 'Average', value: report.average },
    { label: 'Overall Grade', value: `${report.grade} (${report.remarks})` },
    { label: 'Class Position', value: report.position ? `${report.position} of ${report.class_size}` : '-' },
    { label: 'Subjects Done', value: String(report.subjects.length) },
    { label: 'Class Size', value: String(report.class_size || '-') },
  ], y);

  const signatureY = 760;
  doc.fillColor(COLORS.text).font('Helvetica').fontSize(9);
  doc.text('Class Teacher:', 50, signatureY);
  doc.moveTo(120, signatureY + 11).lineTo(260, signatureY + 11).strokeColor(COLORS.muted).stroke();
  doc.text('Principal:', 320, signatureY);
  doc.moveTo(370, signatureY + 11).lineTo(510, signatureY + 11).strokeColor(COLORS.muted).stroke();
}

function writeClassReportPdf(doc, streamName, term, year, rows) {
  drawReportHeader(doc, 'Class Performance Report', `${streamName || 'Selected Class'} | ${term} ${year}`);
  let y = drawMetaCards(doc, [
    { label: 'Report For', value: `Class performance - ${streamName || 'Selected Class'}` },
    { label: 'Date Generated', value: new Date().toLocaleString('en-GB') },
    { label: 'Generated By', value: 'Current user' },
  ], 148);

  const columns = [
    { label: 'Pos', x: 65, width: 35 },
    { label: 'Adm No', x: 105, width: 90 },
    { label: 'Student', x: 205, width: 170 },
    { label: 'Total', x: 385, width: 60 },
    { label: 'Average', x: 450, width: 60 },
    { label: 'Grade', x: 515, width: 30 },
  ];

  doc.roundedRect(50, y, 495, 34, 6).fill(COLORS.panel);
  doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica-Bold');
  columns.forEach(column => doc.text(column.label.toUpperCase(), column.x, y + 12, { width: column.width }));
  y += 34;

  doc.font('Helvetica').fontSize(9);
  for (const [index, row] of rows.entries()) {
    doc.y = y;
    ensureSpace(doc, 30);
    y = doc.y;
    if (index % 2 === 1) doc.rect(50, y, 495, 28).fill('#fbfcfe');
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(8.5);
    doc.text(String(row.position), columns[0].x, y + 9, { width: columns[0].width });
    doc.text(row.admission_number || '-', columns[1].x, y + 9, { width: columns[1].width });
    doc.text(`${row.first_name} ${row.last_name}`, columns[2].x, y + 9, { width: columns[2].width });
    doc.text(row.total, columns[3].x, y + 9, { width: columns[3].width });
    doc.text(row.average, columns[4].x, y + 9, { width: columns[4].width });
    doc.fillColor(COLORS.blue).font('Helvetica-Bold').text(row.grade, columns[5].x, y + 9, { width: columns[5].width });
    doc.moveTo(50, y + 28).lineTo(545, y + 28).strokeColor(COLORS.border).stroke();
    y += 28;
  }
}

router.get('/student/:studentId/term', async (req, res) => {
  try {
    const report = await buildStudentReport(req.params.studentId, req.query.term, req.query.year);
    res.json(report);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/student/:studentId/term/pdf', async (req, res) => {
  try {
    const report = await buildStudentReport(req.params.studentId, req.query.term, req.query.year);
    const filename = `report_${report.student.admission_number}_${report.term}_${report.year}.pdf`;
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\s+/g, '_')}"`);
    doc.pipe(res);
    writeStudentReportPdf(doc, report);
    doc.end();
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/class/term/pdf', async (req, res) => {
  try {
    const { streamId, term, year } = req.query;
    if (!streamId || !term || !year) {
      return res.status(400).json({ error: 'streamId, term and year are required' });
    }

    const streamRes = await pool.query('SELECT name FROM streams WHERE id = $1', [streamId]);
    if (streamRes.rows.length === 0) return res.status(404).json({ error: 'Stream not found' });

    const rows = await getStreamTermRanking(streamId, term, year);
    const filename = `class_report_${streamRes.rows[0].name}_${term}_${year}.pdf`;
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\s+/g, '_')}"`);
    doc.pipe(res);
    writeClassReportPdf(doc, streamRes.rows[0].name, term, year, rows);
    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
