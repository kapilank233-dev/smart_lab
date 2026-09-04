import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { supabase } from "./lib/supabase";

const modules = [
  { id: "overview", icon: "▦", label: "Overview" },
  { id: "monitoring", icon: "◉", label: "Activity monitoring", badge: "LIVE" },
  { id: "assessment", icon: "✦", label: "AI assessment" },
  { id: "execution", icon: "▷", label: "Program execution" },
  { id: "storage", icon: "▱", label: "Data storage" },
  { id: "scoring", icon: "✓", label: "Automated scoring" },
  { id: "rubric", icon: "≡", label: "Rubric & parameters" },
  { id: "reports", icon: "▤", label: "Reports & analytics" },
];

const defaultCases = [
  ["[5, 2, 9, 1]", "[1, 2, 5, 9]"],
  ["[3, 3, 1]", "[1, 3, 3]"],
  ["[8, 4, 6, 2]", "[2, 4, 6, 8]"],
  ["[]", "[]"],
  ["[7]", "[7]"],
  ["[-2, 5, 0]", "[-2, 0, 5]"],
  ["[10, 1, 10]", "[1, 10, 10]"],
  ["[4, 9, 2, 6, 3]", "[2, 3, 4, 6, 9]"],
  ["[12, 0, 8, 4]", "[0, 4, 8, 12]"],
  ["[6, 5, 4, 3, 2, 1]", "[1, 2, 3, 4, 5, 6]"],
];
const defaultEvaluation = {
  name: "Sorting Algorithm",
  question:
    "Implement an efficient sorting algorithm and explain its time complexity.",
  duration: 45,
  testCases: 10,
  cases: defaultCases,
  status: "Published",
};
let pythonRuntime;
function loadPythonRuntime() {
  if (pythonRuntime) return pythonRuntime;
  pythonRuntime = new Promise((resolve, reject) => {
    if (window.loadPyodide) {
      resolve(
        window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/",
        }),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js";
    script.onload = () =>
      resolve(
        window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/",
        }),
      );
    script.onerror = () =>
      reject(new Error("Python runtime could not be loaded."));
    document.head.appendChild(script);
  });
  return pythonRuntime;
}
async function executePythonCases(source, cases) {
  const pyodide = await loadPythonRuntime();
  const results = [];
  for (const [input, expected] of cases) {
    try {
      pyodide.globals.set("student_source", source);
      pyodide.globals.set("student_input", input);
      const actual = await pyodide.runPythonAsync(
        "import json\nnamespace = {}\nexec(student_source, namespace)\njson.dumps(namespace['sortArray'](json.loads(student_input)))",
      );
      const normalizedActual = JSON.stringify(JSON.parse(actual));
      const normalizedExpected = JSON.stringify(JSON.parse(expected));
      results.push({
        input,
        expected,
        actual,
        matched: normalizedActual === normalizedExpected,
      });
    } catch (error) {
      results.push({
        input,
        expected,
        actual: `RuntimeError: ${error.message}`,
        matched: false,
      });
    }
  }
  return results;
}

function Dashboard() {
  const [active, setActive] = useState("overview");
  const [mode, setMode] = useState("landing");
  const [studentTab, setStudentTab] = useState("dashboard");
  const [notice, setNotice] = useState("");
  const [activeEvaluation, setActiveEvaluation] = useState(defaultEvaluation);
  const [evaluationSubmitted, setEvaluationSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [studentEvaluation, setStudentEvaluation] = useState({
    code: "",
    caseResults: [],
  });
  const [user, setUser] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [activeStudentCount, setActiveStudentCount] = useState(() =>
    Number(window.localStorage.getItem("labpilot-active-students") || 0),
  );
  const [lastWeekStudentCount] = useState(() =>
    Number(window.localStorage.getItem("labpilot-last-week-students") || 0),
  );
  const [submissionsToday, setSubmissionsToday] = useState(() =>
    Number(window.localStorage.getItem("labpilot-submissions-today") || 0),
  );
  const [averageScore, setAverageScore] = useState(() =>
    Number(window.localStorage.getItem("labpilot-average-score") || 0),
  );
  const [needsReview, setNeedsReview] = useState(() =>
    Number(window.localStorage.getItem("labpilot-needs-review") || 0),
  );
  const [activities, setActivities] = useState([]);
  const [activeEvaluations, setActiveEvaluations] = useState(() =>
    Number(window.localStorage.getItem("labpilot-active-evaluations") || 0),
  );
  const [adminStudents, setAdminStudents] = useState([]);

  useEffect(() => {
    window.localStorage.setItem(
      "labpilot-active-students",
      String(activeStudentCount),
    );
  }, [activeStudentCount]);
  useEffect(() => {
    window.localStorage.setItem(
      "labpilot-submissions-today",
      String(submissionsToday),
    );
  }, [submissionsToday]);
  useEffect(() => {
    window.localStorage.setItem("labpilot-average-score", String(averageScore));
  }, [averageScore]);
  useEffect(() => {
    window.localStorage.setItem("labpilot-needs-review", String(needsReview));
  }, [needsReview]);
  useEffect(() => {
    window.localStorage.setItem(
      "labpilot-active-evaluations",
      String(activeEvaluations),
    );
  }, [activeEvaluations]);
  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user || null));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user || null),
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!supabase || !user || mode !== "faculty") return undefined;
    supabase
      .from("student_profiles")
      .select("full_name, usn, semester, assigned_lab")
      .neq("role", "admin")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setAdminStudents(data.map((student) => [student.full_name, student.usn, `${student.assigned_lab} · ${student.semester}`, "--", "In Progress"]));
      });
    return undefined;
  }, [mode, user]);
  useEffect(() => {
    if (!supabase || !user || mode !== "student") return undefined;
    supabase
      .from("student_profiles")
      .select("full_name, usn, semester, assigned_lab")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setStudentProfile(data || null));
    return undefined;
  }, [mode, user]);

  const signIn = async (portal, username, password) => {
    if (!supabase)
      return "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.";
    const { error } = await supabase.auth.signInWithPassword({
      email: portal === "student"
        ? `${username.trim().toLowerCase()}@students.labpilot.local`
        : username,
      password,
    });
    if (error) return error.message;
    setMode(portal === "student" ? "student" : "faculty");
    if (portal === "student") setStudentTab("evaluation");
    return "";
  };
  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setMode("landing");
  };
  const handleStudentSubmit = async (result) => {
    setSubmissionResult(result);
    setEvaluationSubmitted(true);
    setSubmissionsToday((count) => count + 1);
    setAverageScore(result.score);
    if (result.passed < result.total) setNeedsReview((count) => count + 1);
    setActivities((current) => [
      {
        initials: "AS",
        name: "Aarav Shah",
        task: activeEvaluation.name,
        status: result.passed === result.total ? "Compiled" : "Review needed",
        tone: result.passed === result.total ? "green" : "red",
        time: "Just now",
      },
      ...current,
    ]);
    if (supabase && user)
      await supabase
        .from("submissions")
        .insert({
          student_id: user.id,
          evaluation_name: activeEvaluation.name,
          code: studentEvaluation.code,
          case_results: studentEvaluation.caseResults,
          score: result.score,
          passed: result.passed,
          total: result.total,
          time_used: result.timeUsed,
        });
  };
  const createStudent = async (student) => {
    if (!supabase) return "Supabase is not configured.";
    const { data, error } = await supabase.functions.invoke("create-student", {
      body: student,
    });
    if (error) {
      const serverMessage = error.context instanceof Response ? await error.context.text() : "";
      return serverMessage || error.message;
    }
    setAdminStudents((current) => [
      ...current,
      [student.name.trim(), student.usn.trim(), `${student.lab} · ${student.semester.trim()}`, "--", "In Progress"],
    ]);
    return data?.email ? "" : "Student account was not created.";
  };

  if (mode === "landing")
    return (
      <Landing
        onStudent={() => setMode("login")}
        onAdmin={() => setMode("admin-login")}
      />
    );
  if (mode === "login")
    return (
      <StudentLogin
        onLogin={(username, password) => signIn("student", username, password)}
        onBack={() => setMode("landing")}
      />
    );
  if (mode === "admin-login")
    return (
      <AdminLogin
        onLogin={(username, password) => signIn("admin", username, password)}
        onBack={() => setMode("landing")}
      />
    );

  return (
    <div className="app-shell">
      {mode === "faculty" && (
        <AdminSidebar
          active={active}
          onNavigate={setActive}
          onLogout={signOut}
        />
      )}
      {mode === "student" && (
        <StudentSidebar
          active={studentTab}
          onNavigate={(tab) =>
            setStudentTab(
              evaluationSubmitted && tab === "evaluation" ? "results" : tab,
            )
          }
          profile={studentProfile}
          onLogout={signOut}
        />
      )}
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {mode === "student"
                ? "Student dashboard"
                : active === "overview"
                  ? "Admin overview"
                  : modules.find((item) => item.id === active)?.label}
            </strong>
          </div>
          <div className="top-actions">
            {mode === "student" ? (
              <>
                <span className="student-role-label">Student</span>
                <button className="logout-button" onClick={signOut}>
                  Logout <span>↗</span>
                </button>
              </>
            ) : (
              <>
                <span className="admin-role-label">Admin</span>
                <button className="icon-button" aria-label="Notifications">
                  ♧<span className="notification-dot" />
                </button>
                <button className="logout-button" onClick={signOut}>
                  Logout <span>↗</span>
                </button>
              </>
            )}{" "}
            {mode === "student" && (
              <button className="icon-button" aria-label="Notifications">
                ♧<span className="notification-dot" />
              </button>
            )}
            <button className="avatar mini-avatar">
              {mode === "faculty" ? "DR" : "AS"}
            </button>
          </div>
        </header>
        {mode === "student" && (
          <>
            {["dashboard", "evaluation"].includes(studentTab) ? (
              <StudentView
                studentTab={studentTab}
                setStudentTab={setStudentTab}
                activeEvaluation={activeEvaluation}
                evaluationSubmitted={evaluationSubmitted}
                submissionResult={submissionResult}
                setStudentEvaluation={setStudentEvaluation}
                profile={studentProfile}
                onSubmit={handleStudentSubmit}
              />
            ) : (
              <StudentSection
                section={studentTab}
                activeEvaluation={activeEvaluation}
                submissionResult={submissionResult}
                studentEvaluation={studentEvaluation}
                evaluationStatus={
                  evaluationSubmitted ? "Completed" : "Not started"
                }
              />
            )}
          </>
        )}
        {mode === "faculty" && active !== "overview" && (
          <FacultyModuleView
            active={active}
            activeEvaluation={activeEvaluation}
            setActiveEvaluation={setActiveEvaluation}
            onStudentCountChange={setActiveStudentCount}
            activeEvaluations={activeEvaluations}
            students={adminStudents}
            onStudentsChange={setAdminStudents}
            onCreateStudent={createStudent}
          />
        )}
        <div
          className={`page-wrap ${mode === "student" || active !== "overview" ? "hidden" : ""}`}
        >
          <section className="page-heading">
            <div>
              <div className="eyebrow">THURSDAY, 03 SEPTEMBER 2026</div>
              <h1>
                Good morning, Admin <span className="wave">✦</span>
              </h1>
              <p>Here is what is happening across your laboratory today.</p>
            </div>
          </section>
          {notice && (
            <div className="notice">
              <span>✓</span>
              {notice}
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          <section className="stat-grid">
            <StatCard
              label="Active students"
              value={activeStudentCount}
              delta={
                lastWeekStudentCount
                  ? `${activeStudentCount >= lastWeekStudentCount ? "+" : ""}${(((activeStudentCount - lastWeekStudentCount) / lastWeekStudentCount) * 100).toFixed(1)}%`
                  : "No prior data"
              }
              detail={
                lastWeekStudentCount ? "vs. last week" : "weekly baseline"
              }
              icon="◉"
              tone="mint"
            />
            <StatCard
              label="Submissions today"
              value={submissionsToday}
              delta="No prior data"
              detail="daily baseline"
              icon="↗"
              tone="blue"
            />
            <StatCard
              label="Average score"
              value={averageScore}
              delta="No prior data"
              detail="assessment baseline"
              icon="✦"
              tone="yellow"
            />
            <StatCard
              label="Needs review"
              value={needsReview}
              delta="No prior data"
              detail="submission baseline"
              icon="!"
              tone="coral"
              negative
            />
          </section>
          <section className="content-grid">
            <div className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Live activity</h2>
                  <p>Real-time laboratory submissions</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActive("monitoring")}
                >
                  View all <span>→</span>
                </button>
              </div>
              <div className="activity-list">
                {activities.length ? (
                  activities.map((item) => (
                    <Activity key={`${item.name}-${item.time}`} item={item} />
                  ))
                ) : (
                  <div className="activity-empty">No submissions yet</div>
                )}
              </div>
              <div className="panel-footer">
                <span className="pulse" /> Monitoring is active{" "}
                <span className="footer-time">Last synced now</span>
              </div>
            </div>
            <div className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <h2>Performance overview</h2>
                  <p>Average score by assessment</p>
                </div>
                <button className="period-button">
                  Last 30 days <span>⌄</span>
                </button>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-dot green-dot" />
                  Average score
                </span>
                <span>
                  <i className="legend-dot gray-dot" />
                  Pass threshold
                </span>
              </div>
              <div className="chart">
                <div className="y-axis">
                  <span>100</span>
                  <span>80</span>
                  <span>60</span>
                  <span>40</span>
                  <span>20</span>
                </div>
                <div className="chart-body">
                  <div className="grid-lines">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="threshold" />
                  <svg
                    viewBox="0 0 500 160"
                    preserveAspectRatio="none"
                    className="line-chart"
                  >
                    <path
                      d="M0 108 C30 100 42 78 75 88 S115 105 145 76 S190 67 215 82 S255 94 280 60 S315 55 340 63 S382 85 405 44 S450 40 500 22"
                      fill="none"
                      stroke="#269b76"
                      strokeWidth="3"
                    />
                    <path
                      d="M0 108 C30 100 42 78 75 88 S115 105 145 76 S190 67 215 82 S255 94 280 60 S315 55 340 63 S382 85 405 44 S450 40 500 22 L500 160 L0 160 Z"
                      fill="url(#area)"
                      opacity=".26"
                    />
                    <defs>
                      <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#36b88d" />
                        <stop offset="1" stopColor="#36b88d" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="x-axis">
                    <span>05 Aug</span>
                    <span>12 Aug</span>
                    <span>19 Aug</span>
                    <span>26 Aug</span>
                    <span>03 Sep</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className="bottom-grid">
            <div className="panel module-panel">
              <div className="panel-heading">
                <div>
                  <h2>Evaluation modules</h2>
                  <p>System health at a glance</p>
                </div>
                <button className="text-button">
                  Manage <span>→</span>
                </button>
              </div>
              <div className="module-row">
                <Module
                  title="Code monitoring"
                  subtitle="Key presses & edit history"
                  value="98%"
                  status="Operational"
                  tone="green"
                />
                <Module
                  title="AI assessment engine"
                  subtitle="Skill & behavior analysis"
                  value="94%"
                  status="Operational"
                  tone="green"
                />
                <Module
                  title="Execution environment"
                  subtitle="Test case verification"
                  value="88%"
                  status="Degraded"
                  tone="amber"
                />
              </div>
            </div>
            <div className="panel rubric-panel">
              <div className="panel-heading">
                <div>
                  <h2>Current rubric</h2>
                  <p>CS301 · Data Structures</p>
                </div>
                <span className="edit-icon">✎</span>
              </div>
              <div className="rubric-items">
                <span>
                  Problem understanding <b>20%</b>
                </span>
                <span>
                  Algorithm design <b>25%</b>
                </span>
                <span>
                  Code efficiency <b>25%</b>
                </span>
                <span>
                  Debugging skill <b>30%</b>
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, delta, detail, icon, tone, negative }) {
  const isZeroBaseline = [
    "Active evaluations",
    "Completed",
    "Needs attention",
  ].includes(label);
  const isTotalStudents = label === "Total students";
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{isZeroBaseline ? 0 : value}</div>
      <div className={`stat-delta ${negative ? "negative" : ""}`}>
        {isZeroBaseline || isTotalStudents ? "No prior data" : delta}{" "}
        <span>
          {isZeroBaseline || isTotalStudents
            ? `${label.toLowerCase()} baseline`
            : detail}
        </span>
      </div>
    </div>
  );
}
function Landing({ onStudent, onAdmin }) {
  return (
    <div className="landing-shell">
      <div className="landing-content">
        <div className="brand landing-brand">
          <span className="brand-mark">LP</span>
          <span>LabPilot</span>
        </div>
        <div className="landing-kicker">SMART LABORATORY EVALUATION</div>
        <h1>Choose your workspace</h1>
        <p className="landing-subtitle">
          One platform for better coding assessments, clearer feedback, and
          confident learning.
        </p>
        <div className="role-cards">
          <button className="role-card" onClick={onStudent}>
            <span className="role-card-icon student-icon">◉</span>
            <span>
              <strong>Student portal</strong>
              <small>
                Work on coding challenges, track progress, and get AI feedback.
              </small>
            </span>
            <b>→</b>
          </button>
          <button className="role-card" onClick={onAdmin}>
            <span className="role-card-icon admin-icon">▦</span>
            <span>
              <strong>Admin portal</strong>
              <small>
                Monitor activity, assess submissions, and manage laboratory
                reports.
              </small>
            </span>
            <b>→</b>
          </button>
        </div>
        <div className="landing-footer">
          <span className="school-dot" /> Computer Science Lab <span>·</span>{" "}
          Secure workspace access
        </div>
      </div>
    </div>
  );
}
function StudentLogin({ onLogin, onBack }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError(await onLogin(username.trim(), password));
  };
  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand login-brand">
          <span className="brand-mark">LP</span>
          <span>LabPilot</span>
        </div>
        <div className="login-icon">◉</div>
        <div className="eyebrow">STUDENT PORTAL</div>
        <h1>Welcome to your lab</h1>
        <p>
          Sign in to continue your coding assessment and view your progress.
        </p>
        <label htmlFor="student-username">Username</label>
        <input
          id="student-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="e.g. aarav.shah"
          autoComplete="username"
          required
        />
        <label htmlFor="student-password">Password</label>
        <input
          id="student-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />
        {error && <div className="login-error">{error}</div>}
        <button
          className="primary-button login-button"
          type="submit"
          disabled={!username.trim() || !password}
        >
          Continue <span className="button-arrow">→</span>
        </button>
        <div className="login-options">
          <span>⌁</span> RFID or Face ID sign-in available
        </div>
        <button className="back-link" type="button" onClick={onBack}>
          Back to workspace selection
        </button>
      </form>
    </div>
  );
}
function AdminLogin({ onLogin, onBack }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError(await onLogin(username.trim(), password));
  };
  return (
    <div className="login-shell admin-login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand login-brand">
          <span className="brand-mark">LP</span>
          <span>LabPilot</span>
        </div>
        <div className="login-icon admin-login-icon">▦</div>
        <div className="eyebrow">ADMIN PORTAL</div>
        <h1>Welcome back, faculty</h1>
        <p>Sign in to monitor your laboratory and manage assessments.</p>
        <label htmlFor="admin-username">Username</label>
        <input
          id="admin-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="e.g. riya.mehta"
          autoComplete="username"
          required
        />
        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />
        {error && <div className="login-error">{error}</div>}
        <button
          className="primary-button login-button"
          type="submit"
          disabled={!username.trim() || !password}
        >
          Sign in to admin portal <span className="button-arrow">→</span>
        </button>
        <div className="login-options">
          <span>⌁</span> SSO and institutional login available
        </div>
        <button className="back-link" type="button" onClick={onBack}>
          Back to workspace selection
        </button>
      </form>
    </div>
  );
}
function AdminReportsView({ students, activeEvaluation }) {
  const downloadReport = (student) => {
    const report = [
      `LabPilot Test Report`,
      `Student: ${student[0]}`,
      `USN: ${student[1]}`,
      `Assigned lab: ${student[2]}`,
      `Test: ${activeEvaluation.name}`,
      `Test cases: ${activeEvaluation.testCases}`,
      `Status: ${student[4]}`,
      `Score: ${student[3]}`,
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([report], { type: "text/plain" }));
    link.download = `${student[1]}-${activeEvaluation.name.replace(/\s+/g, "-")}-report.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className="module-view management-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">REPORTS & EXPORTS</div>
          <h1>Student test reports</h1>
          <p>
            Download a report for every student and review all tests assigned by
            the administrator.
          </p>
        </div>
        <span className="status green">{students.length} students</span>
      </div>
      <div className="panel management-table report-table">
        <div className="panel-heading">
          <div>
            <h2>All student tests</h2>
            <p>Assigned test: {activeEvaluation.name}</p>
          </div>
          <span className="status green">
            {activeEvaluation.testCases} test cases
          </span>
        </div>
        <div className="directory-head">
          <span>STUDENT</span>
          <span>ASSIGNED LAB</span>
          <span>TEST</span>
          <span>STATUS</span>
          <span>ACTION</span>
        </div>
        {students.length ? (
          students.map((student) => (
            <div className="directory-row" key={student[1]}>
              <span className="directory-person">
                <span className="avatar directory-avatar">
                  {student[0]
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <span>
                  <strong>{student[0]}</strong>
                  <small>{student[1]}</small>
                </span>
              </span>
              <span>{student[2]}</span>
              <span>
                {activeEvaluation.name}
                <small className="report-test-detail">
                  {activeEvaluation.testCases} test cases
                </small>
              </span>
              <span className="status amber">{student[4]}</span>
              <button
                className="row-action"
                type="button"
                onClick={() => downloadReport(student)}
              >
                Download ↓
              </button>
            </div>
          ))
        ) : (
          <div className="report-empty">
            No student test reports available yet
          </div>
        )}
      </div>
    </div>
  );
}

function FacultyModuleView({
  active,
  activeEvaluation,
  setActiveEvaluation,
  onStudentCountChange,
  activeEvaluations,
  students,
  onStudentsChange,
  onCreateStudent,
}) {
  if (active === "monitoring") return <MonitoringView />;
  if (active === "students")
    return (
      <StudentManagementViewEditable
        onStudentCountChange={onStudentCountChange}
        activeEvaluations={activeEvaluations}
        students={students}
        onStudentsChange={onStudentsChange}
        onCreateStudent={onCreateStudent}
      />
    );
  if (active === "labs")
    return <TestBuilderView setActiveEvaluation={setActiveEvaluation} />;
  if (active === "faculty") return <FacultyDirectoryViewEditable />;
  if (active === "execution") return <ExecutionEvaluationView />;
  if (active === "storage") return <StorageView />;
  if (active === "scoring") return <ScoringView />;
  if (active === "rubric") return <RubricView />;
  if (active === "assessment") return <AssessmentView />;
  if (active === "analytics") return <PlagiarismView />;
  if (active === "reports")
    return (
      <AdminReportsView
        students={students}
        activeEvaluation={activeEvaluation}
      />
    );
  const content = {
    monitoring: {
      eyebrow: "LIVE OPERATIONS",
      title: "Activity monitoring",
      copy: "Watch coding sessions, edit history, and submission activity as it happens.",
      metric: "24",
      metricLabel: "students coding now",
      action: "Open live feed",
      rows: [
        ["Aarav Shah", "Binary Search Tree", "Editing"],
        ["Maya Patel", "File I/O & Exceptions", "Compiled"],
        ["Rohan Kumar", "Sorting Algorithms", "Review needed"],
      ],
    },
    assessment: {
      eyebrow: "AI POWERED REVIEW",
      title: "AI assessment engine",
      copy: "Review skill signals, debugging behavior, and plagiarism checks before scores are released.",
      metric: "94%",
      metricLabel: "engine confidence",
      action: "Start assessment run",
      rows: [
        ["Binary Search Tree", "24 submissions queued", "Ready"],
        ["Sorting Algorithms", "18 submissions scored", "Complete"],
        ["Data Structures", "07 items need review", "Review"],
      ],
    },
    execution: {
      eyebrow: "RUNTIME HEALTH",
      title: "Program execution",
      copy: "Verify test cases, compiler output, and runtime health across every laboratory environment.",
      metric: "88%",
      metricLabel: "environment health",
      action: "Run diagnostics",
      rows: [
        ["Python 3.12", "128 active environments", "Healthy"],
        ["Java 21", "24 active environments", "Healthy"],
        ["C++ 23", "12 active environments", "Degraded"],
      ],
    },
    reports: {
      eyebrow: "INSIGHTS & EXPORTS",
      title: "Reports & analytics",
      copy: "Turn assessment activity into clear performance reports for students, faculty, and administrators.",
      metric: "78.4",
      metricLabel: "average score",
      action: "Generate report",
      rows: [
        ["Weekly faculty report", "03 Sep 2026", "Ready"],
        ["CS301 student report", "128 students", "Ready"],
        ["Assessment archive", "August 2026", "Export"],
      ],
    },
  }[active];
  return (
    <div className="module-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">{content.eyebrow}</div>
          <h1>{content.title}</h1>
          <p>{content.copy}</p>
        </div>
        <button className="primary-button">
          {content.action} <span className="button-arrow">→</span>
        </button>
      </div>
      <section className="module-view-grid">
        <div className="panel module-hero-card">
          <span className="module-hero-icon">
            {modules.find((item) => item.id === active)?.icon}
          </span>
          <strong>{content.metric}</strong>
          <span>{content.metricLabel}</span>
          <div className="module-hero-line">
            <i />
          </div>
        </div>
        <div className="panel module-feed">
          <div className="panel-heading">
            <div>
              <h2>Current queue</h2>
              <p>Updated just now</p>
            </div>
            <span className="status green">Operational</span>
          </div>
          {content.rows.map((row) => (
            <div className="module-feed-row" key={row[0]}>
              <div>
                <strong>{row[0]}</strong>
                <span>{row[1]}</span>
              </div>
              <span
                className={`status ${row[2] === "Review needed" || row[2] === "Degraded" || row[2] === "Review" ? "red" : "green"}`}
              >
                {row[2]}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
function FacultyDirectoryViewEditable() {
  const [showForm, setShowForm] = useState(false);
  const [faculty, setFaculty] = useState([]);
  const [newFaculty, setNewFaculty] = useState({
    name: "",
    department: "",
    lab: "",
  });
  const addFaculty = (event) => {
    event.preventDefault();
    if (
      !newFaculty.name.trim() ||
      !newFaculty.department.trim() ||
      !newFaculty.lab.trim()
    )
      return;
    setFaculty([
      ...faculty,
      [
        newFaculty.name.trim(),
        newFaculty.department.trim(),
        newFaculty.lab.trim(),
      ],
    ]);
    setNewFaculty({ name: "", department: "", lab: "" });
    setShowForm(false);
  };
  return (
    <div className="module-view management-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">FACULTY MANAGEMENT</div>
          <h1>Faculty workspace</h1>
          <p>
            Manage teaching staff, lab ownership, and assessment
            responsibilities.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Close form" : "＋ Add faculty"}{" "}
          <span className="button-arrow">→</span>
        </button>
      </div>
      {showForm && (
        <form className="panel student-add-form" onSubmit={addFaculty}>
          <div className="panel-heading">
            <div>
              <h2>Add faculty</h2>
              <p>Enter the faculty member and assigned laboratory.</p>
            </div>
          </div>
          <div className="builder-fields">
            <label>
              Faculty name
              <input
                value={newFaculty.name}
                onChange={(event) =>
                  setNewFaculty({ ...newFaculty, name: event.target.value })
                }
                placeholder="e.g. Dr. Anika Rao"
                required
              />
            </label>
            <label>
              Department
              <input
                value={newFaculty.department}
                onChange={(event) =>
                  setNewFaculty({
                    ...newFaculty,
                    department: event.target.value,
                  })
                }
                placeholder="e.g. Computer Science"
                required
              />
            </label>
            <label>
              Assigned lab
              <input
                value={newFaculty.lab}
                onChange={(event) =>
                  setNewFaculty({ ...newFaculty, lab: event.target.value })
                }
                placeholder="e.g. CS301 · Data Structures"
                required
              />
            </label>
          </div>
          <button className="review-button" type="submit">
            Add faculty <span>→</span>
          </button>
        </form>
      )}
      <div className="panel management-table">
        <div className="panel-heading">
          <div>
            <h2>Faculty directory</h2>
            <p>Teaching staff and assigned labs</p>
          </div>
          <span className="status green">{faculty.length} faculty</span>
        </div>
        <div className="directory-head">
          <span>FACULTY</span>
          <span>DEPARTMENT</span>
          <span>ASSIGNED LAB</span>
          <span>STATUS</span>
          <span />
        </div>
        {faculty.map((member) => (
          <div className="directory-row" key={member[0]}>
            <span className="directory-person">
              <span className="avatar directory-avatar">
                {member[0]
                  .split(" ")
                  .slice(-2)
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span>
                <strong>{member[0]}</strong>
                <small>Faculty administrator</small>
              </span>
            </span>
            <span>{member[1]}</span>
            <span>{member[2]}</span>
            <span className="status green">Active</span>
            <button className="row-action" type="button">
              View →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FacultyDirectoryView() {
  return (
    <div className="module-view management-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">FACULTY MANAGEMENT</div>
          <h1>Faculty workspace</h1>
          <p>
            Manage teaching staff, lab ownership, and assessment
            responsibilities.
          </p>
        </div>
        <button className="primary-button">
          ＋ Add faculty <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="panel management-table">
        <div className="panel-heading">
          <div>
            <h2>Faculty directory</h2>
            <p>Teaching staff and assigned labs</p>
          </div>
          <span className="status green">8 faculty</span>
        </div>
        <div className="directory-head">
          <span>FACULTY</span>
          <span>DEPARTMENT</span>
          <span>ASSIGNED LAB</span>
          <span>STATUS</span>
          <span />
        </div>
        {[
          ["Dr. Riya Mehta", "Computer Science", "CS301 · Data Structures"],
          ["Prof. Anil Rao", "Information Science", "CS205 · OOP"],
          ["Dr. Kavya Nair", "Computer Science", "CS110 · Fundamentals"],
        ].map((faculty) => (
          <div className="directory-row" key={faculty[0]}>
            <span className="directory-person">
              <span className="avatar directory-avatar">
                {faculty[0]
                  .split(" ")
                  .slice(-2)
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span>
                <strong>{faculty[0]}</strong>
                <small>Faculty administrator</small>
              </span>
            </span>
            <span>{faculty[1]}</span>
            <span>{faculty[2]}</span>
            <span className="status green">Active</span>
            <button className="row-action">View →</button>
          </div>
        ))}
      </div>
    </div>
  );
}
function TestBuilderView({ setActiveEvaluation }) {
  const [name, setName] = useState("Sorting Algorithm");
  const [question, setQuestion] = useState(
    "Implement an efficient sorting algorithm and explain its time complexity.",
  );
  const [duration, setDuration] = useState(45);
  const [cases, setCases] = useState(defaultCases);
  const [published, setPublished] = useState(false);
  const updateCase = (index, column, value) =>
    setCases(
      cases.map((item, itemIndex) =>
        itemIndex === index
          ? item.map((cell, cellIndex) => (cellIndex === column ? value : cell))
          : item,
      ),
    );
  const publish = () => {
    setActiveEvaluation({
      name,
      question,
      duration,
      testCases: cases.length,
      cases,
      status: "Published",
    });
    setPublished(true);
  };
  return (
    <div className="module-view management-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">LAB & EXPERIMENT MANAGEMENT</div>
          <h1>Create and start a test</h1>
          <p>
            Add one question, ten input/output pairs, and a time limit before
            publishing the evaluation to students.
          </p>
        </div>
        <button className="primary-button" onClick={publish}>
          {published ? "Test published" : "Publish test"}{" "}
          <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="panel test-builder-panel">
        <div className="builder-top-fields">
          <label>
            Experiment name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Duration
            <select
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            >
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
            </select>
          </label>
        </div>
        <label className="question-field">
          Question / problem statement
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <div className="test-case-editor">
          <div className="panel-heading">
            <div>
              <h2>Test cases</h2>
              <p>Enter exactly ten inputs and their expected outputs</p>
            </div>
            <span className="status green">{cases.length} cases</span>
          </div>
          <div className="case-head">
            <span>#</span>
            <span>INPUT</span>
            <span>EXPECTED OUTPUT</span>
          </div>
          {cases.map((item, index) => (
            <div className="case-row" key={index}>
              <b>{index + 1}</b>
              <input
                value={item[0]}
                onChange={(event) => updateCase(index, 0, event.target.value)}
                aria-label={`Test ${index + 1} input`}
              />
              <input
                value={item[1]}
                onChange={(event) => updateCase(index, 1, event.target.value)}
                aria-label={`Test ${index + 1} expected output`}
              />
            </div>
          ))}
        </div>
        <div className="builder-checks">
          <label>
            <input type="checkbox" defaultChecked /> Auto-evaluate submissions
          </label>
          <label>
            <input type="checkbox" defaultChecked /> Enable AI feedback
          </label>
        </div>
        <button className="review-button" onClick={publish}>
          {published ? "Update published test" : "Save and publish test"}{" "}
          <span>→</span>
        </button>
      </div>
      {published && (
        <div className="notice">
          <span>✓</span> Test published with ten input/output checks and is
          available to students.
          <button onClick={() => setPublished(false)}>×</button>
        </div>
      )}
    </div>
  );
}
function PublishedLabManagementView({ setActiveEvaluation }) {
  const [name, setName] = useState("Sorting Algorithm");
  const [question, setQuestion] = useState(
    "Implement an efficient sorting algorithm and explain its time complexity.",
  );
  const [duration, setDuration] = useState("45");
  const [testCases, setTestCases] = useState("10");
  const [cases, setCases] = useState(defaultCases);
  const [published, setPublished] = useState(false);
  const publish = () => {
    setActiveEvaluation({
      name,
      question,
      duration: Number(duration),
      testCases: cases.length,
      cases,
      status: "Published",
    });
    setPublished(true);
  };
  return (
    <div className="module-view management-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">LAB & EXPERIMENT MANAGEMENT</div>
          <h1>Create and start a test</h1>
          <p>
            Write the question, define the cases used for evaluation, set the
            time limit, and publish it to students.
          </p>
        </div>
        <button className="primary-button" onClick={publish}>
          {published ? "Test published" : "Publish test"}{" "}
          <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="lab-management-grid">
        <div className="panel experiment-builder publish-builder">
          <div className="panel-heading">
            <div>
              <h2>Test configuration</h2>
              <p>Students will see this after publishing</p>
            </div>
            <span className={`status ${published ? "green" : "amber"}`}>
              {published ? "Published" : "Draft"}
            </span>
          </div>
          <label>
            Question / problem statement
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          <label>
            Experiment name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="builder-fields">
            <label>
              Duration
              <select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              >
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
              </select>
            </label>
            <label>
              Test cases
              <input
                type="number"
                min="1"
                value={testCases}
                onChange={(event) => setTestCases(event.target.value)}
              />
            </label>
          </div>
          <div className="builder-checks">
            <label>
              <input type="checkbox" defaultChecked /> Auto-evaluate submissions
            </label>
            <label>
              <input type="checkbox" defaultChecked /> Enable AI feedback
            </label>
          </div>
          <button className="review-button" onClick={publish}>
            {published ? "Update published test" : "Save and publish test"}{" "}
            <span>→</span>
          </button>
        </div>
        <div className="panel publish-preview">
          <div className="panel-heading">
            <div>
              <h2>Student preview</h2>
              <p>Live preview of the current test</p>
            </div>
            <span className="preview-live">STUDENT VIEW</span>
          </div>
          <div className="preview-label">CURRENT EVALUATION</div>
          <h3>{name}</h3>
          <p>{question}</p>
          <div className="preview-details">
            <span>◷ {duration} minutes</span>
            <span>◇ {testCases} cases</span>
          </div>
          <div className="publish-state">
            <span className="pulse" />{" "}
            {published
              ? "Available to students now"
              : "Not yet visible to students"}
          </div>
        </div>
      </div>
      {published && (
        <div className="notice">
          <span>✓</span> {name} is live. Students can open it from Current
          evaluation.<button onClick={() => setPublished(false)}>×</button>
        </div>
      )}
    </div>
  );
}
function StudentManagementView() {
  const [query, setQuery] = useState("");
  const [added, setAddedState] = useState(false);
  const [students, setStudents] = useState([]);
  const setAdded = (value) => {
    if (!value) {
      setAddedState(false);
      return;
    }
    const name = window.prompt("Enter student name");
    if (!name?.trim()) return;
    const usn = window.prompt("Enter student USN");
    if (!usn?.trim()) return;
    const semester = window.prompt("Enter semester");
    if (!semester?.trim()) return;
    const lab = window.prompt("Enter assigned lab");
    if (!lab?.trim()) return;
    setStudents([
      ...students,
      [
        name.trim(),
        usn.trim(),
        `${lab.trim()} · ${semester.trim()}`,
        "--",
        "In Progress",
      ],
    ]);
    setAddedState(true);
  };
  const [studentForm, setStudentForm] = useState({
    name: "",
    usn: "",
    semester: "",
    lab: "Data Structures",
    password: "",
  });
  const addStudent = (event) => {
    event.preventDefault();
    if (
      !studentForm.name.trim() ||
      !studentForm.usn.trim() ||
      !studentForm.semester.trim()
    )
      return;
    setStudents([
      ...students,
      [
        studentForm.name.trim(),
        studentForm.usn.trim(),
        `${studentForm.lab} · ${studentForm.semester.trim()}`,
        "--",
        "In Progress",
      ],
    ]);
    setStudentForm({ name: "", usn: "", semester: "", lab: "Data Structures" });
    setAddedState(false);
  };
  return (
    <div className="module-view management-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">STUDENT MANAGEMENT</div>
          <h1>Know every learner</h1>
          <p>
            Search profiles, review individual performance, and follow
            evaluation history across the laboratory.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => setAddedState(!added)}
        >
          {added ? "Close form" : "＋ Add student"}{" "}
          <span className="button-arrow">→</span>
        </button>
      </div>
      {added && (
        <form className="panel student-add-form" onSubmit={addStudent}>
          <div className="panel-heading">
            <div>
              <h2>Add student</h2>
              <p>Enter the student details to assign them to a laboratory.</p>
            </div>
          </div>
          <div className="builder-fields">
            <label>
              Student name
              <input
                value={studentForm.name}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, name: event.target.value })
                }
                placeholder="e.g. Neha Singh"
                required
              />
            </label>
            <label>
              Username (USN)
              <input
                value={studentForm.usn}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, usn: event.target.value })
                }
                placeholder="e.g. 1CS22CS031"
                required
              />
            </label>
            <label>
              Semester
              <input
                value={studentForm.semester}
                onChange={(event) =>
                  setStudentForm({
                    ...studentForm,
                    semester: event.target.value,
                  })
                }
                placeholder="e.g. 5th Semester"
                required
              />
            </label>
            <label>
              Assigned lab
              <select
                value={studentForm.lab}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, lab: event.target.value })
                }
              >
                <option>Data Structures</option>
                <option>Programming Fundamentals</option>
                <option>Object Oriented Programming</option>
              </select>
            </label>
          </div>
          <button className="review-button" type="submit">
            Add student <span>→</span>
          </button>
        </form>
      )}
      <div className="management-stats">
        <StatCard
          label="Total students"
          value={students.length}
          delta="+14"
          detail="this semester"
          icon="◉"
          tone="mint"
        />
        <StatCard
          label="Active evaluations"
          value="32"
          delta="+8.4%"
          detail="this week"
          icon="▷"
          tone="blue"
        />
        <StatCard
          label="Completed"
          value="186"
          delta="75%"
          detail="of total"
          icon="✓"
          tone="yellow"
        />
        <StatCard
          label="Needs attention"
          value="12"
          delta="-3"
          detail="this week"
          icon="!"
          tone="coral"
          negative
        />
      </div>
      <div className="panel management-table">
        <div className="panel-heading">
          <div>
            <h2>Student directory</h2>
            <p>Profiles and latest performance</p>
          </div>
          <div className="management-tools">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search students..."
              aria-label="Search students"
            />
            <button className="filter-button" type="button">
              ≡ Filter
            </button>
          </div>
        </div>
        <div className="directory-head">
          <span>STUDENT</span>
          <span>LAB</span>
          <span>PERFORMANCE</span>
          <span>STATUS</span>
          <span />
        </div>
        {visible.map((student) => (
          <div className="directory-row" key={student[1]}>
            <span className="directory-person">
              <span className="avatar directory-avatar">
                {student[0]
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span>
                <strong>{student[0]}</strong>
                <small>{student[1]}</small>
              </span>
            </span>
            <span>{student[2]}</span>
            <strong className="directory-score">{student[3]}</strong>
            <span
              className={`status ${student[4] === "In Progress" ? "amber" : "green"}`}
            >
              {student[4]}
            </span>
            <button className="row-action" type="button">
              View →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="module-view management-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">STUDENT MANAGEMENT</div>
          <h1>Know every learner</h1>
          <p>
            Search profiles, review individual performance, and follow
            evaluation history across the laboratory.
          </p>
        </div>
        <button className="primary-button" onClick={() => setAdded(true)}>
          ＋ Add student <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="management-stats">
        <StatCard
          label="Total students"
          value="248"
          delta="+14"
          detail="this semester"
          icon="◉"
          tone="mint"
        />
        <StatCard
          label="Active evaluations"
          value="32"
          delta="+8.4%"
          detail="this week"
          icon="▷"
          tone="blue"
        />
        <StatCard
          label="Completed"
          value="186"
          delta="75%"
          detail="of total"
          icon="✓"
          tone="yellow"
        />
        <StatCard
          label="Needs attention"
          value="12"
          delta="-3"
          detail="this week"
          icon="!"
          tone="coral"
          negative
        />
      </div>
      <div className="panel management-table">
        <div className="panel-heading">
          <div>
            <h2>Student directory</h2>
            <p>Profiles and latest performance</p>
          </div>
          <div className="management-tools">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search students..."
              aria-label="Search students"
            />
            <button className="filter-button">≡ Filter</button>
          </div>
        </div>
        <div className="directory-head">
          <span>STUDENT</span>
          <span>LAB</span>
          <span>PERFORMANCE</span>
          <span>STATUS</span>
          <span />
        </div>
        {visible.map((student) => (
          <div className="directory-row" key={student[1]}>
            <span className="directory-person">
              <span className="avatar directory-avatar">
                {student[0]
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span>
                <strong>{student[0]}</strong>
                <small>{student[1]}</small>
              </span>
            </span>
            <span>{student[2]}</span>
            <strong className="directory-score">{student[3]}</strong>
            <span
              className={`status ${student[4] === "In Progress" ? "amber" : "green"}`}
            >
              {student[4]}
            </span>
            <button className="row-action">View →</button>
          </div>
        ))}
      </div>
      {added && (
        <div className="notice">
          <span>✓</span>Student profile form is ready to add a new learner.
          <button onClick={() => setAdded(false)}>×</button>
        </div>
      )}
    </div>
  );
}
function StudentManagementViewEditable({
  onStudentCountChange,
  activeEvaluations,
  students,
  onStudentsChange,
  onCreateStudent,
}) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingUsn, setEditingUsn] = useState(null);
  const [formError, setFormError] = useState("");
  const [studentForm, setStudentForm] = useState({
    name: "",
    usn: "",
    semester: "",
    lab: "Data Structures",
    password: "",
  });
  const visible = students.filter(
    (student) =>
      student.join(" ").toLowerCase().includes(query.toLowerCase()) ||
      student[0].toLowerCase().includes(query.toLowerCase()),
  );
  const openAddForm = () => {
    setEditingUsn(null);
    setStudentForm({
      name: "",
      usn: "",
      semester: "",
      lab: "Data Structures",
      password: "",
    });
    setShowForm(true);
    setFormError("");
  };
  const openEditForm = (student) => {
    const [name, usn, labAndSemester] = student;
    const [lab, semester] = labAndSemester.split(" · ");
    setEditingUsn(usn);
    setStudentForm({
      name,
      usn,
      semester: semester || "Not specified",
      lab,
      password: "",
    });
    setShowForm(true);
    setFormError("");
  };
  const saveStudent = async (event) => {
    event.preventDefault();
    if (
      !studentForm.name.trim() ||
      !studentForm.usn.trim() ||
      !studentForm.semester.trim() ||
      (!editingUsn && !studentForm.password)
    )
      return;
    if (!editingUsn && onCreateStudent) {
      const error = await onCreateStudent(studentForm);
      if (error) {
        setFormError(error);
        return;
      }
    }
    const updatedStudent = [
      studentForm.name.trim(),
      studentForm.usn.trim(),
      `${studentForm.lab} · ${studentForm.semester.trim()}`,
      "--",
      "In Progress",
    ];
    onStudentsChange(
      editingUsn
        ? students.map((student) =>
            student[1] === editingUsn ? updatedStudent : student,
          )
        : [...students, updatedStudent],
    );
    if (!editingUsn) onStudentCountChange((count) => count + 1);
    setStudentForm({
      name: "",
      usn: "",
      semester: "",
      lab: "Data Structures",
      password: "",
    });
    setEditingUsn(null);
    setShowForm(false);
    setFormError("");
  };
  const deleteStudent = (usn) => {
    onStudentsChange(students.filter((student) => student[1] !== usn));
    onStudentCountChange((count) => Math.max(0, count - 1));
  };
  const passwordField = (
    <label>
      Password
      <input
        type="password"
        value={studentForm.password}
        onChange={(event) =>
          setStudentForm({ ...studentForm, password: event.target.value })
        }
        placeholder={
          editingUsn ? "Leave blank to keep current" : "Set student password"
        }
        required={!editingUsn}
        autoComplete="new-password"
      />
    </label>
  );
  return (
    <div className="module-view management-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">STUDENT MANAGEMENT</div>
          <h1>Know every learner</h1>
          <p>
            Search profiles, review individual performance, and follow
            evaluation history across the laboratory.
          </p>
        </div>
        <button className="primary-button" onClick={openAddForm}>
          ＋ Add student <span className="button-arrow">→</span>
        </button>
      </div>
      {showForm && (
        <form className="panel student-add-form" onSubmit={saveStudent}>
          <div className="panel-heading">
            <div>
              <h2>{editingUsn ? "Edit student" : "Add student"}</h2>
              <p>
                {editingUsn
                  ? "Update this student profile."
                  : "Enter the student details to assign them to a laboratory."}
              </p>
            </div>
          </div>
          {formError && <div className="login-error">{formError}</div>}
          <div className="builder-fields">
            <label>
              Student name
              <input
                value={studentForm.name}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, name: event.target.value })
                }
                required
              />
            </label>
            <label>
              Username (USN)
              <input
                value={studentForm.usn}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, usn: event.target.value })
                }
                required
              />
            </label>
            <label>
              Semester
              <input
                value={studentForm.semester}
                onChange={(event) =>
                  setStudentForm({
                    ...studentForm,
                    semester: event.target.value,
                  })
                }
                required
              />
            </label>
            <label>
              Assigned lab
              <select
                value={studentForm.lab}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, lab: event.target.value })
                }
              >
                <option>Data Structures</option>
                <option>Programming Fundamentals</option>
                <option>Object Oriented Programming</option>
              </select>
            </label>
            {passwordField}
          </div>
          <button className="review-button" type="submit">
            {editingUsn ? "Save changes" : "Add student"} <span>→</span>
          </button>
          <button
            className="row-action"
            type="button"
            onClick={() => setShowForm(false)}
          >
            Cancel
          </button>
        </form>
      )}
      <div className="management-stats">
        <StatCard
          label="Total students"
          value={students.length}
          delta="+14"
          detail="this semester"
          icon="◉"
          tone="mint"
        />
        <StatCard
          label="Active evaluations"
          value="32"
          delta="+8.4%"
          detail="this week"
          icon="▷"
          tone="blue"
        />
        <StatCard
          label="Completed"
          value="186"
          delta="75%"
          detail="of total"
          icon="✓"
          tone="yellow"
        />
        <StatCard
          label="Needs attention"
          value="12"
          delta="-3"
          detail="this week"
          icon="!"
          tone="coral"
          negative
        />
      </div>
      <div className="panel management-table">
        <div className="panel-heading">
          <div>
            <h2>Student directory</h2>
            <p>Profiles and latest performance</p>
          </div>
          <div className="management-tools">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search students..."
              aria-label="Search students"
            />
            <button className="filter-button" type="button">
              ≡ Filter
            </button>
          </div>
        </div>
        <div className="directory-head">
          <span>STUDENT</span>
          <span>LAB</span>
          <span>PERFORMANCE</span>
          <span>STATUS</span>
          <span>ACTIONS</span>
        </div>
        {visible.map((student) => (
          <div className="directory-row" key={student[1]}>
            <span className="directory-person">
              <span className="avatar directory-avatar">
                {student[0]
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span>
                <strong>{student[0]}</strong>
                <small>{student[1]}</small>
              </span>
            </span>
            <span>{student[2]}</span>
            <strong className="directory-score">{student[3]}</strong>
            <span
              className={`status ${student[4] === "In Progress" ? "amber" : "green"}`}
            >
              {student[4]}
            </span>
            <span className="student-row-actions">
              <button
                className="row-action"
                type="button"
                onClick={() => openEditForm(student)}
              >
                Edit
              </button>
              <button
                className="row-action delete-action"
                type="button"
                onClick={() => deleteStudent(student[1])}
              >
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LabManagementView() {
  const [created, setCreated] = useState(false);
  const labs = [
    ["CS301", "Data Structures", "05 experiments", "128 students", "Active"],
    [
      "CS205",
      "Object Oriented Programming",
      "08 experiments",
      "96 students",
      "Active",
    ],
    [
      "CS110",
      "Programming Fundamentals",
      "06 experiments",
      "112 students",
      "Draft",
    ],
  ];
  return (
    <div className="module-view management-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">LAB & EXPERIMENT MANAGEMENT</div>
          <h1>Shape the laboratory</h1>
          <p>
            Create labs, add experiments, configure problem statements, test
            cases, and evaluation durations from one place.
          </p>
        </div>
        <button className="primary-button" onClick={() => setCreated(true)}>
          ＋ Create lab <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="lab-management-grid">
        <div className="panel labs-list">
          <div className="panel-heading">
            <div>
              <h2>Laboratories</h2>
              <p>Active courses and experiment sets</p>
            </div>
            <span className="status green">3 labs</span>
          </div>
          {labs.map((lab) => (
            <div className="lab-row" key={lab[0]}>
              <span className="lab-code">{lab[0]}</span>
              <span>
                <strong>{lab[1]}</strong>
                <small>
                  {lab[2]} · {lab[3]}
                </small>
              </span>
              <span
                className={`status ${lab[4] === "Draft" ? "amber" : "green"}`}
              >
                {lab[4]}
              </span>
              <b>→</b>
            </div>
          ))}
        </div>
        <div className="panel experiment-builder">
          <div className="panel-heading">
            <div>
              <h2>Experiment builder</h2>
              <p>New experiment configuration</p>
            </div>
            <span className="edit-icon">✎</span>
          </div>
          <label>
            Experiment name
            <input defaultValue="Sorting Algorithm" />
          </label>
          <label>
            Problem statement
            <textarea defaultValue="Implement an efficient sorting algorithm and explain its complexity." />
          </label>
          <div className="builder-fields">
            <label>
              Duration
              <select defaultValue="45">
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </label>
            <label>
              Test cases
              <input type="number" defaultValue="10" />
            </label>
          </div>
          <div className="builder-checks">
            <label>
              <input type="checkbox" defaultChecked /> Auto-evaluate submissions
            </label>
            <label>
              <input type="checkbox" defaultChecked /> Enable AI feedback
            </label>
          </div>
          <button className="review-button" onClick={() => setCreated(true)}>
            Save experiment <span>→</span>
          </button>
        </div>
      </div>
      {created && (
        <div className="notice">
          <span>✓</span> Lab configuration saved successfully.
          <button onClick={() => setCreated(false)}>×</button>
        </div>
      )}
    </div>
  );
}
function normalizeSubmission(source) {
  return source.replace(/#.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function calculateSimilarity(firstSource, secondSource) {
  const firstTokens = new Set(
    normalizeSubmission(firstSource)
      .split(/[^a-z0-9_]+/)
      .filter(Boolean),
  );
  const secondTokens = new Set(
    normalizeSubmission(secondSource)
      .split(/[^a-z0-9_]+/)
      .filter(Boolean),
  );
  if (!firstTokens.size || !secondTokens.size) return 0;
  const intersection = [...firstTokens].filter((token) =>
    secondTokens.has(token),
  ).length;
  const union = new Set([...firstTokens, ...secondTokens]).size;
  return Math.round((intersection / union) * 100);
}

function PlagiarismView() {
  const [firstSource, setFirstSource] = useState("");
  const [secondSource, setSecondSource] = useState("");
  const similarity = calculateSimilarity(firstSource, secondSource);
  const hasComparison = Boolean(firstSource.trim() && secondSource.trim());
  const verdict =
    similarity >= 70
      ? "Review required"
      : similarity >= 40
        ? "Possible overlap"
        : "Low similarity";
  return (
    <div className="module-view plagiarism-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">AI ANALYTICS · ORIGINALITY</div>
          <h1>Compare submissions</h1>
          <p>
            Compare two student submissions after comments and formatting are
            normalized.
          </p>
        </div>
        <span
          className={`status ${hasComparison && similarity >= 70 ? "red" : "green"}`}
        >
          {hasComparison ? verdict : "Ready to compare"}
        </span>
      </div>
      <section className="plagiarism-grid">
        <div className="panel plagiarism-editor">
          <div className="panel-heading">
            <div>
              <h2>Submission A</h2>
              <p>Paste the first student solution</p>
            </div>
          </div>
          <textarea
            aria-label="Submission A"
            value={firstSource}
            onChange={(event) => setFirstSource(event.target.value)}
            placeholder="Paste code here..."
          />
        </div>
        <div className="panel plagiarism-editor">
          <div className="panel-heading">
            <div>
              <h2>Submission B</h2>
              <p>Paste the second student solution</p>
            </div>
          </div>
          <textarea
            aria-label="Submission B"
            value={secondSource}
            onChange={(event) => setSecondSource(event.target.value)}
            placeholder="Paste code here..."
          />
        </div>
      </section>
      <div className="panel similarity-result">
        <div>
          <div className="eyebrow">SIMILARITY SCORE</div>
          <strong>{hasComparison ? `${similarity}%` : "--"}</strong>
          <p>
            {hasComparison
              ? `${verdict}. This score is based on shared normalized tokens.`
              : "Enter two submissions to calculate similarity."}
          </p>
        </div>
        <div className="similarity-meter">
          <i>
            <em style={{ width: `${similarity}%` }} />
          </i>
          <span>70% review threshold</span>
        </div>
      </div>
    </div>
  );
}

function AnalyticsView() {
  return (
    <div className="module-view assessment-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">AI ANALYTICS · INSIGHTS</div>
          <h1>Understand learning patterns</h1>
          <p>
            Explore trends from student performance, code quality, and
            evaluation behavior.
          </p>
        </div>
        <button className="primary-button">
          Export insights <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="assessment-stats">
        <div className="assessment-stat">
          <span className="assessment-icon">✦</span>
          <div>
            <strong>94%</strong>
            <small>Model confidence</small>
          </div>
        </div>
        <div className="assessment-stat">
          <span className="assessment-icon blue-stat">↗</span>
          <div>
            <strong>78.4</strong>
            <small>Average performance</small>
          </div>
        </div>
        <div className="assessment-stat">
          <span className="assessment-icon yellow-stat">◌</span>
          <div>
            <strong>68</strong>
            <small>Patterns detected</small>
          </div>
        </div>
        <div className="assessment-stat">
          <span className="assessment-icon coral-stat">◇</span>
          <div>
            <strong>11</strong>
            <small>Recommendations</small>
          </div>
        </div>
      </div>
      <section className="module-view-grid">
        <div className="panel module-feed">
          <div className="panel-heading">
            <div>
              <h2>Learning signals</h2>
              <p>Signals identified across recent submissions</p>
            </div>
            <span className="status green">Updated now</span>
          </div>
          <div className="module-feed-row">
            <div>
              <strong>Algorithm design</strong>
              <span>Strong progress across CS301 submissions</span>
            </div>
            <span className="status green">Improving</span>
          </div>
          <div className="module-feed-row">
            <div>
              <strong>Debugging behavior</strong>
              <span>Students need more feedback on edge cases</span>
            </div>
            <span className="status amber">Watch</span>
          </div>
          <div className="module-feed-row">
            <div>
              <strong>Code efficiency</strong>
              <span>Most common opportunity in current cohort</span>
            </div>
            <span className="status amber">Review</span>
          </div>
        </div>
        <div className="panel module-hero-card">
          <span className="module-hero-icon">✦</span>
          <strong>81.6</strong>
          <span>Predicted next assessment average</span>
          <div className="module-hero-line">
            <i />
          </div>
        </div>
      </section>
    </div>
  );
}

function AssessmentView() {
  const [selected, setSelected] = useState("Aarav Shah");
  const [running, setRunning] = useState(false);
  const assessments = [
    ["Maya Patel", "File I/O & Exceptions", "89", "98%", "Scored", "green"],
    ["Rohan Kumar", "Sorting Algorithms", "64", "76%", "Needs review", "amber"],
    ["Sana Iyer", "Data Structures", "78", "91%", "Scored", "green"],
  ];
  const current =
    assessments.find((assessment) => assessment[0] === selected) ||
    assessments[0];
  const runAssessment = () => {
    setRunning(true);
    window.setTimeout(() => setRunning(false), 1100);
  };
  return (
    <div className="module-view assessment-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">AI ASSESSMENT ENGINE · MACHINE LEARNING</div>
          <h1>Assessment, with more insight</h1>
          <p>
            Combine rubric scoring with code quality, debugging behavior, and
            originality signals for a complete evaluation.
          </p>
        </div>
        <button className="primary-button" onClick={runAssessment}>
          {running ? "Assessing..." : "Run AI assessment"}{" "}
          <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="assessment-stats">
        <div className="assessment-stat">
          <span className="assessment-icon">✦</span>
          <div>
            <strong>94%</strong>
            <small>AI confidence</small>
          </div>
        </div>
        <div className="assessment-stat">
          <span className="assessment-icon blue-stat">▤</span>
          <div>
            <strong>68</strong>
            <small>Submissions assessed</small>
          </div>
        </div>
        <div className="assessment-stat">
          <span className="assessment-icon yellow-stat">◌</span>
          <div>
            <strong>11</strong>
            <small>Review recommendations</small>
          </div>
        </div>
        <div className="assessment-stat">
          <span className="assessment-icon coral-stat">◇</span>
          <div>
            <strong>02</strong>
            <small>Originality flags</small>
          </div>
        </div>
      </div>
      <section className="ml-models">
        <div className="panel model-health">
          <div className="panel-heading">
            <div>
              <h2>ML model health</h2>
              <p>Production models · Last retrained 28 Aug 2026</p>
            </div>
            <span className="status green">All systems healthy</span>
          </div>
          <div className="model-health-grid">
            <ModelMetric
              label="Skill prediction"
              score="96.2%"
              detail="accuracy"
              tone="green"
            />
            <ModelMetric
              label="Performance prediction"
              score="89.7%"
              detail="accuracy"
              tone="blue"
            />
            <ModelMetric
              label="Plagiarism detection"
              score="98.4%"
              detail="precision"
              tone="yellow"
            />
            <ModelMetric
              label="Behavior analysis"
              score="91.8%"
              detail="confidence"
              tone="coral"
            />
          </div>
        </div>
        <div className="panel prediction-card">
          <div className="panel-heading">
            <div>
              <h2>Next assessment forecast</h2>
              <p>ML prediction for CS301</p>
            </div>
            <span className="forecast-arrow">↗</span>
          </div>
          <strong>81.6</strong>
          <span className="forecast-copy">Predicted class average</span>
          <div className="forecast-graph">
            <i />
            <i />
            <i />
            <i />
            <i />
            <b />
          </div>
          <div className="forecast-foot">
            <span>
              Current <b>78.4</b>
            </span>
            <span>
              Confidence <b>87%</b>
            </span>
          </div>
        </div>
      </section>
      <section className="assessment-grid">
        <div className="panel assessment-queue">
          <div className="panel-heading">
            <div>
              <h2>Assessment queue</h2>
              <p>CS301 · Current submissions</p>
            </div>
            <span className="status green">AI engine online</span>
          </div>
          <div className="assessment-head">
            <span>STUDENT</span>
            <span>SCORE</span>
            <span>AI STATUS</span>
          </div>
          {assessments.map((assessment) => (
            <button
              className={`assessment-row ${selected === assessment[0] ? "selected" : ""}`}
              onClick={() => setSelected(assessment[0])}
              key={assessment[0]}
            >
              <span className="assessment-person">
                <span className={`avatar assessment-avatar ${assessment[5]}`}>
                  {assessment[0]
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <span>
                  <strong>{assessment[0]}</strong>
                  <small>{assessment[1]}</small>
                </span>
              </span>
              <strong className="assessment-score">
                {assessment[2]}
                <small>/100</small>
              </strong>
              <span className={`status ${assessment[5]}`}>{assessment[4]}</span>
            </button>
          ))}
        </div>
        <div className="panel assessment-detail">
          <div className="panel-heading">
            <div>
              <h2>{current[0]}</h2>
              <p>{current[1]} · AI evaluation</p>
            </div>
            <span className="ai-confidence">{current[3]} confidence</span>
          </div>
          <div className="score-summary">
            <div className="big-score">
              <strong>{current[2]}</strong>
              <span>Overall score</span>
            </div>
            <div className="rubric-score-list">
              <ScoreBar label="Problem understanding" value="88%" width="88%" />
              <ScoreBar label="Algorithm design" value="82%" width="82%" />
              <ScoreBar label="Code efficiency" value="76%" width="76%" />
            </div>
          </div>
          <div className="signal-grid">
            <div>
              <span>✦</span>
              <strong>Skill prediction</strong>
              <small>Strong algorithmic reasoning</small>
            </div>
            <div>
              <span>◌</span>
              <strong>Behavior analysis</strong>
              <small>Consistent iteration pattern</small>
            </div>
            <div>
              <span>◇</span>
              <strong>Plagiarism detection</strong>
              <small>92% code similarity clear</small>
            </div>
          </div>
          <button className="review-button">
            Open full evaluation <span>→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
function ModelMetric({ label, score, detail, tone }) {
  return (
    <div className="model-metric">
      <span className={`model-icon ${tone}`}>✦</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <b>{score}</b>
    </div>
  );
}
function StorageView() {
  const [archived, setArchived] = useState(false);
  const records = [
    ["Student database", "128 student profiles", "Synced 2 min ago"],
    ["Code repository", "4,862 source files", "Synced 30 sec ago"],
    ["Test cases", "1,248 validation cases", "Synced 5 min ago"],
    ["Evaluation records", "9,438 assessment events", "Synced 1 min ago"],
  ];
  return (
    <div className="module-view storage-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">DATA STORAGE</div>
          <h1>Everything accounted for</h1>
          <p>
            Keep student records, code submissions, test cases, and evaluation
            history organized and available when your team needs them.
          </p>
        </div>
        <div className="storage-actions">
          <button
            className="secondary-button"
            onClick={() => setArchived(!archived)}
          >
            {archived ? "Archive ready" : "Archive old records"}
          </button>
          <button className="primary-button">
            Export database <span className="button-arrow">→</span>
          </button>
        </div>
      </div>
      <div className="storage-stats">
        <StorageStat icon="▱" value="14.8 GB" label="Storage used of 50 GB" />
        <StorageStat icon="✓" value="99.9%" label="Database availability" />
        <StorageStat icon="◷" value="Today" label="Last automated backup" />
        <StorageStat icon="↗" value="2.4k" label="Records added this month" />
      </div>
      <section className="storage-grid">
        <div className="panel records-panel">
          <div className="panel-heading">
            <div>
              <h2>Connected repositories</h2>
              <p>Live data sources and record counts</p>
            </div>
            <span className="status green">All synced</span>
          </div>
          {records.map((record) => (
            <div className="record-row" key={record[0]}>
              <span className="record-icon">▤</span>
              <span>
                <strong>{record[0]}</strong>
                <small>
                  {record[1]} · {record[2]}
                </small>
              </span>
              <span className="status green">Healthy</span>
              <b>›</b>
            </div>
          ))}
        </div>
        <div className="panel backup-panel">
          <div className="panel-heading">
            <div>
              <h2>Backup & retention</h2>
              <p>Storage protection policy</p>
            </div>
            <span className="status green">Protected</span>
          </div>
          <div className="backup-ring">
            <strong>30</strong>
            <span>days retained</span>
          </div>
          <div className="backup-info">
            <span>
              <i className="timeline-dot green" />
              Daily backup <b>02:00 UTC</b>
            </span>
            <span>
              <i className="timeline-dot green" />
              Encrypted at rest <b>Enabled</b>
            </span>
            <span>
              <i className="timeline-dot amber" />
              Next archive <b>01 Oct 2026</b>
            </span>
          </div>
          <button className="review-button">
            Manage retention policy <span>→</span>
          </button>
        </div>
      </section>
      {archived && (
        <div className="notice">
          <span>✓</span>Archive request queued. Records older than 90 days will
          be preserved securely.
        </div>
      )}
    </div>
  );
}
function StorageStat({ icon, value, label }) {
  return (
    <div className="storage-stat">
      <span className="storage-icon">{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
      <i>
        <em />
      </i>
    </div>
  );
}
function ScoringView() {
  const [selected, setSelected] = useState("Aarav Shah");
  const [generated, setGenerated] = useState(false);
  const students = [
    ["Aarav Shah", "82", "Ready to release", "green"],
    ["Maya Patel", "89", "Released", "green"],
    ["Rohan Kumar", "64", "Manual review", "amber"],
    ["Sana Iyer", "78", "Ready to release", "green"],
  ];
  const current =
    students.find((student) => student[0] === selected) || students[0];
  return (
    <div className="module-view scoring-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">AUTOMATED SCORING MODULE</div>
          <h1>Scores that explain themselves</h1>
          <p>
            Generate consistent marks from the active rubric, then keep faculty
            in control of every release and adjustment.
          </p>
        </div>
        <button className="primary-button" onClick={() => setGenerated(true)}>
          {generated ? "Scores generated" : "Generate scores"}{" "}
          <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="scoring-stats">
        <div className="scoring-stat">
          <strong>68</strong>
          <small>Scores generated</small>
          <i>
            <em />
          </i>
        </div>
        <div className="scoring-stat">
          <strong>07</strong>
          <small>Awaiting review</small>
          <i>
            <em />
          </i>
        </div>
        <div className="scoring-stat">
          <strong>78.4</strong>
          <small>Class average</small>
          <i>
            <em />
          </i>
        </div>
        <div className="scoring-stat">
          <strong>96%</strong>
          <small>Rubric consistency</small>
          <i>
            <em />
          </i>
        </div>
      </div>
      <section className="scoring-grid">
        <div className="panel score-queue">
          <div className="panel-heading">
            <div>
              <h2>Score release queue</h2>
              <p>CS301 · Data Structures</p>
            </div>
            <span className="status green">Rubric active</span>
          </div>
          <div className="scoring-head">
            <span>STUDENT</span>
            <span>SCORE</span>
            <span>STATUS</span>
          </div>
          {students.map((student) => (
            <button
              className={`scoring-row ${selected === student[0] ? "selected" : ""}`}
              onClick={() => setSelected(student[0])}
              key={student[0]}
            >
              <span className="scoring-person">
                <span className="avatar scoring-avatar">
                  {student[0]
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <span>
                  <strong>{student[0]}</strong>
                  <small>Binary Search Tree</small>
                </span>
              </span>
              <strong className="scoring-score">
                {student[1]}
                <small>/100</small>
              </strong>
              <span className={`status ${student[3]}`}>{student[2]}</span>
            </button>
          ))}
        </div>
        <div className="panel score-detail">
          <div className="panel-heading">
            <div>
              <h2>{current[0]}'s score</h2>
              <p>Rubric-based mark generation</p>
            </div>
            <button className="edit-icon">✎</button>
          </div>
          <div className="score-detail-total">
            <strong>{current[1]}</strong>
            <span>/ 100</span>
            <small>Final recommended score</small>
          </div>
          <div className="weighted-rows">
            <WeightedRow
              label="Problem understanding"
              score="18 / 20"
              width="90%"
            />
            <WeightedRow label="Algorithm design" score="21 / 25" width="84%" />
            <WeightedRow label="Code efficiency" score="18 / 25" width="72%" />
            <WeightedRow label="Debugging skill" score="25 / 30" width="83%" />
          </div>
          <div className="score-explanation">
            <span>✦</span>
            <p>
              Score generated from rubric performance, test results, and AI
              assessment confidence.
            </p>
          </div>
          <button className="review-button">
            Release score <span>→</span>
          </button>
        </div>
      </section>
      <div className="distribution-panel panel">
        <div className="panel-heading">
          <div>
            <h2>Grade distribution</h2>
            <p>Current assessment · 68 submissions</p>
          </div>
          <span className="text-button">Export marks →</span>
        </div>
        <div className="distribution">
          <Distribution label="90–100" count="08" width="22%" color="high" />
          <Distribution label="80–89" count="21" width="58%" color="good" />
          <Distribution label="70–79" count="24" width="68%" color="mid" />
          <Distribution label="Below 70" count="15" width="43%" color="low" />
        </div>
      </div>
    </div>
  );
}
function WeightedRow({ label, score, width }) {
  return (
    <div className="weighted-row">
      <div>
        <span>{label}</span>
        <b>{score}</b>
      </div>
      <i>
        <em style={{ width }} />
      </i>
    </div>
  );
}
function Distribution({ label, count, width, color }) {
  return (
    <div className="distribution-row">
      <span>{label}</span>
      <i>
        <em className={color} style={{ width }} />
      </i>
      <b>{count}</b>
    </div>
  );
}
function RubricView() {
  const [weights, setWeights] = useState({
    understanding: 20,
    algorithm: 25,
    efficiency: 25,
    debugging: 30,
  });
  const [saved, setSaved] = useState(false);
  const updateWeight = (key, value) =>
    setWeights({
      ...weights,
      [key]: Math.max(0, Math.min(100, Number(value) || 0)),
    });
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return (
    <div className="module-view rubric-settings-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">RUBRIC & PARAMETERS</div>
          <h1>Define what good looks like</h1>
          <p>
            Shape how every submission is evaluated, scored, and reported across
            the laboratory.
          </p>
        </div>
        <button className="primary-button" onClick={() => setSaved(true)}>
          {saved ? "Changes saved" : "Save rubric"}{" "}
          <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="rubric-layout">
        <div className="panel criteria-panel">
          <div className="panel-heading">
            <div>
              <h2>CS301 · Data Structures</h2>
              <p>Active scoring criteria</p>
            </div>
            <span className={`status ${total === 100 ? "green" : "red"}`}>
              {total}% weighted
            </span>
          </div>
          <RubricWeight
            label="Problem understanding"
            description="Interprets requirements and identifies edge cases"
            value={weights.understanding}
            onChange={(value) => updateWeight("understanding", value)}
            color="green"
          />
          <RubricWeight
            label="Algorithm design"
            description="Chooses a correct and appropriately efficient approach"
            value={weights.algorithm}
            onChange={(value) => updateWeight("algorithm", value)}
            color="blue"
          />
          <RubricWeight
            label="Code efficiency"
            description="Uses time and memory resources thoughtfully"
            value={weights.efficiency}
            onChange={(value) => updateWeight("efficiency", value)}
            color="yellow"
          />
          <RubricWeight
            label="Debugging skill"
            description="Tests, diagnoses, and improves the implementation"
            value={weights.debugging}
            onChange={(value) => updateWeight("debugging", value)}
            color="coral"
          />
          {total !== 100 && (
            <div className="weight-warning">
              <span>!</span> Weights should add up to 100% before scores can be
              released.
            </div>
          )}
        </div>
        <div className="rubric-side">
          <div className="panel parameters-panel">
            <div className="panel-heading">
              <div>
                <h2>Evaluation parameters</h2>
                <p>Applied to all new submissions</p>
              </div>
              <span className="edit-icon">⚙</span>
            </div>
            <label className="parameter-toggle">
              <span>
                <strong>Minimum pass threshold</strong>
                <small>Students must reach this overall score</small>
              </span>
              <input type="number" defaultValue="50" min="0" max="100" />
              <b>%</b>
            </label>
            <label className="parameter-toggle">
              <span>
                <strong>Test case weighting</strong>
                <small>Include execution success in final score</small>
              </span>
              <input type="number" defaultValue="30" min="0" max="100" />
              <b>%</b>
            </label>
            <label className="parameter-toggle">
              <span>
                <strong>Documentation required</strong>
                <small>Check comments and explanation quality</small>
              </span>
              <input type="checkbox" defaultChecked />
            </label>
          </div>
          <div className="panel rubric-preview">
            <div className="panel-heading">
              <div>
                <h2>Score preview</h2>
                <p>How a 100-point mark is built</p>
              </div>
              <span className="preview-total">{total}</span>
            </div>
            <div className="preview-bars">
              <PreviewBar
                label="Understanding"
                value={weights.understanding}
                color="green"
              />
              <PreviewBar
                label="Algorithm"
                value={weights.algorithm}
                color="blue"
              />
              <PreviewBar
                label="Efficiency"
                value={weights.efficiency}
                color="yellow"
              />
              <PreviewBar
                label="Debugging"
                value={weights.debugging}
                color="coral"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function RubricWeight({ label, description, value, onChange, color }) {
  return (
    <div className="rubric-weight">
      <span className={`weight-dot ${color}`} />
      <div className="weight-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <input
        className="weight-number"
        type="number"
        min="0"
        max="100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <b>%</b>
    </div>
  );
}
function PreviewBar({ label, value, color }) {
  return (
    <div className="preview-bar">
      <span>{label}</span>
      <i>
        <em className={color} style={{ width: `${value * 3.33}%` }} />
      </i>
      <b>{value}%</b>
    </div>
  );
}
function ExecutionEvaluationView() {
  const [running, setRunning] = useState(false);
  const [runCount, setRunCount] = useState(12);
  const runTests = () => {
    setRunning(true);
    window.setTimeout(() => {
      setRunning(false);
      setRunCount(runCount + 1);
    }, 1000);
  };
  const testCases = [
    ["Insert root node", "Passed", "0.04s", "green"],
    ["Insert left branch", "Passed", "0.02s", "green"],
    ["Insert right branch", "Passed", "0.03s", "green"],
    ["Search missing value", "Failed", "0.08s", "red"],
    ["Balance validation", "Passed", "0.12s", "green"],
  ];
  return (
    <div className="module-view execution-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">PROGRAM EXECUTION EVALUATION</div>
          <h1>Verify every outcome</h1>
          <p>
            Run student programs against trusted test cases and validate
            correctness, output, and runtime performance.
          </p>
        </div>
        <button className="primary-button" onClick={runTests}>
          {running ? "Running tests..." : "Run test suite"}{" "}
          <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="execution-stats">
        <div className="execution-stat">
          <strong>11 / 12</strong>
          <small>Test cases passed</small>
          <i>
            <em />
          </i>
        </div>
        <div className="execution-stat">
          <strong>91.7%</strong>
          <small>Execution success</small>
          <i>
            <em />
          </i>
        </div>
        <div className="execution-stat">
          <strong>0.29s</strong>
          <small>Runtime duration</small>
          <i>
            <em />
          </i>
        </div>
        <div className="execution-stat">
          <strong>{runCount}</strong>
          <small>Runs today</small>
          <i>
            <em />
          </i>
        </div>
      </div>
      <section className="execution-grid">
        <div className="panel test-suite">
          <div className="panel-heading">
            <div>
              <h2>Test case verification</h2>
              <p>Aarav Shah · Binary Search Tree · Run #{runCount}</p>
            </div>
            <span className="status amber">1 failure</span>
          </div>
          <div className="test-head">
            <span>TEST CASE</span>
            <span>RESULT</span>
            <span>TIME</span>
          </div>
          {testCases.map((test) => (
            <div className="test-row" key={test[0]}>
              <span className="test-name">
                <i className={`test-icon ${test[3]}`}>
                  {test[3] === "green" ? "✓" : "×"}
                </i>
                <strong>{test[0]}</strong>
              </span>
              <span className={`status ${test[3]}`}>{test[1]}</span>
              <span className="test-time">{test[2]}</span>
            </div>
          ))}
          <div className="suite-footer">
            <span>
              <i className="test-icon green">✓</i> 11 passed
            </span>
            <span>
              <i className="test-icon red">×</i> 1 failed
            </span>
            <button className="text-button">
              View test input <span>→</span>
            </button>
          </div>
        </div>
        <div className="panel output-panel">
          <div className="panel-heading">
            <div>
              <h2>Runtime output</h2>
              <p>Captured from latest execution</p>
            </div>
            <span className="status green">Completed</span>
          </div>
          <div className="runtime-box">
            <div>
              <span>STDOUT</span>
              <span>0.29s</span>
            </div>
            <pre>
              Tree created successfully
              <br />
              In-order traversal: 2 4 6 8 10
              <br />
              <span className="output-error">Search(7) returned None</span>
            </pre>
          </div>
          <div className="evaluation-note">
            <span>✦</span>
            <div>
              <strong>Evaluation note</strong>
              <p>
                Core insertion logic works. Search should return a clear
                not-found result instead of None.
              </p>
            </div>
          </div>
          <button className="review-button" onClick={runTests}>
            Rerun failed cases <span>↻</span>
          </button>
        </div>
      </section>
    </div>
  );
}
function CompilationView() {
  const [filter, setFilter] = useState("All errors");
  const [selected, setSelected] = useState("TypeError");
  const errors = [
    [
      "TypeError",
      "Rohan Kumar",
      "sorting.py",
      "line 24",
      "Cannot compare int and NoneType",
      "High",
      "red",
    ],
    [
      "SyntaxError",
      "Neha Singh",
      "graph.py",
      "line 08",
      "Missing closing parenthesis",
      "Medium",
      "amber",
    ],
    [
      "TimeoutError",
      "Ishaan Verma",
      "bst.py",
      "runtime",
      "Execution exceeded 2 second limit",
      "Medium",
      "amber",
    ],
    [
      "ImportError",
      "Kavya Nair",
      "queue.py",
      "line 02",
      "Module not found: collectionsx",
      "Low",
      "green",
    ],
  ];
  const filtered =
    filter === "All errors"
      ? errors
      : errors.filter((error) => error[0] === filter);
  return (
    <div className="module-view compilation-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">COMPILATION & ERROR ANALYSIS</div>
          <h1>Find what stopped the code</h1>
          <p>
            Inspect compiler output, recurring errors, and failed test runs
            before they become blockers for student progress.
          </p>
        </div>
        <button className="primary-button">
          Run all compilations <span className="button-arrow">→</span>
        </button>
      </div>
      <div className="compile-stats">
        <div className="compile-stat success">
          <strong>92%</strong>
          <span>Compile success</span>
          <i>
            <em />
          </i>
        </div>
        <div className="compile-stat">
          <strong>86</strong>
          <span>Submissions checked</span>
          <i>
            <em />
          </i>
        </div>
        <div className="compile-stat danger">
          <strong>17</strong>
          <span>Errors detected</span>
          <i>
            <em />
          </i>
        </div>
        <div className="compile-stat">
          <strong>1.8s</strong>
          <span>Avg. compile time</span>
          <i>
            <em />
          </i>
        </div>
      </div>
      <section className="compile-grid">
        <div className="panel errors-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent compiler diagnostics</h2>
              <p>17 errors across 86 submissions</p>
            </div>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option>All errors</option>
              <option>TypeError</option>
              <option>SyntaxError</option>
              <option>TimeoutError</option>
              <option>ImportError</option>
            </select>
          </div>
          <div className="error-table-head">
            <span>ERROR</span>
            <span>STUDENT & FILE</span>
            <span>SEVERITY</span>
          </div>
          {filtered.map((error) => (
            <button
              className={`error-row ${selected === error[0] ? "selected" : ""}`}
              onClick={() => setSelected(error[0])}
              key={`${error[0]}-${error[1]}`}
            >
              <span className="error-type">
                <i className={`error-symbol ${error[6]}`}>!</i>
                <strong>{error[0]}</strong>
                <small>{error[4]}</small>
              </span>
              <span className="error-student">
                <strong>{error[1]}</strong>
                <small>
                  {error[2]} · {error[3]}
                </small>
              </span>
              <span className={`status ${error[6]}`}>{error[5]}</span>
            </button>
          ))}
        </div>
        <div className="panel diagnostic-panel">
          <div className="panel-heading">
            <div>
              <h2>{selected} detail</h2>
              <p>AI-assisted diagnosis</p>
            </div>
            <span className="ai-spark">✦</span>
          </div>
          <div className="diagnostic-code">
            <span className="diagnostic-label">COMPILER OUTPUT</span>
            <pre>
              Traceback (most recent call last):
              <br /> File <b>"sorting.py"</b>, line <b>24</b>
              <br />
              <span className="error-highlight">
                {" "}
                if current.value &lt; next_value:
              </span>
              <br />
              TypeError: {errors.find((error) => error[0] === selected)?.[4]}
            </pre>
          </div>
          <div className="diagnosis">
            <strong>Suggested next step</strong>
            <p>
              Check the value before comparing it. Add a guard for empty nodes,
              then run the affected test cases again.
            </p>
          </div>
          <button className="text-button">
            View submission <span>→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
function MonitoringView() {
  const [selected, setSelected] = useState("Aarav Shah");
  const sessions = [
    [
      "Aarav Shah",
      "AS",
      "Binary Search Tree",
      "Editing code",
      "12:04",
      "amber",
    ],
    [
      "Maya Patel",
      "MP",
      "File I/O & Exceptions",
      "Compiled successfully",
      "11:58",
      "green",
    ],
    [
      "Rohan Kumar",
      "RK",
      "Sorting Algorithms",
      "Idle for 2 min",
      "11:54",
      "red",
    ],
    ["Sana Iyer", "SI", "Data Structures", "Running tests", "11:49", "green"],
    ["Vivaan Rao", "VR", "Graph Traversal", "Editing code", "11:43", "amber"],
  ];
  return (
    <div className="module-view monitoring-view">
      <div className="module-view-heading">
        <div>
          <div className="eyebrow">CODING ACTIVITY MONITORING · LIVE</div>
          <h1>See every session in motion</h1>
          <p>
            Track student progress, edit history, and compilation signals across
            the active laboratory.
          </p>
        </div>
        <div className="monitoring-actions">
          <button className="secondary-button">Export activity</button>
          <button className="primary-button">
            Pause monitoring <span className="button-arrow">Ⅱ</span>
          </button>
        </div>
      </div>
      <div className="monitor-stats">
        <div className="monitor-stat">
          <span className="monitor-stat-icon">◉</span>
          <div>
            <strong>24</strong>
            <small>Students coding now</small>
          </div>
        </div>
        <div className="monitor-stat">
          <span className="monitor-stat-icon blue-stat">↗</span>
          <div>
            <strong>186</strong>
            <small>Edits in last 10 min</small>
          </div>
        </div>
        <div className="monitor-stat">
          <span className="monitor-stat-icon yellow-stat">▷</span>
          <div>
            <strong>92%</strong>
            <small>Compile success rate</small>
          </div>
        </div>
        <div className="monitor-stat">
          <span className="monitor-stat-icon coral-stat">!</span>
          <div>
            <strong>03</strong>
            <small>Attention signals</small>
          </div>
        </div>
      </div>
      <section className="monitor-grid">
        <div className="panel sessions-panel">
          <div className="panel-heading">
            <div>
              <h2>Active sessions</h2>
              <p>Live activity feed · Updated seconds ago</p>
            </div>
            <span className="status green">● Monitoring</span>
          </div>
          <div className="session-table-head">
            <span>STUDENT</span>
            <span>ACTIVITY</span>
            <span>LAST EVENT</span>
          </div>
          {sessions.map((session) => (
            <button
              className={`session-row ${selected === session[0] ? "selected" : ""}`}
              onClick={() => setSelected(session[0])}
              key={session[0]}
            >
              <span className="session-person">
                <span className={`avatar session-avatar ${session[5]}`}>
                  {session[1]}
                </span>
                <span>
                  <strong>{session[0]}</strong>
                  <small>{session[2]}</small>
                </span>
              </span>
              <span className={`session-activity ${session[5]}`}>
                <i />
                {session[3]}
              </span>
              <span className="session-time">
                {session[4]}
                <b>›</b>
              </span>
            </button>
          ))}
        </div>
        <div className="panel session-detail">
          <div className="panel-heading">
            <div>
              <h2>{selected}</h2>
              <p>Live code preview · bst.py</p>
            </div>
            <span className="status amber">Editing</span>
          </div>
          <div className="detail-meta">
            <span>
              <b>⌁</b> 42 keystrokes
            </span>
            <span>
              <b>↗</b> 3 test runs
            </span>
            <span>
              <b>◷</b> 18 min active
            </span>
          </div>
          <div className="code-editor monitor-editor">
            <div className="editor-top">
              <span>bst.py</span>
              <span>Python 3.12</span>
            </div>
            <pre>
              <code>
                <span className="line-number">7</span>{" "}
                <span className="code-keyword">def</span> insert(self, value):
                <br />
                <span className="line-number">8</span>{" "}
                <span className="code-keyword">if</span> value &lt; self.value:
                <br />
                <span className="line-number">9</span> self.left = Node(value)
                <br />
                <span className="line-number">10</span>{" "}
                <span className="code-keyword">else</span>:<br />
                <span className="line-number">11</span> self.right = Node(value)
                <br />
                <span className="line-number">12</span>
                <br />
                <span className="line-number">13</span>{" "}
                <span className="code-comment">
                  # AI signal: efficient branching
                </span>
              </code>
            </pre>
          </div>
          <div className="detail-timeline">
            <strong>Recent signals</strong>
            <span>
              <i className="timeline-dot green" />
              Test run passed · 12 cases <b>1m ago</b>
            </span>
            <span>
              <i className="timeline-dot amber" />
              Large edit block detected <b>3m ago</b>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
function AdminSidebar({ active, onNavigate, onLogout }) {
  const items = [
    ["overview", "▦", "Dashboard"],
    ["students", "◉", "Students"],
    ["faculty", "◎", "Faculty"],
    ["labs", "▱", "Labs"],
    ["assessment", "✓", "Evaluations"],
    ["analytics", "✦", "AI Analytics"],
    ["reports", "▤", "Reports"],
  ];
  return (
    <aside className="sidebar admin-sidebar">
      <div className="brand">
        <span className="brand-mark">LP</span>
        <span>LabPilot</span>
      </div>
      <div className="admin-school">
        <span className="school-dot" /> Computer Science Lab
      </div>
      <div className="side-label">ADMIN WORKSPACE</div>
      <nav>
        {items.map(([id, icon, label], index) => (
          <button
            key={`${label}-${index}`}
            className={`nav-item ${active === id ? "active" : ""}`}
            onClick={() => onNavigate(id)}
          >
            <span className="nav-icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="side-label settings-label">SYSTEM</div>
      <button
        className={`nav-item ${active === "rubric" ? "active" : ""}`}
        onClick={() => onNavigate("rubric")}
      >
        <span className="nav-icon">⚙</span>
        <span>Settings</span>
      </button>
      <div className="sidebar-footer">
        <div className="avatar user-avatar">DR</div>
        <div>
          <strong>Administrator</strong>
          <small>Admin workspace</small>
        </div>
        <button className="admin-logout" onClick={onLogout}>
          ↪
        </button>
      </div>
    </aside>
  );
}
function StudentSidebar({ active, onNavigate, onLogout, profile }) {
  const items = [
    ["dashboard", "▦", "Dashboard"],
    ["labs", "▤", "My labs"],
    ["evaluation", "▷", "Evaluations"],
    ["results", "✓", "Results"],
    ["reports", "▥", "Reports"],
    ["profile", "◎", "Profile"],
  ];
  return (
    <aside className="student-sidebar">
      <div className="brand">
        <span className="brand-mark">LP</span>
        <span>LabPilot</span>
      </div>
      <div className="student-user">
        <span className="avatar profile-avatar">AS</span>
        <span>
          <strong>{profile?.full_name || "Student"}</strong>
          <small>{profile?.usn || "Student account"}</small>
        </span>
      </div>
      <div className="student-side-label">MY SPACE</div>
      <nav>
        {items.map(([id, icon, label]) => (
          <button
            className={`student-nav-item ${active === id ? "active" : ""}`}
            onClick={() => onNavigate(id)}
            key={id}
          >
            {icon} <span>{label}</span>
            {id === "evaluation" && <em>1</em>}
          </button>
        ))}
      </nav>
      <div className="student-sidebar-footer">
        <span className="pulse" /> Lab session active
        <button onClick={onLogout}>
          ↪ <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
function PublishedEvaluationBanner({ evaluation }) {
  return (
    <div className="published-evaluation-banner">
      <div>
        <span className="eyebrow">PUBLISHED BY ADMIN</span>
        <strong>{evaluation.name}</strong>
        <p>{evaluation.question}</p>
      </div>
      <div className="published-details">
        <span>◷ {evaluation.duration} minutes</span>
        <span>◇ {evaluation.testCases} test cases</span>
        <span className="status green">{evaluation.status}</span>
      </div>
    </div>
  );
}
function StudentView({
  studentTab,
  setStudentTab,
  activeEvaluation,
  evaluationSubmitted,
  submissionResult,
  setStudentEvaluation,
  profile,
  onSubmit,
}) {
  const [runState, setRunState] = useState("Run code");
  const [submitted, setSubmitted] = useState(false);
  const [started, setStarted] = useState(false);
  const [evaluationStatus, setEvaluationStatus] = useState("Not started");
  const [remainingSeconds, setRemainingSeconds] = useState(
    activeEvaluation.duration * 60,
  );
  const [compileMessage, setCompileMessage] = useState("");
  const [runSummary, setRunSummary] = useState("");
  const [caseResults, setCaseResults] = useState([]);
  const [code, setCode] = useState(
    "def sortArray(nums: list[int]) -> list[int]:\n    # Base case: A list of 0 or 1 elements is already sorted\n    if len(nums) <= 1:\n        return nums\n\n    # Split the array into two halves\n    mid = len(nums) // 2\n    left_half = sortArray(nums[:mid])\n    right_half = sortArray(nums[mid:])\n\n    # Merge the sorted halves and return\n    return merge(left_half, right_half)\n\ndef merge(left: list[int], right: list[int]) -> list[int]:\n    sorted_array = []\n    i = j = 0\n\n    # Compare elements from both halves and merge them in order\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            sorted_array.append(left[i])\n            i += 1\n        else:\n            sorted_array.append(right[j])\n            j += 1\n\n    # Gather any remaining elements from the left or right halves\n    sorted_array.extend(left[i:])\n    sorted_array.extend(right[j:])\n\n    return sorted_array",
  );
  const studentName = profile?.full_name || "Student";
  const studentUsn = profile?.usn || "Student account";
  const studentSemester = profile?.semester || "Semester not specified";
  const studentLab = profile?.assigned_lab || "Computer Science Lab";
  useEffect(() => {
    setStudentEvaluation({ code, caseResults });
  }, [code, caseResults, setStudentEvaluation]);
  useEffect(() => {
    if (!started || evaluationStatus !== "In progress") return undefined;
    const timer = window.setInterval(() => {
      setRemainingSeconds((seconds) => {
        if (seconds <= 1) {
          setEvaluationStatus("Time expired");
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [started, evaluationStatus]);
  const formatTime = () =>
    `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const passedCount = caseResults.filter((result) => result.matched).length;
  const errorCount = caseResults.filter((result) => !result.matched).length;
  const score = submissionResult
    ? `${submissionResult.score}%`
    : caseResults.length
      ? `${Math.round((passedCount / caseResults.length) * 100)}%`
      : "--";
  const displayedErrorCount = submissionResult
    ? submissionResult.total - submissionResult.passed
    : errorCount;
  const timeUsed = started
    ? `${Math.max(0, activeEvaluation.duration - Math.ceil(remainingSeconds / 60))}m`
    : "0m";
  const displayedTimeUsed = submissionResult
    ? `${submissionResult.timeUsed}m`
    : timeUsed;
  useEffect(() => {
    if (evaluationStatus === "Completed") {
      onSubmit({
        passed: passedCount,
        total: caseResults.length,
        score: Math.round((passedCount / caseResults.length) * 100),
        timeUsed: Math.max(
          0,
          activeEvaluation.duration - Math.ceil(remainingSeconds / 60),
        ),
      });
      setStudentTab("results");
    }
  }, [
    evaluationStatus,
    onSubmit,
    setStudentTab,
    passedCount,
    caseResults.length,
  ]);
  const runCode = async () => {
    setStarted(true);
    setEvaluationStatus("In progress");
    setRunState("Running...");
    setCompileMessage("");
    setRunSummary("");
    setCaseResults([]);
    window.setTimeout(async () => {
      const sourceLines = code.split("\n");
      const executableCode = sourceLines
        .map((line) => line.split("#")[0])
        .join("\n");
      const lineNumber = (fragment) =>
        Math.max(
          1,
          sourceLines.findIndex((line) => line.includes(fragment)) + 1,
        );
      if (executableCode.match(/(^|\n)\s*pass\s*(#.*)?($|\n)/)) {
        setRunState("Failed");
        const line = lineNumber("pass");
        setCompileMessage(
          `SyntaxError: incomplete implementation\n  File "sorting.py", line ${line}\n    ${sourceLines[line - 1].trim()}\n    ^^^^^\nHint: replace pass with executable sorting logic.`,
        );
        return;
      }
      if (!executableCode.includes("def sortArray")) {
        setRunState("Failed");
        const line = lineNumber("def");
        setCompileMessage(
          `NameError: required function sortArray is missing\n  File "sorting.py", line ${line}\n    ${sourceLines[line - 1].trim()}\n    ^\nHint: define sortArray(nums) for this experiment.`,
        );
        return;
      }
      const cases = activeEvaluation.cases || defaultCases;
      const results = await executePythonCases(code, cases);
      setCaseResults(results);
      const passed = results.filter((result) => result.matched).length;
      setRunSummary(`${passed} of ${cases.length} published checks passed`);
      if (passed !== cases.length) {
        setRunState("Failed");
        setCompileMessage(
          `AssertionError: output did not match the expected result\n  File "sorting.py"\n  Published check ${results.findIndex((result) => !result.matched) + 1}\nHint: compare the returned array with the admin-provided expected output.`,
        );
        return;
      }
      setRunState("Passed");
    }, 900);
  };
  return (
    <div className="student-wrap">
      <section className="student-heading">
        <div>
          <div className="eyebrow">
            STUDENT DASHBOARD · COMPUTER SCIENCE LAB
          </div>
          <h1>
            Welcome back, {studentName} <span className="wave">✦</span>
          </h1>
          <p>USN: {studentUsn} · {studentSemester} · {studentLab}</p>
        </div>
        <div className="student-profile">
          <span className="avatar profile-avatar">AS</span>
          <span>
            <strong>{studentName}</strong>
            <small>Student ID · {studentUsn}</small>
          </span>
        </div>
      </section>
      <div className="student-tabs">
        <button
          className={studentTab === "dashboard" ? "active" : ""}
          onClick={() => setStudentTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={studentTab === "evaluation" ? "active" : ""}
          onClick={() => setStudentTab("evaluation")}
        >
          Current evaluation <span className="tab-live">LIVE</span>
        </button>
      </div>
      <div className="student-progress">
        <span style={{ width: "68%" }} />
      </div>
      {studentTab === "dashboard" && (
        <section className="student-metrics">
          <StudentMetric
            icon="★"
            label="Current score"
            value={score}
            tone="mint"
          />
          <StudentMetric
            icon="!"
            label="Errors found"
            value={displayedErrorCount}
            tone="coral"
          />
          <StudentMetric
            icon="◷"
            label="Time used"
            value={displayedTimeUsed}
            tone="yellow"
          />
        </section>
      )}
      {studentTab === "evaluation" && (
        <section className="current-evaluation panel">
          <div className="current-evaluation-copy">
            <div className="eyebrow">CURRENT EVALUATION · PUBLISHED TEST</div>
            <h2>{activeEvaluation.name}</h2>
            <p>{activeEvaluation.question}</p>
            <div className="evaluation-meta">
              <span className="live-timer">
                <b>◷</b>{" "}
                {evaluationStatus === "In progress"
                  ? `Time remaining · ${formatTime()}`
                  : `${activeEvaluation.duration} min duration`}
              </span>
              <span>
                <b>◇</b> {evaluationStatus}
              </span>
              <span>
                <b>▤</b> {activeEvaluation.testCases} published cases
              </span>
            </div>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              if (!started) {
                setStarted(true);
                setRemainingSeconds(activeEvaluation.duration * 60);
                setEvaluationStatus("In progress");
              }
            }}
            disabled={
              started ||
              evaluationStatus === "Completed" ||
              evaluationStatus === "Time expired"
            }
          >
            {evaluationStatus === "Completed"
              ? "Evaluation completed"
              : evaluationStatus === "Time expired"
                ? "Time expired"
                : started
                  ? "Evaluation in progress"
                  : "Start evaluation"}{" "}
            <span className="button-arrow">→</span>
          </button>
        </section>
      )}
      {studentTab === "evaluation" && (
        <section className="student-problem panel">
          <div>
            <div className="eyebrow">PROBLEM STATEMENT</div>
            <h2>{activeEvaluation.name}</h2>
            <p>{activeEvaluation.question}</p>
          </div>
          <span className="problem-tag">
            {activeEvaluation.testCases} test cases ·{" "}
            {activeEvaluation.duration} min
          </span>
        </section>
      )}
      {studentTab === "evaluation" && !evaluationSubmitted && (
        <section className="student-grid">
          <div className="panel coding-panel">
            <div className="panel-heading">
              <div>
                <h2>Today's challenge</h2>
                <p>{activeEvaluation.name} · Due today, 6:00 PM</p>
              </div>
              <span
                className={`status ${runState === "Failed" ? "red" : evaluationStatus === "Completed" ? "green" : "amber"}`}
              >
                {runState === "Failed" ? "Needs fixes" : evaluationStatus}
              </span>
            </div>
            <div className="challenge-copy">
              <h3>{activeEvaluation.name}</h3>
              <p>{activeEvaluation.question}</p>
            </div>
            <div className="code-editor">
              <div className="editor-top">
                <span>sorting.py</span>
                <span>Python 3.12</span>
                <span className="editor-save">Auto-saved</span>
              </div>
              <textarea
                aria-label="Python solution editor"
                spellCheck="false"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  setRunState("Run code");
                  setCompileMessage("");
                  setRunSummary("");
                  setCaseResults([]);
                  setEvaluationStatus("In progress");
                }}
              />
            </div>
            <div className="code-actions">
              <button
                className="secondary-button"
                onClick={runCode}
                disabled={evaluationStatus === "Completed"}
              >
                ▷ {runState}
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  if (runState === "Passed") {
                    setSubmitted(true);
                    setEvaluationStatus("Completed");
                  } else {
                    setCompileMessage(
                      "Run the code successfully before submitting the evaluation.",
                    );
                  }
                }}
                disabled={evaluationStatus === "Completed"}
              >
                {submitted ? "Submitted" : "Submit solution"}{" "}
                <span className="button-arrow">→</span>
              </button>
            </div>
            {runSummary && (
              <div
                className={
                  runState === "Passed" ? "compile-result" : "compile-error"
                }
              >
                <span>{runState === "Passed" ? "✓" : "×"}</span> {runSummary}
              </div>
            )}
            {caseResults.length > 0 && (
              <div className="student-case-results">
                <div className="case-result-head">
                  <span>INPUT</span>
                  <span>EXPECTED OUTPUT</span>
                  <span>YOUR OUTPUT</span>
                  <span>RESULT</span>
                </div>
                {caseResults.map((result, index) => (
                  <div
                    className="case-result-row"
                    key={`${result.input}-${index}`}
                  >
                    <code>{result.input}</code>
                    <code>{result.expected}</code>
                    <code>{result.actual}</code>
                    <span
                      className={result.matched ? "case-match" : "case-fail"}
                    >
                      {result.matched ? "✓ Match" : "× Failed"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {runState === "Failed" && compileMessage && (
              <div className="compile-error">
                <span>×</span> {compileMessage}
              </div>
            )}
            {submitted && (
              <div className="notice">
                <span>✓</span> Solution submitted for AI assessment{" "}
                <button onClick={() => setSubmitted(false)}>×</button>
              </div>
            )}
          </div>
          <div className="student-side">
            <div className="panel score-panel">
              <div className="panel-heading">
                <div>
                  <h2>Your progress</h2>
                  <p>Current semester</p>
                </div>
                <span className="progress-ring">78</span>
              </div>
              <div className="score-bars">
                <ScoreBar
                  label="Problem understanding"
                  value="86%"
                  width="86%"
                />
                <ScoreBar label="Algorithm design" value="74%" width="74%" />
                <ScoreBar label="Debugging skill" value="68%" width="68%" />
              </div>
              <button className="text-button">
                View detailed feedback <span>→</span>
              </button>
            </div>
            <div className="panel feedback-panel">
              <div className="panel-heading">
                <div>
                  <h2>Latest AI feedback</h2>
                  <p>From Sorting Algorithms</p>
                </div>
                <span className="ai-spark">✦</span>
              </div>
              <p className="feedback-quote">
                “Great problem solving. Consider reducing repeated comparisons
                in the merge step to improve code efficiency.”
              </p>
              <div className="feedback-footer">
                <span className="avatar feedback-avatar">AI</span>
                <span>Assessment engine · 4 min ago</span>
              </div>
            </div>
          </div>
        </section>
      )}
      {studentTab === "dashboard" && (
        <section className="student-bottom">
          <div
            className={`panel upcoming-panel ${evaluationSubmitted ? "has-history" : "empty-history"}`}
          >
            <div className="panel-heading">
              <div>
                <h2>Evaluation history</h2>
                <p>Your recent laboratory results</p>
              </div>
              <button className="text-button">
                View all <span>→</span>
              </button>
            </div>
            <div className="history-head">
              <span>EXPERIMENT</span>
              <span>SCORE</span>
              <span>TESTS</span>
              <span>DATE</span>
              <span>STATUS</span>
            </div>
            {evaluationSubmitted ? (
              <>
                <HistoryRow
                  name="Sorting Algorithms"
                  score="100%"
                  tests="10/10"
                  date="03 Sep"
                />
                <HistoryRow
                  name="Experiment 2 · Recursion"
                  score="72%"
                  tests="7/10"
                  date="01 Sep"
                />
              </>
            ) : (
              <div className="history-empty">No evaluation history yet</div>
            )}
          </div>
          <div className="student-side">
            <div className="student-tip">
              <span>✦</span>
              <div>
                <strong>AI feedback ready</strong>
                <p>Your detailed Experiment 2 report is ready to review.</p>
                <button className="text-button">View report →</button>
              </div>
            </div>
            <div className="panel report-panel">
              <div className="panel-heading">
                <div>
                  <h2>Reports</h2>
                  <p>Marks & feedback</p>
                </div>
                <span className="edit-icon">▤</span>
              </div>
              <button className="report-button">
                View detailed report <span>→</span>
              </button>
              <button className="report-button">
                Download PDF <span>↓</span>
              </button>
            </div>
          </div>
        </section>
      )}
      {!["dashboard", "evaluation"].includes(studentTab) && (
        <StudentSection
          section={studentTab}
          evaluationStatus={evaluationStatus}
        />
      )}
    </div>
  );
}
function StudentSection({
  section,
  activeEvaluation,
  submissionResult,
  studentEvaluation,
  evaluationStatus,
}) {
  const currentStatus =
    evaluationStatus === "Completed"
      ? "Completed"
      : evaluationStatus === "In progress"
        ? "In progress"
        : "Not started";
  const currentDetail =
    evaluationStatus === "Completed" && submissionResult
      ? `${submissionResult.score}% · Completed`
      : evaluationStatus === "In progress"
        ? "Pending evaluation"
        : "Due today";
  const content = {
    labs: {
      title: "My labs",
      description:
        "Tests assigned by your administrator and available in the laboratory.",
      rows: [
        [
          activeEvaluation.name,
          `${activeEvaluation.testCases} test cases · ${activeEvaluation.duration} minutes`,
          evaluationStatus === "Completed" ? "Completed" : "Assigned",
        ],
      ],
    },
    results: {
      title: "Results",
      description:
        "Review your marks, performance, and AI evaluation outcomes.",
      rows: submissionResult
        ? [
            [
              activeEvaluation.name,
              `${submissionResult.score}% · ${submissionResult.passed}/${submissionResult.total} tests passed`,
              "Completed",
            ],
          ]
        : [],
    },
    reports: {
      title: "Reports",
      description:
        "Access detailed marks, feedback, and downloadable evaluation records.",
      rows: [
        [
          "Lab performance report",
          "Overall score trend and progress snapshot",
          "Ready",
        ],
        ["Download PDF", "Evaluation record for faculty review", "Available"],
      ],
    },
    profile: {
      title: "Profile",
      description: "Your student identity and laboratory account details.",
      rows: [
        ["Student name", "Aarav Shah", "Verified"],
        ["Student ID", "1CS22CS014", "Verified"],
        ["Department", "Computer Science & Engineering", "Verified"],
        ["Semester", "5th Semester", "Verified"],
        ["Laboratory", "Computer Science Lab", "Active"],
      ],
    },
  }[section];
  const hasRows = content.rows.length > 0;
  const handleReportAction = (reportName) => {
    const outputLines = studentEvaluation.caseResults.flatMap(
      (result, index) => [
        `Test ${index + 1}: ${result.input}`,
        `Expected: ${result.expected}`,
        `Output: ${result.actual}`,
        `Result: ${result.matched ? "Passed" : "Failed"}`,
        "",
      ],
    );
    const lines = [
      reportName === "Download PDF"
        ? "LabPilot Evaluation Record"
        : "LabPilot Performance Report",
      "Student: Aarav Shah",
      "Student ID: 1CS22CS014",
      `Evaluation: ${activeEvaluation.name}`,
      `Current score: ${submissionResult?.score || 0}%`,
      `Evaluation status: ${evaluationStatus}`,
      "",
      "Submitted code:",
      ...studentEvaluation.code.split("\n"),
      "",
      "Test outputs:",
      ...(outputLines.length ? outputLines : ["No test output available"]),
    ];
    const pdf = createPdfBlob(lines);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(pdf);
    link.download = `${reportName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };

  return (
    <section className={`student-section ${section}-section`}>
      <div className="student-section-heading">
        <div>
          <div className="eyebrow">STUDENT PORTAL</div>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <div className="student-section-status">
          <span
            className={`status ${currentStatus === "Completed" ? "green" : currentStatus === "In progress" ? "amber" : "red"}`}
          >
            {currentStatus}
          </span>
          <small>{currentDetail}</small>
        </div>
      </div>
      <div
        className={`panel student-section-panel ${hasRows ? "has-data" : "empty-data"}`}
      >
        {content.rows.map((row) => (
          <button
            className={`student-section-row ${section === "reports" ? "report-action" : ""}`}
            type="button"
            key={row[0]}
            onClick={
              section === "reports"
                ? () => handleReportAction(row[0])
                : undefined
            }
          >
            <div>
              <strong>{row[0]}</strong>
              <small>{row[1]}</small>
            </div>
            <span
              className={`status ${row[2] === "In progress" ? "amber" : row[2] === "Pending" || row[2] === "Scheduled" ? "amber" : row[2] === "Live" || row[2] === "Ready" || row[2] === "Available" || row[2] === "Completed" || row[2] === "Verified" || row[2] === "Active" ? "green" : "amber"}`}
            >
              {row[2]}
            </span>
            <b>→</b>
          </button>
        ))}
      </div>
    </section>
  );
}
function createPdfBlob(lines) {
  const escapePdfText = (text) =>
    text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const pages = [];
  for (let index = 0; index < lines.length; index += 35)
    pages.push(lines.slice(index, index + 35));
  const pageNumbers = pages.map((_, index) => 4 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  pages.forEach((pageLines, index) => {
    const textCommands = pageLines
      .map(
        (line, lineIndex) =>
          `${lineIndex ? "0 -18 Td " : ""}(${escapePdfText(line)}) Tj`,
      )
      .join(" ");
    const stream = `BT /F1 10 Tf 50 740 Td ${textCommands} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageNumbers[index] + 1} 0 R >>`,
    );
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
function StudentMetric({ icon, label, value, tone }) {
  return (
    <div className="student-metric">
      <span className={`metric-icon ${tone}`}>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
function HistoryRow({ name, score, tests, date }) {
  return (
    <div className="history-row">
      <strong>{name}</strong>
      <span>{score}</span>
      <span>{tests}</span>
      <span>{date}</span>
      <span className="status green">Completed</span>
    </div>
  );
}
function ScoreBar({ label, value, width }) {
  return (
    <div className="score-bar">
      <div>
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <i>
        <em style={{ width }} />
      </i>
    </div>
  );
}
function Activity({ item }) {
  return (
    <div className="activity-row">
      <div className="avatar activity-avatar">{item.initials}</div>
      <div className="activity-info">
        <strong>{item.name}</strong>
        <span>{item.task}</span>
      </div>
      <span className={`status ${item.tone}`}>{item.status}</span>
      <span className="activity-time">{item.time}</span>
    </div>
  );
}
function Module({ title, subtitle, value, status, tone }) {
  return (
    <div className="module-row-item">
      <div className={`module-status ${tone}`} />
      <div className="module-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="module-score">
        <strong>{value}</strong>
        <span className={`status-text ${tone}`}>{status}</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);
