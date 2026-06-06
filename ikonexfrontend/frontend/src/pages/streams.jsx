import { useEffect, useState } from 'react';
import API from '../api/axios';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

export default function Streams() {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [details, setDetails] = useState(null);

  const load = () => API.get('/streams').then(r => setStreams(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setName(''); setShowModal(true); };
  const openEdit = s => { setEditing(s); setName(s.name); setShowModal(true); };

  const openDetails = async stream => {
    try {
      const r = await API.get(`/streams/${stream.id}`);
      setDetails(r.data);
    } catch {
      toast.error('Could not load stream details');
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      if (editing) {
        await API.put(`/streams/${editing.id}`, { name });
        toast.success('Stream updated');
      } else {
        await API.post('/streams', { name });
        toast.success('Stream created');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong');
    }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this stream? Students in it will be unassigned.')) return;
    try {
      await API.delete(`/streams/${id}`);
      toast.success('Stream deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Class Streams</h1>
          <p>Manage class streams like Form 1A, Form 2B</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Stream</button>
      </div>

      <div className="card">
        {streams.length === 0 ? (
          <div className="empty-state">
            <div className="icon">CS</div>
            <h3>No streams yet</h3>
            <p>Create your first class stream to get started</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Stream Name</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td><span className="badge badge-blue">{s.name}</span></td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
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
        <Modal title={editing ? 'Edit Stream' : 'Create Stream'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Stream Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Form 1A" required />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {details && (
        <Modal title={`${details.name} Details`} onClose={() => setDetails(null)}>
          <div>
            <div className="detail-grid">
              <div className="detail-item"><span>Students</span><strong>{details.students.length}</strong></div>
              <div className="detail-item"><span>Assigned Subjects</span><strong>{details.subjects.length}</strong></div>
              <div className="detail-item"><span>Created</span><strong>{new Date(details.created_at).toLocaleDateString()}</strong></div>
            </div>
            <h3 style={{ marginBottom: '10px', color: '#064e3b' }}>Subjects</h3>
            <p style={{ color: '#6b7280', marginBottom: '16px' }}>
              {details.subjects.length ? details.subjects.map(s => s.name).join(', ') : 'No subjects assigned yet'}
            </p>
            <h3 style={{ marginBottom: '10px', color: '#064e3b' }}>Students</h3>
            {details.students.length ? (
              <table>
                <thead><tr><th>Adm No</th><th>Name</th><th>Gender</th></tr></thead>
                <tbody>
                  {details.students.map(s => (
                    <tr key={s.id}>
                      <td>{s.admission_number}</td>
                      <td>{s.first_name} {s.last_name}</td>
                      <td>{s.gender || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p style={{ color: '#6b7280' }}>No students assigned to this stream.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
