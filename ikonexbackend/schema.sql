-- Class streams (e.g. Form 1A, Form 2B)
CREATE TABLE IF NOT EXISTS streams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Students
CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  admission_number VARCHAR(50) NOT NULL UNIQUE,
  date_of_birth DATE,
  gender VARCHAR(10),
  stream_id INTEGER REFERENCES streams(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subjects
CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Which subjects belong to which stream
CREATE TABLE IF NOT EXISTS stream_subjects (
  id SERIAL PRIMARY KEY,
  stream_id INTEGER REFERENCES streams(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(stream_id, subject_id)
);

-- Exam types
CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  exam_type VARCHAR(20) NOT NULL CHECK (exam_type IN ('exam', 'cat')),
  term VARCHAR(20),
  year INTEGER,
  stream_id INTEGER REFERENCES streams(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Scores
CREATE TABLE IF NOT EXISTS scores (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  marks NUMERIC(5,2) NOT NULL CHECK (marks >= 0 AND marks <= 70),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, subject_id, exam_id)
);

-- Grading scale (configurable)
CREATE TABLE IF NOT EXISTS grade_config (
  id SERIAL PRIMARY KEY,
  min_mark NUMERIC(5,2) NOT NULL,
  max_mark NUMERIC(5,2) NOT NULL,
  grade VARCHAR(5) NOT NULL,
  points NUMERIC(3,1) NOT NULL,
  remarks VARCHAR(50)
);

-- Default grading scale (Kenya KNEC style)
INSERT INTO grade_config (min_mark, max_mark, grade, points, remarks) VALUES
(80, 100, 'A',  12, 'Excellent'),
(75, 79,  'A-', 11, 'Excellent'),
(70, 74,  'B+', 10, 'Very Good'),
(65, 69,  'B',  9,  'Good'),
(60, 64,  'B-', 8,  'Good'),
(55, 59,  'C+', 7,  'Average'),
(50, 54,  'C',  6,  'Average'),
(45, 49,  'C-', 5,  'Below Average'),
(40, 44,  'D+', 4,  'Below Average'),
(35, 39,  'D',  3,  'Poor'),
(30, 34,  'D-', 2,  'Poor'),
(0,  29,  'E',  1,  'Fail')
ON CONFLICT DO NOTHING;
