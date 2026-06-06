import { useEffect, useMemo, useState } from 'react';
import API from '../api/axios';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { exportTablePdf } from '../utils/pdfExport';

function getSubjectStreams(subject) {
  return subject.streams || subject.stream_names || subject.assigned_streams || [];
}

export default function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [editing, setEditing] = useState(null);
  const [details, setDetails] = useState(null);
  const [form, setForm] = useState({ name: '', code: '' });
  const [assignForm, setAssignForm] = useState({ stream_id: '', subject_id: '' });
  const [search, setSearch] = useState('');
  const [filterStream, setFilterStream] = useState('');

  const load = () => Promise.all([API.get('/subjects'), API.get('/streams')])
    .then(async ([sub, st]) => {
      const subjectsWithStreams = await Promise.all(
        sub.data.map(subject => API.get(`/subjects/${subject.id}`).then(r => r.data).catch(() => subject))
      );
      setSubjects(subjectsWithStreams);
      setStreams(st.data);
    })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const openDetails = async subject => {
    try {
      const r = await API.get(`/subjects/${subject.id}`);
      setDetails(r.data);
    } catch {
      toast.error('Could not load subject details');
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      if (editing) {
        await API.put(`/subjects/${editing.id}`, form);
        toast.success('Subject updated');
      } else {
        await API.post('/subjects', form);
        toast.success('Subject created');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error saving subject');
    }
  };

  const handleAssign = async e => {
    e.preventDefault();
    try {
      await API.post('/subjects/assign', assignForm);
      toast.success('Subject assigned to stream');
      setShowAssign(false);
      if (details?.id === Number(assignForm.subject_id)) openDetails(details);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Assignment failed');
    }
  };

  const handleUnassign = async (streamId, subjectId) => {
    if (!confirm('Remove this subject from the selected stream?')) return;
    try {
      await API.delete(`/subjects/assign/${streamId}/${subjectId}`);
      toast.success('Subject removed from stream');
      const r = await API.get(`/subjects/${subjectId}`);
      setDetails(r.data);
    } catch {
      toast.error('Could not remove subject from stream');
    }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this subject?')) return;
    try {
      await API.delete(`/subjects/${id}`);
      toast.success('Subject deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const filteredSubjects = useMemo(() => subjects
    .filter(subject => {
      const subjectStreams = getSubjectStreams(subject);
      const streamNames = subjectStreams.map(stream => stream.name || stream.stream_name || stream).join(' ');
      const searchable = `${subject.name} ${subject.code} ${streamNames}`;
      const matchSearch = searchable.toLowerCase().includes(search.trim().toLowerCase());
      const matchStream = filterStream
        ? subjectStreams.some(stream => String(stream.id || stream.stream_id || stream) === filterStream)
        : true;
      return matchSearch && matchStream;
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true })),
  [subjects, search, filterStream]);

  const exportSubjects = () => {
    const streamName = streams.find(stream => String(stream.id) === filterStream)?.name || 'All streams';
    const ok = exportTablePdf({
      title: `Subjects list - ${streamName}`,
      context: `Subjects assigned to ${streamName}`,
      rows: filteredSubjects,
      columns: [
        { label: 'Code', value: 'code' },
        { label: 'Subject Name', value: 'name' },
        {
          label: 'Assigned Streams',
          value: subject => {
            const subjectStreams = getSubjectStreams(subject);
            return subjectStreams.length
              ? subjectStreams.map(stream => stream.name || stream.stream_name || stream).join(', ')
              : 'Not assigned';
          },
        },
      ],
    });

    if (!ok) toast.error('No subjects to export');
  };

  const clearFilters = () => {
    setSearch('');
    setFilterStream('');
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Subjects</h1>
          <p>Manage school subjects and assign them to streams</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowAssign(true)}>Assign to Stream</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ name: '', code: '' }); setShowModal(true); }}>+ New Subject</button>
        </div>
      </div>

      <div className="page-tools">
        <div className="tool-field tool-field-wide">
          <label>Search</label>
          <input placeholder="Subject, code or stream" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="tool-field">
          <label>Stream</label>
          <select value={filterStream} onChange={e => setFilterStream(e.target.value)}>
            <option value="">All streams</option>
            {streams.map(stream => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary tool-action" onClick={exportSubjects}>Export PDF</button>
        <button className="btn btn-secondary tool-action" onClick={clearFilters}>Clear Filters</button>
      </div>

      <div className="card">
        {subjects.length === 0 ? (
          <div className="empty-state">
            <div className="icon">SB</div>
            <h3>No subjects yet</h3>
            <p>Create your first subject</p>
          </div>
        ) : filteredSubjects.length === 0 ? (
          <div className="empty-state">
            <div className="icon">SB</div>
            <h3>No subjects found</h3>
            <p>Try changing your search, filter or sort options</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Code</th><th>Subject Name</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredSubjects.map(s => (
                <tr key={s.id}>
                  <td><span className="badge badge-purple">{s.code}</span></td>
                  <td><strong>{s.name}</strong></td>
                  <td style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openDetails(s)}>View</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(s); setForm({ name: s.name, code: s.code }); setShowModal(true); }}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Subject' : 'New Subject'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Subject Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mathematics" required />
            </div>
            <div className="form-group">
              <label>Subject Code</label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. MATH101" required />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showAssign && (
        <Modal title="Assign Subject to Stream" onClose={() => setShowAssign(false)}>
          <form onSubmit={handleAssign}>
            <div className="form-group">
              <label>Select Stream</label>
              <select value={assignForm.stream_id} onChange={e => setAssignForm({ ...assignForm, stream_id: e.target.value })} required>
                <option value="">Choose stream</option>
                {streams.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Select Subject</label>
              <select value={assignForm.subject_id} onChange={e => setAssignForm({ ...assignForm, subject_id: e.target.value })} required>
                <option value="">Choose subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAssign(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Assign</button>
            </div>
          </form>
        </Modal>
      )}

      {details && (
        <Modal title="Subject Details" onClose={() => setDetails(null)}>
          <div>
            <div className="detail-grid">
              <div className="detail-item"><span>Subject</span><strong>{details.name}</strong></div>
              <div className="detail-item"><span>Code</span><strong>{details.code}</strong></div>
              <div className="detail-item"><span>Assigned Streams</span><strong>{details.streams.length}</strong></div>
            </div>
            <h3 style={{ marginBottom: '10px', color: '#064e3b' }}>Streams Offering This Subject</h3>
            {details.streams.length ? (
              <table>
                <thead><tr><th>Stream</th><th>Action</th></tr></thead>
                <tbody>
                  {details.streams.map(st => (
                    <tr key={st.id}>
                      <td><span className="badge badge-blue">{st.name}</span></td>
                      <td><button className="btn btn-danger btn-sm" onClick={() => handleUnassign(st.id, details.id)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p style={{ color: '#6b7280' }}>This subject has not been assigned to any stream.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
