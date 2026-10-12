import { useState } from 'react';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../components/common/Modal.jsx';
import Pagination from '../components/common/Pagination.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { SelectField, TextField } from '../components/common/Field.jsx';
import UserForm from '../features/users/UserForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useList } from '../hooks/useList.js';
import * as usersService from '../services/users.service.js';
import { ROLE_LABELS, formatDateTime } from '../utils/format.js';

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

/**
 * Staff accounts. Administrator-only — the route guard keeps other roles out and
 * the sidebar does not show the link.
 */
export default function StaffPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null); // { user, action }
  const [resetting, setResetting] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [busy, setBusy] = useState(false);

  const list = useList(usersService.listUsers, {
    initialFilters: { q: '', role: '', isActive: '' },
  });

  const columns = [
    {
      key: 'fullName',
      header: 'Name',
      render: (row) => (
        <div>
          <strong>{row.fullName}</strong>
          {String(row.id) === String(currentUser.id) && (
            <>
              {' '}
              <Badge tone="info">You</Badge>
            </>
          )}
          <p className="muted table__sub">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '12rem',
      render: (row) => ROLE_LABELS[row.role] || row.role,
    },
    {
      key: 'isActive',
      header: 'Status',
      width: '7rem',
      render: (row) =>
        row.isActive ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="neutral">Inactive</Badge>
        ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last sign-in',
      width: '13rem',
      hideBelow: 'md',
      render: (row) =>
        row.lastLoginAt ? formatDateTime(row.lastLoginAt) : <span className="muted">Never</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '15rem',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <Button size="small" variant="ghost" onClick={() => setEditing(row)}>
            Edit
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() => {
              setResetting(row);
              setNewPassword('');
              setPasswordError(null);
            }}
          >
            Password
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() =>
              setConfirming({ user: row, action: row.isActive ? 'deactivate' : 'reactivate' })
            }
          >
            {row.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      ),
    },
  ];

  async function handleCreate(payload) {
    await usersService.createUser(payload);
    setCreating(false);
    toast.success('Account created.');
    list.reload();
  }

  async function handleUpdate(payload) {
    await usersService.updateUser(editing.id, payload);
    setEditing(null);
    toast.success('Account updated.');
    list.reload();
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      if (confirming.action === 'deactivate') {
        await usersService.deactivateUser(confirming.user.id);
        toast.success('Account deactivated and their sessions ended.');
      } else {
        await usersService.reactivateUser(confirming.user.id);
        toast.success('Account reactivated.');
      }
      setConfirming(null);
      list.reload();
    } catch (caught) {
      // The API refuses to remove the last administrator, and refuses to let one
      // deactivate themselves. Both come back as readable messages.
      toast.error(caught.message);
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    setPasswordError(null);
    try {
      await usersService.resetUserPassword(resetting.id, newPassword);
      setResetting(null);
      setNewPassword('');
      toast.success('Password reset. Their other sessions have been signed out.');
    } catch (caught) {
      setPasswordError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Accounts are created here — there is no public sign-up."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New account
          </Button>
        }
      />

      <Card padded={false}>
        <div className="filter-bar">
          <TextField
            label="Search"
            placeholder="Name or email"
            value={list.filters.q}
            onChange={(event) => list.setFilter('q', event.target.value)}
          />
          <SelectField
            label="Role"
            value={list.filters.role}
            onChange={(event) => list.setFilter('role', event.target.value)}
            placeholder="Any role"
            options={ROLE_OPTIONS}
          />
          <SelectField
            label="Status"
            value={list.filters.isActive}
            onChange={(event) => list.setFilter('isActive', event.target.value)}
            placeholder="All"
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
          />
          {list.hasActiveFilters && (
            <div className="filter-bar__reset">
              <Button size="small" onClick={list.resetFilters}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {list.error ? (
          <div className="card__body">
            <ErrorNotice error={list.error} onRetry={list.reload} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={list.items}
            loading={list.loading}
            emptyTitle="No accounts match"
            emptyMessage="Try clearing the filters."
          />
        )}

        <div className="card__body card__body--tight">
          <Pagination meta={list.meta} page={list.page} onPageChange={list.setPage} />
        </div>
      </Card>

      <Modal open={creating} title="New staff account" onClose={() => setCreating(false)}>
        <UserForm onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      </Modal>

      <Modal open={Boolean(editing)} title="Edit account" onClose={() => setEditing(null)}>
        <UserForm user={editing} onSubmit={handleUpdate} onCancel={() => setEditing(null)} />
      </Modal>

      <Modal
        open={Boolean(resetting)}
        title="Reset password"
        description={resetting ? `For ${resetting.fullName}` : undefined}
        onClose={() => setResetting(null)}
        size="small"
        footer={
          <>
            <Button onClick={() => setResetting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleReset}
              loading={busy}
              disabled={newPassword.length < 12}
            >
              Reset password
            </Button>
          </>
        }
      >
        {passwordError && <ErrorNotice error={passwordError} />}
        <p className="muted">
          This signs them out everywhere. Give them the new password directly and ask them to
          change it once they are back in.
        </p>
        <TextField
          label="New password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={passwordError?.details?.password}
          hint="At least 12 characters."
          autoComplete="new-password"
        />
      </Modal>

      <ConfirmModal
        open={Boolean(confirming)}
        title={
          confirming?.action === 'deactivate' ? 'Deactivate this account?' : 'Reactivate account?'
        }
        message={
          confirming?.action === 'deactivate'
            ? `${confirming?.user.fullName} will be signed out immediately and unable to sign back in. Nothing they created is deleted.`
            : `${confirming?.user.fullName} will be able to sign in again.`
        }
        confirmLabel={confirming?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        variant={confirming?.action === 'deactivate' ? 'danger' : 'primary'}
        loading={busy}
        onConfirm={handleConfirm}
        onClose={() => setConfirming(null)}
      />
    </>
  );
}
