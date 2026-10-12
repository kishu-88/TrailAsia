import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../components/common/Modal.jsx';
import Spinner from '../components/common/Spinner.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import DestinationForm from '../features/destinations/DestinationForm.jsx';
import RequirementsPanel from '../features/destinations/RequirementsPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as destinationsService from '../services/destinations.service.js';
import { can } from '../utils/permissions.js';

export default function DestinationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [destination, setDestination] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [busy, setBusy] = useState(false);

  const editable = can.editReference(user);

  const loadRequirements = useCallback(async () => {
    // Inactive rules are shown here so a coordinator can see the full picture;
    // checklists only ever use the active ones.
    const response = await destinationsService.listRequirements(id, { includeInactive: true });
    setRequirements(response.data || []);
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [destinationData, requirementsResponse] = await Promise.all([
        destinationsService.getDestination(id),
        destinationsService.listRequirements(id, { includeInactive: true }),
      ]);
      setDestination(destinationData);
      setRequirements(requirementsResponse.data || []);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpdate(payload) {
    const updated = await destinationsService.updateDestination(id, payload);
    setDestination(updated);
    setEditing(false);
    toast.success('Destination updated.');
  }

  async function handleRetire() {
    setBusy(true);
    try {
      const updated = destination.isActive
        ? await destinationsService.deactivateDestination(id)
        : await destinationsService.reactivateDestination(id);
      setDestination(updated);
      setRetiring(false);
      toast.success(updated.isActive ? 'Destination reactivated.' : 'Destination retired.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner block label="Loading destination…" />;
  if (error) return <ErrorNotice error={error} onRetry={load} />;
  if (!destination) return null;

  return (
    <>
      <PageHeader
        backTo="/destinations"
        backLabel="Destinations"
        title={destination.name}
        subtitle={[destination.code, destination.region].filter(Boolean).join(' · ')}
        meta={
          !destination.isActive && (
            <div className="page-header__badges">
              <Badge tone="neutral">Retired</Badge>
            </div>
          )
        }
        actions={
          editable && (
            <>
              <Button onClick={() => setEditing(true)}>Edit</Button>
              <Button
                variant={destination.isActive ? 'danger' : 'secondary'}
                onClick={() => setRetiring(true)}
              >
                {destination.isActive ? 'Retire' : 'Reactivate'}
              </Button>
            </>
          )
        }
      />

      <div className="detail-grid">
        <div className="detail-grid__main">
          <RequirementsPanel
            destinationId={id}
            requirements={requirements}
            canEdit={editable}
            onChange={loadRequirements}
          />
        </div>

        <div className="detail-grid__side">
          <Card title="Details">
            <dl className="detail-list">
              <Row label="Code" value={<span className="mono">{destination.code}</span>} />
              <Row label="Country" value={destination.countryCode} />
              <Row label="Region" value={destination.region} />
              <Row label="Currency" value={destination.currencyCode} />
              <Row
                label="Max altitude"
                value={
                  destination.maxAltitudeMetres
                    ? `${destination.maxAltitudeMetres.toLocaleString()} m`
                    : null
                }
              />
            </dl>
          </Card>

          {destination.advisoryNotes && (
            <Card title="Advisory notes" muted>
              <p className="preserve-lines">{destination.advisoryNotes}</p>
            </Card>
          )}
        </div>
      </div>

      <Modal open={editing} title="Edit destination" onClose={() => setEditing(false)}>
        <DestinationForm
          destination={destination}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </Modal>

      <ConfirmModal
        open={retiring}
        title={destination.isActive ? 'Retire this destination?' : 'Reactivate this destination?'}
        message={
          destination.isActive
            ? 'It will stop being offered on new itineraries. Existing bookings keep it, so past trips still make sense.'
            : 'It will be available for new itineraries again.'
        }
        confirmLabel={destination.isActive ? 'Retire' : 'Reactivate'}
        variant={destination.isActive ? 'danger' : 'primary'}
        loading={busy}
        onConfirm={handleRetire}
        onClose={() => setRetiring(false)}
      />
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="detail-list__row">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}
