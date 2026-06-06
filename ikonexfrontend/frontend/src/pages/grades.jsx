import { useCallback, useEffect, useMemo, useState } from 'react';
import API from '../api/axios';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { exportTablePdf } from '../utils/pdfExport';

const EMPTY = { min_mark: '', max_mark: '', grade: '', points: '', remarks: '' };

function getGradeForAverage(grades, average) {
  const mark = Math.floor(Number(average) || 0);
  const match = grades.find(grade => mark >= Number(grade.min_mark) && mark <= Number(grade.max_mark));
  return match?.grade || 'N/A';
}

export default function Grades() {
  const [grades, setGrades] = useState([]);
  const [streams, setStreams] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [activePage, setActivePage] = useState('results');
  const [selectedStream, setSelectedStream] = useState('');
  const [resultSearch, setResultSearch] = useState('');

  const load = () => API.get('/grades')
    .then(r => setGrades(r.data))
    .finally(() => setLoading(false));

  const loadResults = useCallback(async (streamId = selectedStream) => {
    setLoadingResults(true);
    try {
      const query = streamId ? `?stream_id=${streamId}` : '';
      const r = await API.get(`/scores/results${query}`);
      setResults(r.data);
    } catch {
      toast.error('Failed to load exam scores');
    } finally {
      setLoadingResults(false);
    }
  }, [selectedStream]);

  useEffect(() => {
    Promise.all([API.get('/grades'), API.get('/streams')])
      .then(([g, st]) => {
        setGrades(g.data);
        setStreams(st.data);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    Promise.resolve().then(() => loadResults(selectedStream));
  }, [selectedStream, loading, loadResults]);

  const filteredResults = useMemo(() => {
    const grouped = new Map();

    results.forEach(result => {
      const key = `${result.stream_id}-${result.student_id}-${result.term}-${result.year}`;
      const current = grouped.get(key) || {
        id: key,
        student_id: result.student_id,
        stream_name: result.stream_name,
        admission_number: result.admission_number,
        first_name: result.first_name,
        last_name: result.last_name,
        term: result.term,
        year: result.year,
        subjects: [],
      };

      current.subjects.push({
        subject_name: result.subject_name || '-',
        cat_average: result.cat_average,
        main_exam: result.main_exam,
        total: result.total,
        grade: result.grade,
      });
      grouped.set(key, current);
    });

    return Array.from(grouped.values())
      .map(result => {
        const total = result.subjects.reduce((sum, subject) => sum + Number(subject.total || 0), 0);
        const average = result.subjects.length > 0 ? total / result.subjects.length : 0;
        return {
          ...result,
          total: total.toFixed(2),
          average: average.toFixed(2),
          final_grade: getGradeForAverage(grades, average),
        };
      })
      .filter(result => !resultSearch.trim()
        || String(result.admission_number || '').toLowerCase().includes(resultSearch.trim().toLowerCase()))
      .sort((a, b) => Number(b.average) - Number(a.average) || Number(b.total) - Number(a.total))
      .map((result, index) => ({ ...result, display_position: index + 1 }));
  }, [results, resultSearch, grades]);

  const selectedStreamRecord = streams.find(stream => String(stream.id) === selectedStream);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setShowModal(true);
  };

  const openEdit = grade => {
    setEditing(grade);
    setForm({
      min_mark: grade.min_mark,
      max_mark: grade.max_mark,
      grade: grade.grade,
      points: grade.points,
      remarks: grade.remarks || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      if (editing) {
        await API.put(`/grades/${editing.id}`, form);
        toast.success('Grade scale updated');
      } else {
        await API.post('/grades', form);
        toast.success('Grade scale added');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save grade scale');
    }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this grade scale?')) return;
    try {
      await API.delete(`/grades/${id}`);
      toast.success('Grade scale deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const getGradeClass = grade => {
    if (!grade) return '';
    if (grade.startsWith('A')) return 'grade-A';
    if (grade.startsWith('B')) return 'grade-B';
    if (grade.startsWith('C')) return 'grade-C';
    if (grade.startsWith('D')) return 'grade-D';
    return 'grade-E';
  };

  const exportGradeResults = () => {
    const streamName = selectedStreamRecord?.name || 'All classes';
    const ok = exportTablePdf({
      title: `Overall grades for ${streamName}`,
      context: `Exam scores and grades - ${streamName}`,
      rows: filteredResults,
      columns: [
        { label: 'Position', value: 'display_position', className: result => Number(result.display_position) <= 3 ? `position-${result.display_position}` : '' },
        { label: 'Class', value: 'stream_name' },
        { label: 'Adm No', value: 'admission_number' },
        { label: 'Student Name', value: result => `${result.first_name} ${result.last_name}` },
        { label: 'Term', value: result => `${result.term} ${result.year}` },
        { label: 'Subjects', value: result => result.subjects.map(subject => `${subject.subject_name}: ${subject.total}`).join(', ') },
        { label: 'Total', value: 'total' },
        { label: 'Average', value: 'average' },
        { label: 'Final Grade', value: 'final_grade', className: result => getGradeClass(result.final_grade) },
      ],
    });

    if (!ok) toast.error('No grade results to export');
  };

  const exportGradeScale = () => {
    const ok = exportTablePdf({
      title: 'Grading scale',
      context: 'Configured grade bands',
      rows: grades,
      columns: [
        { label: 'Grade', value: 'grade' },
        { label: 'Range', value: grade => `${grade.min_mark} - ${grade.max_mark}` },
        { label: 'Points', value: 'points' },
        { label: 'Remarks', value: 'remarks' },
      ],
    });

    if (!ok) toast.error('No grade bands to export');
  };

  const clearClassFilter = () => {
    setSelectedStream('');
  };

  const clearResultFilters = () => {
    setResultSearch('');
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Grades</h1>
          <p>{activePage === 'results' ? 'View student exam scores, final percentages and grades' : 'Configure the grading scale used for averages and report cards'}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {activePage === 'results' ? (
            <button className="btn btn-primary" onClick={() => setActivePage('scale')}>View Grading Scale</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setActivePage('results')}>View Exam Scores</button>
              <button className="btn btn-primary" onClick={openCreate}>+ New Grade Band</button>
            </>
          )}
        </div>
      </div>

      {activePage === 'results' && (
        <>
          <div className="page-tools">
            <div className="tool-field tool-field-wide">
              <label>Search by Admission Number</label>
              <input value={resultSearch} onChange={e => setResultSearch(e.target.value)} placeholder="Enter admission number" />
            </div>
            <div className="tool-field">
              <label>Class Stream</label>
              <select value={selectedStream} onChange={e => setSelectedStream(e.target.value)}>
                <option value="">All classes</option>
                {streams.map(stream => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary tool-action" onClick={() => loadResults()} disabled={loadingResults}>
              {loadingResults ? 'Loading...' : 'Refresh Scores'}
            </button>
            <button className="btn btn-secondary tool-action" onClick={clearClassFilter}>Clear Filters</button>
          </div>

          {results.length > 0 && (
            <>
              <div className="page-tools">
                <small style={{ color: '#64748b', alignSelf: 'center' }}>Students are arranged from best performed to worst performed by term average.</small>
                <button className="btn btn-secondary tool-action" onClick={clearResultFilters}>Clear Filters</button>
              </div>

              <div className="card">
                <div className="table-header">
                  <h3 style={{ color: '#064e3b' }}>Term Performance - {filteredResults.length} student(s)</h3>
                  <button className="btn btn-secondary" onClick={exportGradeResults}>Export PDF</button>
                </div>
                {filteredResults.length === 0 ? (
                  <div className="empty-state">
                    <div className="icon">GR</div>
                    <h3>No students match this search</h3>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Position</th>
                        <th>Class</th>
                        <th>Adm No</th>
                        <th>Student Name</th>
                        <th>Term</th>
                        <th>Subject Scores</th>
                        <th>Total</th>
                        <th>Average</th>
                        <th>Final Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map(result => (
                        <tr key={result.id}>
                          <td className={Number(result.display_position) <= 3 ? `position-${result.display_position}` : ''}>{result.display_position}</td>
                          <td>{result.stream_name || '-'}</td>
                          <td><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{result.admission_number}</code></td>
                          <td><strong>{result.first_name} {result.last_name}</strong></td>
                          <td>{result.term} {result.year}</td>
                          <td>
                            <div style={{ display: 'grid', gap: '4px', minWidth: '220px' }}>
                              {result.subjects.map(subject => (
                                <span key={subject.subject_name}>
                                  <strong>{subject.subject_name}</strong>: {subject.total} <span className={getGradeClass(subject.grade)}>({subject.grade})</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td><strong>{result.total}</strong></td>
                          <td><strong>{result.average}</strong></td>
                          <td className={getGradeClass(result.final_grade)}>{result.final_grade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {results.length === 0 && !loadingResults && (
            <div className="card">
              <div className="empty-state">
                <div className="icon">GR</div>
                <h3>No exam scores found</h3>
                <p>Scores will appear here after marks are entered</p>
              </div>
            </div>
          )}
        </>
      )}

      {activePage === 'scale' && (
        <div className="card">
          <div className="table-header">
            <h3 style={{ color: '#064e3b' }}>Grading Scale</h3>
            <button className="btn btn-secondary" onClick={exportGradeScale}>Export PDF</button>
          </div>
          {grades.length === 0 ? (
            <div className="empty-state">
              <div className="icon">GR</div>
              <h3>No grade bands configured</h3>
              <p>Add grade bands before processing results</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>Range</th>
                  <th>Points</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {grades.map(g => (
                  <tr key={g.id}>
                    <td><span className="badge badge-blue">{g.grade}</span></td>
                    <td>{g.min_mark} - {g.max_mark}</td>
                    <td>{g.points}</td>
                    <td>{g.remarks || '-'}</td>
                    <td style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(g)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(g.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Grade Band' : 'New Grade Band'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Minimum Mark</label>
                <input type="number" min="0" max="100" step="0.01" value={form.min_mark} onChange={e => setForm({ ...form, min_mark: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Maximum Mark</label>
                <input type="number" min="0" max="100" step="0.01" value={form.max_mark} onChange={e => setForm({ ...form, max_mark: e.target.value })} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Grade</label>
                <input value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} placeholder="A" required />
              </div>
              <div className="form-group">
                <label>Points</label>
                <input type="number" min="0" step="0.1" value={form.points} onChange={e => setForm({ ...form, points: e.target.value })} required />
              </div>
            </div>
            <div className="form-group">
              <label>Remarks</label>
              <input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} placeholder="Excellent" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
