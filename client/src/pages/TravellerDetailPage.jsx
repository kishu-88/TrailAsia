import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../components/common/Modal.jsx';
import Spinner from '../components/common/Spinner.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import ChecklistPanel from '../features/travellers/ChecklistPanel.jsx';
import DocumentsPanel from '../features/travellers/DocumentsPanel.jsx';
import PortalAccessPanel from '../features/travellers/PortalAccessPanel.jsx';
import TravellerForm from '../features/travellers/TravellerForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listDestinations } from '../services/destinations.service.js';
import { listTasks } from '../services/tasks.service.js';
import * as travellersService from '../services/travellers.service.js';
import { listUsers } from '../services/users.service.js';
import { daysUntil, formatDate } from '../utils/format.js';
import { can } from '../utils/permissions.js';

export default function TravellerDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [traveller, setTraveller] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [reviewTasks, setReviewTasks] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [busy, setBusy] = useState(false);

  const editable = can.editTrips(user);

  const loadDocuments = useCallback(async () => {
    const [documentsResponse, tasksResponse] = await Promise.all([
      travellersService.listDocuments(id),
      listTasks({ travellerId: id, category: 'documents', status: 'open', perPage: 100 }),
    ]);
    setDocuments(documentsResponse.data || []);
    setReviewTasks(tasksResponse.data || []);
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [travellerData, documentsResponse, destinationsResponse, tasksResponse, usersResponse] =
        await Promise.all([
          travellersService.getTraveller(id),
          travellersService.listDocuments(id),
          listDestinations({ isActive: 'true', perPage: 100 }),
          listTasks({ travellerId: id, category: 'documents', status: 'open', perPage: 100 }),
          // Only the roles that can own work are offered as reviewers, mirroring
          // the server's ASSIGNABLE_ROLES (see TasksPage's own assignee list).
          // `/users` is administrator-only on the server, so a non-admin viewer
          // gets a 403 here — caught locally so it just means an empty list
          // rather than failing the whole page load.
          listUsers({ isActive: 'true', perPage: 100 }).catch(() => ({ data: [] })),
        ]);
      setTraveller(travellerData);
      setDocuments(documentsResponse.data || []);
      setDestinations(destinationsResponse.data || []);
      setReviewTasks(tasksResponse.data || []);
      setAssignableUsers(
        (usersResponse.data || []).filter((row) =>
          ['consultant', 'coordinator', 'admin'].includes(row.role)
        )
      );
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
    const updated = await travellersService.updateTraveller(id, payload);
    setTraveller(updated);
    setEditing(false);
    toast.success('Traveller updated.');
  }

  async function handleDeactivate() {
    setBusy(true);
    try {
      const updated = traveller.isActive
        ? await travellersService.deactivateTraveller(id)
        : await travellersService.reactivateTraveller(id);
      setTraveller(updated);
      setDeactivating(false);
      toast.success(updated.isActive ? 'Traveller reactivated.' : 'Traveller deactivated.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner block label="Loading traveller…" />;
  if (error) return <ErrorNotice error={error} onRetry={load} />;
  if (!traveller) return null;

  const passportDays = daysUntil(traveller.passportExpiry);

  return (
    <>
      <PageHeader
        backTo="/travellers"
        backLabel="Travellers"
        title={traveller.fullName}
        subtitle={traveller.email || undefined}
        meta={
          !traveller.isActive && (
            <div className="page-header__badges">
              <Badge tone="neutral">Inactive</Badge>
            </div>
          )
        }
        actions={
          editable && (
            <>
              <Button onClick={() => setEditing(true)}>Edit</Button>
              <Button
                variant={traveller.isActive ? 'danger' : 'secondary'}
                onClick={() => setDeactivating(true)}
              >
                {traveller.isActive ? 'Deactivate' : 'Reactivate'}
              </Button>
            </>
          )
        }
      />

      <div className="detail-grid">
        <div className="detail-grid__main">
          <DocumentsPanel
            travellerId={id}
            documents={documents}
            destinations={destinations}
            reviewTasks={reviewTasks}
            assignableUsers={assignableUsers}
            canEdit={editable}
            canVerify={can.verifyDocuments(user)}
            onChange={loadDocuments}
          />

          <ChecklistPanel travellerId={id} destinations={destinations} />
        </div>

        <div className="detail-grid__side">
          <PortalAccessPanel
            traveller={traveller}
            canEdit={editable}
            onChange={load}
          />

          <Card title="Personal">
            <dl className="detail-list">
              <Row label="Phone" value={traveller.phone} />
              <Row label="Date of birth" value={formatDate(traveller.dateOfBirth)} />
              <Row label="Nationality" value={traveller.nationality} />
            </dl>
          </Card>

          <Card title="Passport">
            <dl className="detail-list">
              <Row
                label="Number"
                value={
                  traveller.passportNumber ? (
                    <span className="mono">{traveller.passportNumber}</span>
                  ) : (
                    'Not recorded'
                  )
                }
              />
              <Row label="Country" value={traveller.passportCountry} />
              <Row
                label="Expiry"
                value={
                  traveller.passportExpiry ? (
                    <>
                      {formatDate(traveller.passportExpiry)}{' '}
                      {passportDays < 0 ? (
                        <Badge tone="danger">Expired</Badge>
                      ) : passportDays < 183 ? (
                        <Badge tone="warning">Under 6 months</Badge>
                      ) : null}
                    </>
                  ) : (
                    'Not recorded'
                  )
                }
              />
            </dl>
            {traveller.passportMasked && (
              <p className="muted small">
                Your role sees a masked number. Consultants and coordinators, who complete
                visa applications, see it in full.
              </p>
            )}
          </Card>

          <Card title="Emergency contact">
            {traveller.emergencyContact ? (
              <dl className="detail-list">
                <Row label="Name" value={traveller.emergencyContact.name} />
                <Row label="Phone" value={traveller.emergencyContact.phone} />
                <Row label="Relationship" value={traveller.emergencyContact.relationship} />
              </dl>
            ) : (
              <p className="muted">
                None recorded. Worth chasing before departure — it is who the coordinator
                rings if something happens.
              </p>
            )}
          </Card>

          {(traveller.dietaryNotes || traveller.medicalNotes) && (
            <Card title="Notes">
              {traveller.dietaryNotes && (
                <>
                  <h3 className="form-section">Dietary</h3>
                  <p className="preserve-lines">{traveller.dietaryNotes}</p>
                </>
              )}
              {traveller.medicalNotes && (
                <>
                  <h3 className="form-section">Medical</h3>
                  <p className="preserve-lines">{traveller.medicalNotes}</p>
                  <p className="muted small">
                    Sensitive information under the Privacy Act 1988.
                  </p>
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={editing} title="Edit traveller" onClose={() => setEditing(false)}>
        <TravellerForm
          traveller={traveller}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </Modal>

      <ConfirmModal
        open={deactivating}
        title={traveller.isActive ? 'Deactivate this traveller?' : 'Reactivate this traveller?'}
        message={
          traveller.isActive
            ? 'They will be hidden from the default list. Nothing is deleted, and past bookings keep their record.'
            : 'They will appear in the active list again.'
        }
        confirmLabel={traveller.isActive ? 'Deactivate' : 'Reactivate'}
        variant={traveller.isActive ? 'danger' : 'primary'}
        loading={busy}
        onConfirm={handleDeactivate}
        onClose={() => setDeactivating(false)}
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
