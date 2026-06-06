import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/dashboard';
import Streams from './pages/streams';
import Students from './pages/students';
import Subjects from './pages/subjects';
import Exams from './pages/exams';
import Scores from './pages/scores';
import Grades from './pages/grades';
import Reports from './pages/reports';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <div className="layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/streams"   element={<Streams />} />
            <Route path="/students"  element={<Students />} />
            <Route path="/subjects"  element={<Subjects />} />
            <Route path="/exams"     element={<Exams />} />
            <Route path="/scores"    element={<Scores />} />
            <Route path="/grades"    element={<Grades />} />
            <Route path="/reports"   element={<Reports />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
