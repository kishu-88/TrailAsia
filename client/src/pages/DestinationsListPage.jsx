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
import DestinationForm from '../features/destinations/DestinationForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useList } from '../hooks/useList.js';
import * as destinationsService from '../services/destinations.service.js';
import { can } from '../utils/permissions.js';

export default function DestinationsListPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const list = useList(destinationsService.listDestinations, {
    initialFilters: { q: '', isActive: '' },
  });

  const columns = [
    {
      key: 'code',
      header: 'Code',
      width: '6rem',
      render: (destination) => (
        <Link to={`/destinations/${destination.id}`} className="link link--mono">
          {destination.code}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (destination) => (
        <div>
          <Link to={`/destinations/${destination.id}`} className="link">
            {destination.name}
          </Link>
          {!destination.isActive && (
            <>
              {' '}
              <Badge tone="neutral">Retired</Badge>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'region',
      header: 'Region',
      hideBelow: 'md',
      render: (destination) => destination.region || <span className="muted">—</span>,
    },
    {
      key: 'currencyCode',
      header: 'Currency',
      width: '7rem',
      hideBelow: 'md',
      render: (destination) => destination.currencyCode,
    },
    {
      key: 'maxAltitudeMetres',
      header: 'Max altitude',
      width: '9rem',
      align: 'right',
      render: (destination) =>
        destination.maxAltitudeMetres ? (
          `${destination.maxAltitudeMetres.toLocaleString()} m`
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];

  async function handleCreate(payload) {
    const destination = await destinationsService.createDestination(payload);
    setCreating(false);
    toast.success('Destination created.');
    navigate(`/destinations/${destination.id}`);
  }

  return (
    <>
      <PageHeader
        title="Destinations"
        subtitle="Where the agency runs programmes, and what each one requires."
        actions={
          can.editReference(user) && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New destination
            </Button>
          )
        }
      />

      <Card padded={false}>
        <div className="filter-bar">
          <TextField
            label="Search"
            placeholder="Name or code"
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
              { value: 'false', label: 'Retired' },
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
            emptyTitle="No destinations"
            emptyMessage="Destinations and their document rules drive every traveller checklist."
            emptyAction={
              can.editReference(user) && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  New destination
                </Button>
              )
            }
          />
        )}

        <div className="card__body card__body--tight">
          <Pagination meta={list.meta} page={list.page} onPageChange={list.setPage} />
        </div>
      </Card>

      <Modal open={creating} title="New destination" onClose={() => setCreating(false)}>
        <DestinationForm onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      </Modal>
    </>
  );
}
