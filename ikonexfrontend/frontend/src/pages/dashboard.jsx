import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    students: 0,
    streams: 0,
    subjects: 0,
    exams: 0,
    scores: 0,
    grades: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API.get('/students'),
      API.get('/streams'),
      API.get('/subjects'),
      API.get('/exams'),
      API.get('/scores/results'),
      API.get('/grades'),
    ]).then(([s, st, sub, e, sc, g]) => {
      setStats({
        students: s.data.length,
        streams: st.data.length,
        subjects: sub.data.length,
        exams: e.data.length,
        scores: sc.data.length,
        grades: g.data.length,
      });
    }).finally(() => setLoading(false));
  }, []);

  const statCards = useMemo(() => [
    { key: 'students', path: '/students', icon: '🎓', tone: 'blue', value: stats.students, label: 'Total Students' },
    { key: 'streams', path: '/streams', icon: '🏫', tone: 'green', value: stats.streams, label: 'Class Streams' },
    { key: 'subjects', path: '/subjects', icon: '📚', tone: 'purple', value: stats.subjects, label: 'Subjects' },
    { key: 'exams', path: '/exams', icon: '📝', tone: 'orange', value: stats.exams, label: 'Exams Created' },
    { key: 'scores', path: '/scores', icon: '✅', tone: 'teal', value: stats.scores, label: 'Score Records' },
    { key: 'grades', path: '/grades', icon: '⭐', tone: 'gold', value: stats.grades, label: 'Grade Bands' },
  ], [stats]);

  if (loading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome to Ikonex Academy Student Management System</p>
        </div>
      </div>

      <div className="stats-grid">
        {statCards.map(card => (
          <button
            key={card.key}
            type="button"
            className="stat-card stat-card-link"
            onClick={() => navigate(card.path)}
            aria-label={`Open ${card.label}`}
          >
            <div className={`stat-icon ${card.tone}`}>{card.icon}</div>
            <div className="stat-info">
              <h3>{card.value}</h3>
              <p>{card.label}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '12px', color: '#064e3b' }}>Quick Start Guide</h3>
        <ol style={{ paddingLeft: '20px', lineHeight: '2', color: '#6b7280', fontSize: '14px' }}>
          <li>Create <strong>Class Streams</strong> such as Form 1A or Form 2B</li>
          <li>Add <strong>Subjects</strong> and assign them to streams</li>
          <li>Register <strong>Students</strong> and assign them to streams</li>
          <li>Create an <strong>Exam</strong> for a stream and term</li>
          <li>Enter <strong>Scores</strong> for each student per subject</li>
          <li>Review <strong>Grades</strong> and export table reports as PDF</li>
        </ol>
      </div>
    </div>
  );
}
