import { useEffect, useMemo, useState } from 'react';
import API from '../api/axios';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { exportTablePdf } from '../utils/pdfExport';

const EMPTY = { first_name: '', last_name: '', admission_number: '', date_of_birth: '', gender: '', stream_id: '' };
const SORT_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'admission_number', label: 'Admission No' },
  { value: 'gender', label: 'Gender' },
  { value: 'stream_name', label: 'Stream' },
  { value: 'created_at', label: 'Registered' },
];

function getStudentValue(student, field) {
  if (field === 'name') return `${student.first_name || ''} ${student.last_name || ''}`.trim();
  return student[field] ?? '';
}

function sortStudents(a, b, field, direction) {
  const modifier = direction === 'asc' ? 1 : -1;
  const aValue = getStudentValue(a, field);
  const bValue = getStudentValue(b, field);
  return String(aValue).localeCompare(String(bValue), undefined, { numeric: true }) * modifier;
}

export default function Students() {
  const [students, setStudents] = useState([]);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [filterStream, setFilterStream] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [details, setDetails] = useState(null);

  const load = () => Promise.all([API.get('/students'), API.get('/streams')])
    .then(([s, st]) => { setStudents(s.data); setStreams(st.data); })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = s => {
    setEditing(s);
    setForm({ ...s, date_of_birth: s.date_of_birth?.split('T')[0] || '', stream_id: s.stream_id || '' });
    setShowModal(true);
  };

  const openDetails = async s => {
    try {
      const r = await API.get(`/students/${s.id}`);
      setDetails(r.data);
    } catch {
      toast.error('Could not load student details');
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      const payload = { ...form, stream_id: form.stream_id || null };
      if (editing) {
        await API.put(`/students/${editing.id}`, payload);
        toast.success('Student updated');
      } else {
        await API.post('/students', payload);
        toast.success('Student registered');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong');
    }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this student? All their scores will also be deleted.')) return;
    try {
      await API.delete(`/students/${id}`);
      toast.success('Student deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const filtered = useMemo(() => students
    .filter(s => {
      const searchable = `${s.first_name} ${s.last_name} ${s.admission_number} ${s.gender || ''} ${s.stream_name || ''}`;
      const matchSearch = searchable.toLowerCase().includes(search.trim().toLowerCase());
      const matchStream = filterStream ? String(s.stream_id) === filterStream : true;
      const matchGender = filterGender ? s.gender === filterGender : true;
      return matchSearch && matchStream && matchGender;
    })
    .sort((a, b) => sortStudents(a, b, sortField, sortDirection)),
  [students, search, filterStream, filterGender, sortField, sortDirection]);

  const exportStudents = () => {
    const streamName = streams.find(st => String(st.id) === filterStream)?.name || 'All streams';
    const ok = exportTablePdf({
      title: `Students list - ${streamName}`,
      context: `Students${filterGender ? ` - ${filterGender}` : ''} - ${streamName}`,
      rows: filtered,
      columns: [
        { label: 'Adm No', value: 'admission_number' },
        { label: 'Name', value: student => `${student.first_name} ${student.last_name}` },
        { label: 'Gender', value: 'gender' },
        { label: 'Stream', value: student => student.stream_name || 'Unassigned' },
        { label: 'Registered', value: student => student.created_at ? new Date(student.created_at).toLocaleDateString() : '-' },
      ],
    });

    if (!ok) toast.error('No students to export');
  };

  const clearFilters = () => {
    setSearch('');
    setFilterStream('');
    setFilterGender('');
    setSortField('name');
    setSortDirection('asc');
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Students</h1>
          <p>{students.length} students registered</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Register Student</button>
      </div>

      <div className="page-tools">
        <div className="tool-field tool-field-wide">
          <label>Search</label>
          <input placeholder="Name, admission no, gender or stream" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="tool-field">
          <label>Stream</label>
          <select value={filterStream} onChange={e => setFilterStream(e.target.value)}>
            <option value="">All streams</option>
            {streams.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>
        <div className="tool-field">
          <label>Gender</label>
          <select value={filterGender} onChange={e => setFilterGender(e.target.value)}>
            <option value="">All genders</option>
            <option>Male</option>
            <option>Female</option>
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
        <button className="btn btn-secondary tool-action" onClick={exportStudents}>Export PDF</button>
        <button className="btn btn-secondary tool-action" onClick={clearFilters}>Clear Filters</button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon">ST</div>
            <h3>No students found</h3>
            <p>Try adjusting your search or register a new student</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Adm No</th>
                <th>Name</th>
                <th>Gender</th>
                <th>Stream</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{s.admission_number}</code></td>
                  <td><strong>{s.first_name} {s.last_name}</strong></td>
                  <td>{s.gender || '-'}</td>
                  <td>{s.stream_name ? <span className="badge badge-blue">{s.stream_name}</span> : <span className="badge badge-gray">Unassigned</span>}</td>
                  <td style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openDetails(s)}>View</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Student' : 'Register Student'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>First Name</label>
                <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} required />
              </div>
            </div>
            <div className="form-group">
              <label>Admission Number</label>
              <input value={form.admission_number} onChange={e => setForm({ ...form, admission_number: e.target.value })} required placeholder="e.g. ADM/2024/001" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Date of Birth</label>
                <input type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Gender</label>
                <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                  <option value="">Select gender</option>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Class Stream</label>
              <select value={form.stream_id} onChange={e => setForm({ ...form, stream_id: e.target.value })}>
                <option value="">Select stream</option>
                {streams.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Register'}</button>
            </div>
          </form>
        </Modal>
      )}

      {details && (
        <Modal title="Student Details" onClose={() => setDetails(null)}>
          <div>
            <div className="detail-grid">
              <div className="detail-item"><span>Name</span><strong>{details.first_name} {details.last_name}</strong></div>
              <div className="detail-item"><span>Admission Number</span><strong>{details.admission_number}</strong></div>
              <div className="detail-item"><span>Class Stream</span><strong>{details.stream_name || 'Unassigned'}</strong></div>
              <div className="detail-item"><span>Gender</span><strong>{details.gender || '-'}</strong></div>
              <div className="detail-item"><span>Date of Birth</span><strong>{details.date_of_birth ? new Date(details.date_of_birth).toLocaleDateString() : '-'}</strong></div>
              <div className="detail-item"><span>Registered</span><strong>{new Date(details.created_at).toLocaleDateString()}</strong></div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
