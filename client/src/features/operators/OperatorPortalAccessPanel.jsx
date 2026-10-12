import { useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import Modal, { ConfirmModal } from '../../components/common/Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { issueOperatorPortalInvite, revokeOperatorPortalAccess } from '../../services/operators.service.js';
import { formatDateTime } from '../../utils/format.js';

const STATE_LABEL = {
  not_invited: ['neutral', 'No access'],
  invited: ['info', 'Invitation sent'],
  invite_expired: ['warning', 'Invitation expired'],
  active: ['success', 'Active'],
  suspended: ['warning', 'Suspended'],
};

/**
 * Portal access for one operator, from the staff side.
 *
 * Mirrors PortalAccessPanel (the traveller version) exactly — same one-time
 * invitation link, same reasoning for showing it once and not storing it
 * anywhere readable later. The operator signs in with their contact email,
 * so that has to exist before an invitation can be sent.
 */
export default function OperatorPortalAccessPanel({ operator, canEdit, onChange }) {
  const toast = useToast();
  const [invite, setInvite] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const portal = operator.portal || { state: 'not_invited' };
  const [tone, label] = STATE_LABEL[portal.state] || STATE_LABEL.not_invited;

  const activationUrl = invite
    ? `${window.location.origin}/operator/activate?token=${invite.inviteToken}`
    : '';

  async function handleInvite() {
    setBusy(true);
    try {
      setInvite(await issueOperatorPortalInvite(operator.id));
      setCopied(false);
      onChange?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    setBusy(true);
    try {
      await revokeOperatorPortalAccess(operator.id);
      toast.success('Portal access withdrawn and every session ended.');
      setRevoking(false);
      onChange?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the link is on screen to select by hand.
      setCopied(false);
    }
  }

  return (
    <>
      <Card title="Operator portal" actions={<Badge tone={tone}>{label}</Badge>}>
        {portal.state === 'active' && (
          <dl className="detail-list">
            <div className="detail-list__row">
              <dt>Activated</dt>
              <dd>{formatDateTime(portal.activatedAt)}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Last signed in</dt>
              <dd>{portal.lastLoginAt ? formatDateTime(portal.lastLoginAt) : 'Never'}</dd>
            </div>
          </dl>
        )}

        {portal.state === 'invited' && (
          <p className="muted">
            Invitation valid until {formatDateTime(portal.inviteExpiresAt)}. They have not set a
            password yet.
          </p>
        )}

        {portal.state === 'invite_expired' && (
          <p className="muted">The invitation expired before it was used. Send another.</p>
        )}

        {portal.state === 'not_invited' && (
          <p className="muted">
            {operator.contactEmail
              ? 'They can sign in to see and answer their own confirmation requests.'
              : 'Add a contact email first — it is what they sign in with.'}
          </p>
        )}

        {canEdit && (
          <div className="button-group" style={{ marginTop: 'var(--space-4)' }}>
            {portal.state !== 'active' && (
              <Button
                variant="primary"
                size="small"
                onClick={handleInvite}
                loading={busy}
                disabled={!operator.contactEmail}
              >
                {portal.state === 'not_invited' ? 'Invite to the portal' : 'Send a new invitation'}
              </Button>
            )}
            {portal.state !== 'not_invited' && (
              <Button variant="danger" size="small" onClick={() => setRevoking(true)}>
                Withdraw access
              </Button>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(invite)}
        title="Send this link to the operator"
        description="It is shown once. Copy it now — it cannot be retrieved later."
        onClose={() => setInvite(null)}
        size="medium"
        footer={
          <Button variant="primary" onClick={() => setInvite(null)}>
            Done
          </Button>
        }
      >
        <p className="mono callout">{activationUrl}</p>
        <div className="button-group">
          <Button size="small" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
        <p className="muted small" style={{ marginTop: 'var(--space-4)' }}>
          Valid for {invite?.expiresInHours} hours. The platform does not send email yet, so pass
          it on however you already talk to this operator — and to them, not to whoever asked for
          it.
        </p>
      </Modal>

      <ConfirmModal
        open={revoking}
        title="Withdraw portal access?"
        message="They will be signed out immediately and will need a new invitation to get back in. Their confirmation history is untouched."
        confirmLabel="Withdraw access"
        loading={busy}
        onConfirm={handleRevoke}
        onClose={() => setRevoking(false)}
      />
    </>
  );
}
