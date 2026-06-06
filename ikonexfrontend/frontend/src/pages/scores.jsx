import { useCallback, useEffect, useMemo, useState } from 'react';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { exportTablePdf } from '../utils/pdfExport';

function getScoreValue(score, field) {
  if (field === 'student_name') return `${score.first_name || ''} ${score.last_name || ''}`.trim();
  return score[field] ?? '';
}

function matchesSearch(score, search) {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  const fields = ['admission_number', 'student_name', 'marks'];
  return fields.some(item => String(getScoreValue(score, item)).toLowerCase().includes(term));
}

export default function Scores() {
  const [exams, setExams] = useState([]);
  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('enter');
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedStream, setSelectedStream] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [marksInput, setMarksInput] = useState({});
  const [saving, setSaving] = useState(false);
  const [editingScores, setEditingScores] = useState({});
  const [scoreSearch, setScoreSearch] = useState('');
  const [minMark, setMinMark] = useState('');
  const [maxMark, setMaxMark] = useState('');

  useEffect(() => {
    Promise.all([API.get('/exams'), API.get('/streams'), API.get('/subjects')])
      .then(([e, st, sub]) => { setExams(e.data); setStreams(st.data); setSubjects(sub.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedStream) {
      API.get('/subjects').then(r => {
        setStudents([]);
        setSubjects(r.data);
      });
      return;
    }

    Promise.all([
      API.get(`/students/stream/${selectedStream}`),
      API.get(`/subjects/stream/${selectedStream}`),
    ]).then(([studentsRes, subjectsRes]) => {
      setStudents(studentsRes.data);
      setSubjects(subjectsRes.data);
    });
  }, [selectedStream]);

  const selectedExamRecord = exams.find(e => String(e.id) === selectedExam);
  const selectedStreamRecord = streams.find(s => String(s.id) === selectedStream);
  const selectedSubjectRecord = subjects.find(s => String(s.id) === selectedSubject);
  const selectedExamMaxMarks = selectedExamRecord?.exam_type === 'cat' ? 30 : 70;
  const availableSubjects = selectedExamRecord?.subject_id
    ? subjects.filter(s => String(s.id) === String(selectedExamRecord.subject_id))
    : subjects;

  const filteredScores = useMemo(() => {
    const min = minMark === '' ? null : Number(minMark);
    const max = maxMark === '' ? null : Number(maxMark);

    return scores
      .filter(score => matchesSearch(score, scoreSearch))
      .filter(score => {
        const marks = Number(score.marks);
        if (min !== null && Number.isFinite(min) && marks < min) return false;
        if (max !== null && Number.isFinite(max) && marks > max) return false;
        return true;
      })
      .sort((a, b) => Number(a.subject_position || 0) - Number(b.subject_position || 0));
  }, [scores, scoreSearch, minMark, maxMark]);

  const reloadScores = useCallback(async () => {
    if (!selectedExam || !selectedSubject) return;
    const r = await API.get(`/scores/exam/${selectedExam}/subject/${selectedSubject}`);
    const existing = {};
    const editing = {};
    r.data.forEach(sc => {
      existing[sc.student_id] = { marks: sc.marks, scoreId: sc.id };
      editing[sc.id] = sc.marks;
    });
    setMarksInput(existing);
    setEditingScores(editing);
    setScores(r.data);
  }, [selectedExam, selectedSubject]);

  useEffect(() => {
    if (!selectedExam || !selectedSubject) {
      Promise.resolve().then(() => {
        setScores([]);
        setMarksInput({});
        setEditingScores({});
      });
      return;
    }

    Promise.resolve().then(reloadScores);
  }, [selectedExam, selectedSubject, reloadScores]);

  const handleExamChange = examId => {
    const exam = exams.find(e => String(e.id) === examId);
    setSelectedExam(examId);
    setSelectedSubject(exam?.subject_id ? String(exam.subject_id) : '');
  };

  const handleSaveAll = async () => {
    if (!selectedExam || !selectedSubject) return toast.error('Select an exam and subject first');
    if (students.length === 0) return toast.error('No students in selected stream');
    setSaving(true);
    let saved = 0;
    let updated = 0;
    let skipped = 0;

    for (const student of students) {
      const entry = marksInput[student.id];
      if (entry === undefined || entry.marks === '' || entry.marks === null) { skipped++; continue; }
      const marks = parseFloat(entry.marks);
      if (Number.isNaN(marks) || marks < 0 || marks > selectedExamMaxMarks) { skipped++; continue; }

      try {
        if (entry.scoreId) {
          await API.put(`/scores/${entry.scoreId}`, { marks });
          updated++;
        } else {
          await API.post('/scores', { student_id: student.id, subject_id: selectedSubject, exam_id: selectedExam, marks });
          saved++;
        }
      } catch {
        skipped++;
      }
    }

    setSaving(false);
    toast.success(`Saved: ${saved} new, ${updated} updated, ${skipped} skipped`);
    reloadScores();
  };

  const handleUpdateScore = async score => {
    const marks = parseFloat(editingScores[score.id]);
    if (Number.isNaN(marks) || marks < 0 || marks > selectedExamMaxMarks) {
      return toast.error(`Marks must be between 0 and ${selectedExamMaxMarks}`);
    }

    try {
      await API.put(`/scores/${score.id}`, { marks });
      toast.success('Score updated');
      reloadScores();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update score');
    }
  };

  const handleDeleteScore = async score => {
    if (!confirm(`Delete score for ${score.first_name} ${score.last_name}?`)) return;
    try {
      await API.delete(`/scores/${score.id}`);
      toast.success('Score deleted');
      reloadScores();
    } catch {
      toast.error('Delete failed');
    }
  };

  const getMarksReportTitle = () => {
    const examName = selectedExamRecord?.name || 'Selected exam';
    const streamName = selectedStreamRecord?.name || 'selected class';
    return `${examName} marks for ${streamName}`;
  };

  const getMarksReportContext = () => {
    const examName = selectedExamRecord?.name || 'Selected exam';
    const streamName = selectedStreamRecord?.name || 'Selected class';
    const subjectName = selectedSubjectRecord?.name || 'Selected subject';
    const term = selectedExamRecord ? `${selectedExamRecord.term} ${selectedExamRecord.year}` : '';
    return [examName, subjectName, streamName, term].filter(Boolean).join(' - ');
  };

  const exportEnterMarks = () => {
    const ok = exportTablePdf({
      title: getMarksReportTitle(),
      context: getMarksReportContext(),
      rows: students,
      columns: [
        { label: 'Adm No', value: 'admission_number' },
        { label: 'Student Name', value: student => `${student.first_name} ${student.last_name}` },
        { label: `Marks (0-${selectedExamMaxMarks})`, value: student => marksInput[student.id]?.marks ?? '' },
        { label: 'Status', value: student => marksInput[student.id]?.scoreId ? 'Saved' : 'Not entered' },
      ],
    });

    if (!ok) toast.error('No marks to export');
  };

  const exportSavedScores = () => {
    const ok = exportTablePdf({
      title: getMarksReportTitle(),
      context: getMarksReportContext(),
      rows: filteredScores,
      columns: [
        { label: 'Position', value: 'subject_position', className: score => Number(score.subject_position) <= 3 ? `position-${score.subject_position}` : '' },
        { label: 'Adm No', value: 'admission_number' },
        { label: 'Student', value: score => `${score.first_name} ${score.last_name}` },
        { label: `Marks (0-${selectedExamMaxMarks})`, value: 'marks' },
      ],
    });

    if (!ok) toast.error('No scores to export');
  };

  const clearSessionFilters = () => {
    setSelectedStream('');
    setSelectedExam('');
    setSelectedSubject('');
  };

  const clearScoreFilters = () => {
    setScoreSearch('');
    setMinMark('');
    setMaxMark('');
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Scores</h1>
          <p>Record, view and manage student examination scores</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className={`btn ${activePage === 'enter' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActivePage('enter')}>Enter Scores</button>
          <button className={`btn ${activePage === 'view' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActivePage('view')}>View Scores</button>
        </div>
      </div>

      <div className="page-tools">
        <div className="tool-field">
          <label>Class</label>
          <select value={selectedStream} onChange={e => { setSelectedStream(e.target.value); setSelectedSubject(''); }}>
            <option value="">Select class</option>
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="tool-field tool-field-wide">
          <label>Exam</label>
          <select value={selectedExam} onChange={e => handleExamChange(e.target.value)}>
            <option value="">Select exam</option>
            {exams.filter(e => !selectedStream || String(e.stream_id) === selectedStream).map(e => (
              <option key={e.id} value={e.id}>
                {e.name} - {e.subject_name || 'No subject'} ({e.term} {e.year})
              </option>
            ))}
          </select>
        </div>
        <div className="tool-field">
          <label>Subject</label>
          <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
            <option value="">Select subject</option>
            {availableSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary tool-action" onClick={clearSessionFilters}>Clear Filters</button>
      </div>

      {activePage === 'enter' && selectedExam && selectedSubject && selectedStream && (
        <div className="card">
          <div className="table-header">
            <h3 style={{ color: '#064e3b' }}>Enter Marks (out of {selectedExamMaxMarks})</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={exportEnterMarks}>Export PDF</button>
              <button className="btn btn-primary" onClick={handleSaveAll} disabled={saving}>
                {saving ? 'Saving...' : 'Save All Scores'}
              </button>
            </div>
          </div>
          {students.length === 0 ? (
            <div className="empty-state">
              <div className="icon">ST</div>
              <h3>No students in this class</h3>
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Adm No</th><th>Student Name</th><th>Marks (0-{selectedExamMaxMarks})</th><th>Status</th></tr>
              </thead>
              <tbody>
                {students.map(student => {
                  const entry = marksInput[student.id];
                  const hasScore = entry?.scoreId;
                  return (
                    <tr key={student.id}>
                      <td><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{student.admission_number}</code></td>
                      <td><strong>{student.first_name} {student.last_name}</strong></td>
                      <td>
                        <input
                          type="number" min="0" max={selectedExamMaxMarks} step="0.5"
                          style={{ width: '100px', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '14px' }}
                          value={entry?.marks ?? ''}
                          onChange={e => setMarksInput(prev => ({
                            ...prev,
                            [student.id]: { marks: e.target.value, scoreId: prev[student.id]?.scoreId }
                          }))}
                          placeholder={`0-${selectedExamMaxMarks}`}
                        />
                      </td>
                      <td>
                        {hasScore
                          ? <span className="badge badge-green">Saved</span>
                          : <span className="badge badge-gray">Not entered</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activePage === 'view' && selectedExam && selectedSubject && selectedStream && (
        <>
          <div className="page-tools">
            <div className="tool-field tool-field-wide">
              <label>Search</label>
              <input value={scoreSearch} onChange={e => setScoreSearch(e.target.value)} placeholder="Type to search" />
            </div>
            <div className="tool-field tool-field-small">
              <label>Min Mark</label>
              <input type="number" min="0" max={selectedExamMaxMarks} value={minMark} onChange={e => setMinMark(e.target.value)} placeholder="Any" />
            </div>
            <div className="tool-field tool-field-small">
              <label>Max Mark</label>
              <input type="number" min="0" max={selectedExamMaxMarks} value={maxMark} onChange={e => setMaxMark(e.target.value)} placeholder="Any" />
            </div>
            <button className="btn btn-secondary tool-action" onClick={clearScoreFilters}>Clear Filters</button>
          </div>

          <div className="card">
            <div className="table-header">
              <h3 style={{ color: '#064e3b' }}>View Scores - {filteredScores.length} records</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={exportSavedScores}>Export PDF</button>
                <button className="btn btn-secondary" onClick={reloadScores}>Refresh</button>
              </div>
            </div>
            {filteredScores.length === 0 ? (
              <div className="empty-state">
                <div className="icon">SC</div>
                <h3>No scores match this view</h3>
              </div>
            ) : (
              <table>
                <thead>
                  <tr><th>Position</th><th>Adm No</th><th>Student</th><th>Marks</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filteredScores.map(sc => (
                    <tr key={sc.id}>
                      <td className={Number(sc.subject_position) <= 3 ? `position-${sc.subject_position}` : ''}>{sc.subject_position}</td>
                      <td><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{sc.admission_number}</code></td>
                      <td><strong>{sc.first_name} {sc.last_name}</strong></td>
                      <td>
                        <input
                          type="number" min="0" max={selectedExamMaxMarks} step="0.5"
                          style={{ width: '92px', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '14px' }}
                          value={editingScores[sc.id] ?? ''}
                          onChange={e => setEditingScores(prev => ({ ...prev, [sc.id]: e.target.value }))}
                        />
                      </td>
                      <td style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleUpdateScore(sc)}>Update</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteScore(sc)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {(!selectedExam || !selectedSubject || !selectedStream) && (
        <div className="card">
          <div className="empty-state">
            <div className="icon">SC</div>
            <h3>Select a class, exam and subject above</h3>
            <p>{activePage === 'enter' ? 'Then enter marks for each student' : 'Then view, search and manage saved scores'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
