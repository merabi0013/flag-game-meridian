import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  fetchOverview,
  fetchUsers,
  fetchUserDetail,
  createUser,
  updateUser,
  deleteUser,
  fetchAuditLog,
  fetchAdminMultiplayerGames,
  fetchAdminPaidCategories,
  updateAdminPaidCategory,
  AdminApiError,
} from '../utils/adminApi';
import AdminDashboard from '../components/admin/AdminDashboard';
import UserTable from '../components/admin/UserTable';
import UserEditor from '../components/admin/UserEditor';
import CreateUserForm from '../components/admin/CreateUserForm';
import AuditLogList from '../components/admin/AuditLogList';
import MultiplayerGamesList from '../components/admin/MultiplayerGamesList';
import GameCategoriesList from '../components/admin/GameCategoriesList';
import Button from '../components/Button';

/**
 * IMPORTANT: everything in this component is UX convenience, not
 * security. Hiding the "Administrative Panel" link for non-admins
 * (Profile.jsx) and showing "Access denied" here if user.isAdmin is
 * false are both purely cosmetic — the actual boundary is
 * server/middleware/requireAdmin.js, which independently re-checks
 * req.user.is_admin from the database on every /api/admin/* request
 * regardless of what this component thinks. If someone bypasses this
 * component entirely and calls the API directly, they get exactly the
 * same 401/403 a browser would.
 */
export default function AdminPanel() {
  const { user, checked } = useAuthContext();
  const showToast = useToast();

  const [accessDenied, setAccessDenied] = useState(false);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [auditEntries, setAuditEntries] = useState([]);
  const [multiplayerGames, setMultiplayerGames] = useState([]);
  const [gameCategories, setGameCategories] = useState([]);

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleApiError = useCallback((err) => {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      setAccessDenied(true);
      return true;
    }
    return false;
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await fetchOverview());
    } catch (err) {
      if (!handleApiError(err)) showToast('Could not load the dashboard overview.');
    }
  }, [handleApiError, showToast]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await fetchUsers({ search, page, pageSize: 20 });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      if (!handleApiError(err)) showToast('Could not load the user list.');
    } finally {
      setLoadingUsers(false);
    }
  }, [search, page, handleApiError, showToast]);

  const loadAuditLog = useCallback(async () => {
    try {
      const data = await fetchAuditLog(15);
      setAuditEntries(data.entries);
    } catch (err) {
      handleApiError(err);
    }
  }, [handleApiError]);

  const loadMultiplayerGames = useCallback(async () => {
    try {
      const data = await fetchAdminMultiplayerGames({ page: 1, pageSize: 15 });
      setMultiplayerGames(data.games);
    } catch (err) {
      handleApiError(err);
    }
  }, [handleApiError]);

  const loadGameCategories = useCallback(async () => {
    try {
      const data = await fetchAdminPaidCategories();
      setGameCategories(data.categories);
    } catch (err) {
      handleApiError(err);
    }
  }, [handleApiError]);

  async function handleSaveGameCategory(categoryId, patch) {
    await updateAdminPaidCategory(categoryId, patch);
    await loadGameCategories();
  }

  // Client-side gate is UX only (see the block comment above) — but there
  // is no reason to even attempt the calls if we already know the
  // signed-in user isn't flagged as an admin.
  useEffect(() => {
    if (!checked) return;
    if (!user || !user.isAdmin) {
      setAccessDenied(true);
      return;
    }
    loadOverview();
    loadAuditLog();
    loadMultiplayerGames();
    loadGameCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user]);

  useEffect(() => {
    if (!checked || !user || !user.isAdmin) return;
    loadUsers();
  }, [checked, user, loadUsers]);

  async function handleSelectUser(id) {
    setSelectedUserId(id);
    setDetailLoading(true);
    setDetailError(null);
    setSelectedDetail(null);
    try {
      const data = await fetchUserDetail(id);
      setSelectedDetail(data);
    } catch (err) {
      if (!handleApiError(err)) setDetailError(err.message || 'Could not load this user.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSave(id, patch) {
    setSaving(true);
    try {
      await updateUser(id, patch);
      showToast('Changes saved.');
      await Promise.all([loadUsers(), loadAuditLog(), handleSelectUser(id)]);
    } catch (err) {
      if (handleApiError(err)) return;
      throw err; // let UserEditor show the inline form error
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteUser(id);
      showToast('User deleted.');
      if (selectedUserId === id) {
        setSelectedUserId(null);
        setSelectedDetail(null);
      }
      await Promise.all([loadUsers(), loadOverview(), loadAuditLog()]);
    } catch (err) {
      if (!handleApiError(err)) showToast(err.message || 'Could not delete user.');
    }
  }

  async function handleCreate(payload) {
    const result = await createUser(payload);
    showToast('User created.');
    setShowCreateForm(false);
    await Promise.all([loadUsers(), loadOverview(), loadAuditLog()]);
    return result;
  }

  if (accessDenied) {
    return (
      <main className="admin-shell">
        <div className="container admin-denied">
          <h2>Administrator access required</h2>
          <p>This page is restricted to administrators.</p>
          <Link to="/profile" className="btn btn-primary" style={{ marginTop: 16 }}>
            Back to profile
          </Link>
        </div>
      </main>
    );
  }

  if (!checked || !user) {
    return (
      <main className="admin-shell">
        <div className="container state-block">
          <div className="spinner" />
        </div>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <div className="container">
        <section className="admin-section">
          <h2>Administrative Panel</h2>
          <p className="panel-sub">Application data only — see README for what this deliberately does not expose.</p>
          <AdminDashboard overview={overview} />
        </section>

        <section className="admin-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h2 style={{ marginBottom: 0 }}>User management</h2>
            {!showCreateForm && (
              <Button variant="primary" size="sm" onClick={() => setShowCreateForm(true)}>
                + Create user
              </Button>
            )}
          </div>

          {showCreateForm && (
            <div style={{ marginBottom: 16 }}>
              <CreateUserForm onCreate={handleCreate} onCancel={() => setShowCreateForm(false)} />
            </div>
          )}

          <div className="panel" style={{ marginBottom: 16 }}>
            {loadingUsers ? (
              <div className="spinner" />
            ) : (
              <UserTable
                users={users}
                pagination={pagination}
                search={search}
                onSearchChange={(v) => { setSearch(v); setPage(1); }}
                onPageChange={setPage}
                selectedId={selectedUserId}
                onSelectUser={handleSelectUser}
                onDeleteUser={handleDelete}
                currentUserId={user.id}
              />
            )}
          </div>

          {selectedUserId && (
            <UserEditor
              userId={selectedUserId}
              detail={selectedDetail}
              loading={detailLoading}
              error={detailError}
              saving={saving}
              onSave={handleSave}
              onDelete={handleDelete}
              onClose={() => { setSelectedUserId(null); setSelectedDetail(null); }}
              currentUserId={user.id}
            />
          )}
        </section>

        <section className="admin-section">
          <h2>Game categories</h2>
          <p className="panel-sub">
            Every paid or free-but-toggleable category (World 1914, Historical maps) lives here. Toggling Premium
            or Enabled takes effect immediately for every player — see README "Historical categories" for how
            this reuses the same entitlement system as everything else.
          </p>
          <GameCategoriesList categories={gameCategories} onSave={handleSaveGameCategory} />
        </section>

        <section className="admin-section">
          <h2>Multiplayer games</h2>
          <p className="panel-sub">Pass-and-play games completed by any authenticated host.</p>
          <MultiplayerGamesList games={multiplayerGames} />
        </section>

        <section className="admin-section">
          <h2>Recent admin activity</h2>
          <AuditLogList entries={auditEntries} />
        </section>
      </div>
    </main>
  );
}
