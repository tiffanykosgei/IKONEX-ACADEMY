import { useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { path: '/',          icon: '📊', label: 'Dashboard'     },
  { path: '/streams',   icon: '🏫', label: 'Class Streams' },
  { path: '/students',  icon: '🎓', label: 'Students'      },
  { path: '/subjects',  icon: '📚', label: 'Subjects'      },
  { path: '/exams',     icon: '📝', label: 'Exams'         },
  { path: '/scores',    icon: '✅', label: 'Scores'        },
  { path: '/grades',    icon: '⭐', label: 'Grades'        },
  { path: '/reports',   icon: '📄', label: 'Reports'       },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <h2>Ikonex Academy</h2>
        <p>Student Management System</p>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
