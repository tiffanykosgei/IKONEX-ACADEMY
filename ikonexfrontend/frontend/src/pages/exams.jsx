import { useEffect, useMemo, useState } from 'react';
import API from '../api/axios';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { exportTablePdf } from '../utils/pdfExport';

const EMPTY = { name: '', exam_type: 'exam', term: 'Term 1', year: new Date().getFullYear(), stream_id: '', subject_id: '' };
const SORT_FIELDS = [
  { value: 'name', label: 'Exam Name' },
  { value: 'exam_type', label: 'Type' },
  { value: 'subject_name', label: 'Subject' },
  { value: 'term', label: 'Term' },
  { value: 'year', label: 'Year' },
  { value: 'stream_name', label: 'Stream' },
];

function getExamValue(exam, field) {
  return exam[field] ?? '';
}

function sortExams(a, b, field, direction) {
  const modifier = direction === 'asc' ? 1 : -1;
  return String(getExamValue(a, field)).localeCompare(String(getExamValue(b, field)), undefined, { numeric: true }) * modifier;
}

export default function Exams() {
  const [exams, setExams] = useState([]);
  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [filterStream, setFilterStream] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTerm, setFilterTerm] = useState('');
  const [sortField, setSortField] = useState('year');
  const [sortDirection, setSortDirection] = useState('desc');

  const load = () => Promise.all([API.get('/exams'), API.get('/streams')])
    .then(([e, s]) => { setExams(e.data); setStreams(s.data); })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!form.stream_id) {
      Promise.resolve().then(() => setSubjects([]));
      return;
    }

    API.get(`/subjects/stream/${form.stream_id}`).then(r => {
      setSubjects(r.data);
      setForm(prev => (
        r.data.some(subject => String(subject.id) === String(prev.subject_id))
          ? prev
          : { ...prev, subject_id: '' }
      ));
    });
  }, [form.stream_id]);

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await API.post('/exams', form);
      toast.success('Exam created');
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error creating exam');
    }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this exam? All scores for it will be deleted.')) return;
    try {
      await API.delete(`/exams/${id}`);
      toast.success('Exam deleted');
      load();
    } catch (err) {
      console.error(err);
      toast.error('Delete failed');
    }
  };

  const filteredExams = useMemo(() => exams
    .filter(exam => {
      const searchable = `${exam.name} ${exam.exam_type} ${exam.subject_name || ''} ${exam.term} ${exam.year} ${exam.stream_name || ''}`;
      const matchSearch = searchable.toLowerCase().includes(search.trim().toLowerCase());
      const matchStream = filterStream ? String(exam.stream_id) === filterStream : true;
      const matchType = filterType ? exam.exam_type === filterType : true;
      const matchTerm = filterTerm ? exam.term === filterTerm : true;
      return matchSearch && matchStream && matchType && matchTerm;
    })
    .sort((a, b) => sortExams(a, b, sortField, sortDirection)),
  [exams, search, filterStream, filterType, filterTerm, sortField, sortDirection]);

  const exportExams = () => {
    const streamName = streams.find(stream => String(stream.id) === filterStream)?.name || 'All streams';
    const ok = exportTablePdf({
      title: `Exams list - ${streamName}`,
      context: `Exams${filterType ? ` - ${filterType.toUpperCase()}` : ''}${filterTerm ? ` - ${filterTerm}` : ''}`,
      rows: filteredExams,
      columns: [
        { label: 'Exam Name', value: 'name' },
        { label: 'Type', value: exam => exam.exam_type?.toUpperCase() || '-' },
        { label: 'Subject', value: exam => exam.subject_name || '-' },
        { label: 'Term', value: 'term' },
        { label: 'Year', value: 'year' },
        { label: 'Stream', value: exam => exam.stream_name || '-' },
      ],
    });

    if (!ok) toast.error('No exams to export');
  };

  const clearFilters = () => {
    setSearch('');
    setFilterStream('');
    setFilterType('');
    setFilterTerm('');
    setSortField('year');
    setSortDirection('desc');
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Exams</h1>
          <p>Create and manage examination sessions</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setShowModal(true); }}>+ New Exam</button>
      </div>

      <div className="page-tools">
        <div className="tool-field tool-field-wide">
          <label>Search</label>
          <input placeholder="Exam, subject, term or stream" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="tool-field">
          <label>Stream</label>
          <select value={filterStream} onChange={e => setFilterStream(e.target.value)}>
            <option value="">All streams</option>
            {streams.map(stream => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
          </select>
        </div>
        <div className="tool-field">
          <label>Type</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All types</option>
            <option value="exam">Main Exam</option>
            <option value="cat">CAT</option>
          </select>
        </div>
        <div className="tool-field">
          <label>Term</label>
          <select value={filterTerm} onChange={e => setFilterTerm(e.target.value)}>
            <option value="">All terms</option>
            <option>Term 1</option>
            <option>Term 2</option>
            <option>Term 3</option>
          </select>
        </div>
        <div className="tool-field">
          <label>Sort</label>
          <select value={sortField} onChange={e => setSortField(e.target.value)}>
            {SORT_FIELDS.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
          </select>
        </div>
        <div className="tool-field tool-field-small">
          <label>Order</label>
          <select value={sortDirection} onChange={e => setSortDirection(e.target.value)}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <button className="btn btn-secondary tool-action" onClick={exportExams}>Export PDF</button>
        <button className="btn btn-secondary tool-action" onClick={clearFilters}>Clear Filters</button>
      </div>

      <div className="card">
        {exams.length === 0 ? (
          <div className="empty-state">
            <div className="icon">EX</div>
            <h3>No exams yet</h3>
            <p>Create an exam session to start recording scores</p>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="empty-state">
            <div className="icon">EX</div>
            <h3>No exams found</h3>
            <p>Try changing your search or filters</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Exam Name</th><th>Type</th><th>Subject</th><th>Term</th><th>Year</th><th>Stream</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredExams.map(e => (
                <tr key={e.id}>
                  <td><strong>{e.name}</strong></td>
                  <td><span className={`badge ${e.exam_type === 'exam' ? 'badge-blue' : 'badge-orange'}`}>{e.exam_type.toUpperCase()}</span></td>
                  <td>{e.subject_name ? <span className="badge badge-purple">{e.subject_name}</span> : '-'}</td>
                  <td>{e.term}</td>
                  <td>{e.year}</td>
                  <td>{e.stream_name ? <span className="badge badge-green">{e.stream_name}</span> : '-'}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(e.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title="Create New Exam" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Exam Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. End of Term 1 Exam" required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Type</label>
                <select value={form.exam_type} onChange={e => setForm({ ...form, exam_type: e.target.value })}>
                  <option value="exam">Main Exam</option>
                  <option value="cat">CAT</option>
                </select>
              </div>
              <div className="form-group">
                <label>Term</label>
                <select value={form.term} onChange={e => setForm({ ...form, term: e.target.value })}>
                  <option>Term 1</option>
                  <option>Term 2</option>
                  <option>Term 3</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Year</label>
                <input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Stream</label>
                <select value={form.stream_id} onChange={e => setForm({ ...form, stream_id: e.target.value, subject_id: '' })} required>
                  <option value="">Select stream</option>
                  {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Subject</label>
              <select value={form.subject_id} onChange={e => setForm({ ...form, subject_id: e.target.value })} required disabled={!form.stream_id}>
                <option value="">{form.stream_id ? 'Select subject' : 'Select a stream first'}</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
              {form.stream_id && subjects.length === 0 && (
                <p style={{ color: '#dc2626', fontSize: '13px', marginTop: '6px' }}>
                  No subjects are assigned to this stream yet. Assign subjects before creating an exam.
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Exam</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
