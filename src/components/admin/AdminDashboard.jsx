export default function AdminDashboard({ overview }) {
  if (!overview) return null;
  return (
    <div className="profile-grid">
      <div className="profile-stat"><b>{overview.totalUsers}</b><span>Total users</span></div>
      <div className="profile-stat"><b>{overview.totalAdmins}</b><span>Administrators</span></div>
      <div className="profile-stat"><b>{overview.disabledUsers}</b><span>Disabled accounts</span></div>
      <div className="profile-stat"><b>{overview.gamesPlayed}</b><span>Games played</span></div>
      <div className="profile-stat"><b>{overview.questionsAnswered}</b><span>Questions answered</span></div>
    </div>
  );
}
