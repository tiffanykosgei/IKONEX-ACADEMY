import { useEffect, useMemo, useState } from 'react';
import API from '../api/axios';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function Reports() {
  const [students, setStudents] = useState([]);
  const [streams, setStreams] = useState([]);
  const [terms, setTerms] = useState([]);
  const [selectedStream, setSelectedStream] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [studentReport, setStudentReport] = useState(null);

  useEffect(() => {
    Promise.all([API.get('/students'), API.get('/streams'), API.get('/exams')])
      .then(([studentsRes, streamsRes, examsRes]) => {
        setStudents(studentsRes.data || []);
        setStreams(streamsRes.data || []);

        const distinctTerms = [];
        (examsRes.data || []).forEach(exam => {
          if (!exam.term || !exam.year) return;
          const key = `${exam.term}-${exam.year}`;
          if (!distinctTerms.some(item => item.term === exam.term && item.year === exam.year)) {
            distinctTerms.push({ term: exam.term, year: exam.year, key });
          }
        });
        distinctTerms.sort((a, b) => b.year - a.year || a.term.localeCompare(b.term));
        setTerms(distinctTerms);
      })
      .catch(() => toast.error('Failed to load reports information'))
      .finally(() => setLoading(false));
  }, []);

  const filteredStudents = useMemo(() => {
    return students
      .filter(student => {
        if (selectedStream && String(student.stream_id) !== String(selectedStream)) return false;
        const query = search.trim().toLowerCase();
        if (!query) return true;

        return (`${student.first_name} ${student.last_name}`.toLowerCase().includes(query)
          || student.admission_number?.toLowerCase().includes(query)
          || student.stream_name?.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const lastName = String(a.last_name || '').localeCompare(String(b.last_name || ''), undefined, { numeric: true });
        if (lastName !== 0) return lastName;
        return String(a.first_name || '').localeCompare(String(b.first_name || ''), undefined, { numeric: true });
      });
  }, [students, selectedStream, search]);

  const selectedTermLabel = selectedTerm && selectedYear ? `${selectedTerm} ${selectedYear}` : '';

  const handleTermChange = value => {
    if (!value) {
      setSelectedTerm('');
      setSelectedYear('');
      return;
    }

    const [term, year] = value.split('::');
    setSelectedTerm(term);
    setSelectedYear(year);
  };

  const loadStudentReport = async studentId => {
    if (!selectedTerm || !selectedYear) return toast.error('Select a term and year first');
    setLoadingReport(true);
    try {
      const response = await API.get(`/reports/student/${studentId}/term`, {
        params: { term: selectedTerm, year: selectedYear }
      });
      setStudentReport(response.data);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load student report');
    } finally {
      setLoadingReport(false);
    }
  };

  const downloadStudentReport = studentId => {
    if (!selectedTerm || !selectedYear) return toast.error('Select a term and year first');
    window.open(`${BASE_URL}/reports/student/${studentId}/term/pdf?term=${encodeURIComponent(selectedTerm)}&year=${encodeURIComponent(selectedYear)}`, '_blank');
  };

  const downloadClassReport = () => {
    if (!selectedStream) return toast.error('Select a class stream first');
    if (!selectedTerm || !selectedYear) return toast.error('Select a term and year first');
    window.open(`${BASE_URL}/reports/class/term/pdf?streamId=${selectedStream}&term=${encodeURIComponent(selectedTerm)}&year=${encodeURIComponent(selectedYear)}`, '_blank');
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Search students, filter by term, and generate student report cards or class performance PDFs.</p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '16px', color: '#064e3b' }}>Report Filters</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 200px', minWidth: '180px' }}>
            <label>Search Student</label>
            <input
              type="text"
              value={search}
              placeholder="Name or admission number"
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px', minWidth: '180px' }}>
            <label>Term</label>
            <select value={selectedTerm && selectedYear ? `${selectedTerm}::${selectedYear}` : ''} onChange={e => handleTermChange(e.target.value)}>
              <option value="">Select term</option>
              {terms.map(item => (
                <option key={item.key} value={`${item.term}::${item.year}`}>{item.term} {item.year}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 180px', minWidth: '180px' }}>
            <label>Class Stream</label>
            <select value={selectedStream} onChange={e => setSelectedStream(e.target.value)}>
              <option value="">All streams</option>
              {streams.map(stream => (
                <option key={stream.id} value={stream.id}>{stream.name}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-success" onClick={downloadClassReport}>
            Generate Class PDF
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-header">
          <h3 style={{ color: '#064e3b' }}>Students {selectedTermLabel ? `- ${selectedTermLabel}` : ''}</h3>
          <small>{filteredStudents.length} student(s) matched</small>
        </div>

        {filteredStudents.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Adm No</th>
                <th>Name</th>
                <th>Class</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(student => (
                <tr key={student.id}>
                  <td><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{student.admission_number}</code></td>
                  <td><strong>{student.first_name} {student.last_name}</strong></td>
                  <td>{student.stream_name || 'N/A'}</td>
                  <td style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => loadStudentReport(student.id)} disabled={loadingReport}>
                      {loadingReport ? 'Loading...' : 'View Report'}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => downloadStudentReport(student.id)}>
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="icon">RC</div>
            <h3>No students found</h3>
            <p>Adjust your search, stream, or term selection to view reports.</p>
          </div>
        )}
      </div>

      {studentReport && (
        <Modal title="Student Report Card" onClose={() => setStudentReport(null)}>
          <div>
            <div className="detail-grid">
              <div className="detail-item"><span>Student</span><strong>{studentReport.student.first_name} {studentReport.student.last_name}</strong></div>
              <div className="detail-item"><span>Admission No</span><strong>{studentReport.student.admission_number}</strong></div>
              <div className="detail-item"><span>Class</span><strong>{studentReport.stream_name || 'N/A'}</strong></div>
              <div className="detail-item"><span>Term</span><strong>{studentReport.term} {studentReport.year}</strong></div>
              <div className="detail-item"><span>Total Marks</span><strong>{studentReport.total}</strong></div>
              <div className="detail-item"><span>Average</span><strong>{studentReport.average}</strong></div>
              <div className="detail-item"><span>Grade</span><strong>{studentReport.grade}</strong></div>
              <div className="detail-item"><span>Position</span><strong>{studentReport.position || '-'}</strong></div>
              <div className="detail-item"><span>Class Size</span><strong>{studentReport.class_size}</strong></div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Code</th>
                  <th>CAT Avg</th>
                  <th>Exam</th>
                  <th>Total</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {studentReport.subjects.length > 0 ? studentReport.subjects.map(subject => (
                  <tr key={subject.subject_id}>
                    <td>{subject.subject_name}</td>
                    <td>{subject.code}</td>
                    <td>{subject.cat_average}</td>
                    <td>{subject.main_exam}</td>
                    <td>{subject.total}</td>
                    <td>{subject.grade}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '18px 0' }}>
                      No marks have been entered yet for this student in the selected term.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => downloadStudentReport(studentReport.student.id)}>
                Download PDF
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
