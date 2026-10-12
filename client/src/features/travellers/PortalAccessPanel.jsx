import { useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import Modal, { ConfirmModal } from '../../components/common/Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { issuePortalInvite, revokePortalAccess } from '../../services/safety.service.js';
import { formatDateTime } from '../../utils/format.js';

const STATE_LABEL = {
  not_invited: ['neutral', 'No access'],
  invited: ['info', 'Invitation sent'],
  invite_expired: ['warning', 'Invitation expired'],
  active: ['success', 'Active'],
  suspended: ['warning', 'Suspended'],
};

/**
 * Portal access for one traveller, from the staff side.
 *
 * The invitation link is shown once, in a dialog, and then it is gone — the
 * server keeps only a hash. Staff have to copy it somewhere before closing,
 * which is friction, and the friction is the honest consequence of not having
 * chosen a mail provider yet. Storing it in a form somebody could read later
 * would remove the friction by removing the security.
 */
export default function PortalAccessPanel({ traveller, canEdit, onChange }) {
  const toast = useToast();
  const [invite, setInvite] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const portal = traveller.portal || { state: 'not_invited' };
  const [tone, label] = STATE_LABEL[portal.state] || STATE_LABEL.not_invited;

  // The server decides where travellers sign in (TrailAsia Book when it is
  // configured) and sends back the full link. The fallback only covers an
  // API old enough not to.
  const activationUrl = invite
    ? invite.activationUrl ||
      `${window.location.origin}/trip/activate?token=${invite.inviteToken}`
    : '';

  async function handleInvite() {
    setBusy(true);
    try {
      setInvite(await issuePortalInvite(traveller.id));
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
      await revokePortalAccess(traveller.id);
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
      <Card title="Traveller portal" actions={<Badge tone={tone}>{label}</Badge>}>
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
          <p className="muted">
            The invitation expired before it was used. Send another.
          </p>
        )}

        {portal.state === 'not_invited' && (
          <p className="muted">
            {traveller.email
              ? 'They can sign in to see their trip, documents and safety information.'
              : 'Add an email address first — it is what they sign in with.'}
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
                disabled={!traveller.email}
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
        title="Send this link to the traveller"
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
          Valid for {invite?.expiresInHours} hours.{' '}
          {invite?.emailed
            ? 'It has also been emailed to them, so this copy is a backup.'
            : 'It was not emailed, so pass it on however you already talk to this traveller — and to them, not to whoever asked for it.'}
        </p>
      </Modal>

      <ConfirmModal
        open={revoking}
        title="Withdraw portal access?"
        message="They will be signed out immediately and will need a new invitation to get back in. Their trip and document records are untouched."
        confirmLabel="Withdraw access"
        loading={busy}
        onConfirm={handleRevoke}
        onClose={() => setRevoking(false)}
      />
    </>
  );
}
