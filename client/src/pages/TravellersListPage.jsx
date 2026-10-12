import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal from '../components/common/Modal.jsx';
import Pagination from '../components/common/Pagination.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { SelectField, TextField } from '../components/common/Field.jsx';
import TravellerForm from '../features/travellers/TravellerForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useList } from '../hooks/useList.js';
import * as travellersService from '../services/travellers.service.js';
import { daysUntil, formatDate } from '../utils/format.js';
import { can } from '../utils/permissions.js';

export default function TravellersListPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const list = useList(travellersService.listTravellers, {
    initialFilters: { q: '', isActive: 'true' },
  });

  const columns = [
    {
      key: 'fullName',
      header: 'Name',
      render: (traveller) => (
        <div>
          <Link to={`/travellers/${traveller.id}`} className="link">
            {traveller.fullName}
          </Link>
          {!traveller.isActive && (
            <>
              {' '}
              <Badge tone="neutral">Inactive</Badge>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Contact',
      hideBelow: 'md',
      render: (traveller) => (
        <div>
          {traveller.email || <span className="muted">No email</span>}
          {traveller.phone && <p className="muted table__sub">{traveller.phone}</p>}
        </div>
      ),
    },
    {
      key: 'nationality',
      header: 'Nationality',
      width: '7rem',
      hideBelow: 'md',
      render: (traveller) => traveller.nationality || <span className="muted">—</span>,
    },
    {
      key: 'passportExpiry',
      header: 'Passport expiry',
      width: '11rem',
      render: (traveller) => <PassportExpiry value={traveller.passportExpiry} />,
    },
  ];

  async function handleCreate(payload) {
    const traveller = await travellersService.createTraveller(payload);
    setCreating(false);
    toast.success('Traveller created.');
    navigate(`/travellers/${traveller.id}`);
  }

  return (
    <>
      <PageHeader
        title="Travellers"
        subtitle="Everyone the agency holds a record for."
        actions={
          can.editTrips(user) && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New traveller
            </Button>
          )
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
            emptyTitle={
              list.hasActiveFilters ? 'Nothing matches those filters' : 'No travellers yet'
            }
            emptyMessage={
              list.hasActiveFilters
                ? 'Try a different search, or clear the filters.'
                : 'Traveller records hold passports, insurance and health declarations.'
            }
            emptyAction={
              list.hasActiveFilters ? (
                <Button onClick={list.resetFilters}>Clear filters</Button>
              ) : (
                can.editTrips(user) && (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    New traveller
                  </Button>
                )
              )
            }
          />
        )}

        <div className="card__body card__body--tight">
          <Pagination meta={list.meta} page={list.page} onPageChange={list.setPage} />
        </div>
      </Card>

      <Modal open={creating} title="New traveller" onClose={() => setCreating(false)}>
        <TravellerForm onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      </Modal>
    </>
  );
}

/**
 * Passports need validity beyond the return date, not just beyond departure, so
 * one expiring within six months is worth flagging in the list rather than
 * leaving it to be discovered on a checklist two weeks before a trip.
 */
function PassportExpiry({ value }) {
  if (!value) return <span className="muted">Not recorded</span>;

  const days = daysUntil(value);
  const tone = days < 0 ? 'danger' : days < 183 ? 'warning' : null;

  return (
    <div>
      {formatDate(value)}
      {tone && (
        <p className="table__sub">
          <Badge tone={tone}>{days < 0 ? 'Expired' : 'Under 6 months'}</Badge>
        </p>
      )}
    </div>
  );
}
