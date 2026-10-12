import { useState } from 'react';

import { formatDate, humanise } from '../../utils/format.js';

/**
 * What the traveller still owes, in their words rather than the system's —
 * and the place they send it from.
 *
 * The staff checklist says "outstanding / verified / on_file". A traveller does
 * not care about those states — they care whether they need to do something. So
 * each item is reduced to done, waiting, or needs-you, and the reasons are
 * spelled out plainly. "Your insurance covers 4,000 m but this trip reaches
 * 5,364 m" is actionable; "altitude cover insufficient" is not.
 *
 * Each item that is not done carries its own upload. The traveller never picks
 * a document type from a list: tapping "Upload" under "Nepal tourist visa"
 * sends a visa for Nepal, because that is the only thing it could be. What
 * they send is "submitted", never "verified" — a coordinator checks it before
 * it counts, and the item says so rather than turning green.
 *
 * `onUpload` is what makes this live. The staff preview renders the same
 * screen without it, and the upload buttons are shown but inert there.
 */

// One document of these kinds covers the whole trip. A visa or a permit is for
// one country; a passport is a passport wherever it is shown.
const TRIP_WIDE_TYPES = ['passport', 'insurance', 'vaccination'];

const ACCEPT = 'application/pdf,image/jpeg,image/png';

function classify(item) {
  if (item.satisfied) return { mark: 'ok', symbol: '✓', tone: 'Done' };
  if (item.status === 'submitted') return { mark: 'pending', symbol: '⋯', tone: 'Being checked' };
  if (item.status === 'rejected') return { mark: 'urgent', symbol: '!', tone: 'Not accepted' };
  if (item.status === 'expired') return { mark: 'urgent', symbol: '!', tone: 'Expired' };
  if (item.overdue) return { mark: 'urgent', symbol: '!', tone: 'Needed now' };
  return { mark: 'pending', symbol: '!', tone: 'Needed' };
}

function uploadLabel(item) {
  if (item.status === 'missing') return 'Upload';
  if (item.status === 'submitted') return 'Send a different file';
  return 'Upload a new one';
}

function UploadForm({ item, onUpload, onDone, onCancel }) {
  const [file, setFile] = useState(null);
  const [expiresOn, setExpiresOn] = useState('');
  const [reference, setReference] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) {
      setError('Choose a file or take a photo first.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      await onUpload(
        {
          type: item.requirement.type,
          destinationId: TRIP_WIDE_TYPES.includes(item.requirement.type)
            ? undefined
            : item.destination.id,
          expiresOn,
          reference: reference.trim(),
        },
        file
      );
      onDone();
    } catch (caught) {
      // The API explains a bad upload per field ("Exceeds the maximum upload
      // size."); that is more use to the traveller than its one-line summary.
      const detail = caught.details ? Object.values(caught.details)[0] : null;
      setError(detail ? `${caught.message} ${detail}` : caught.message);
      setSending(false);
    }
  }

  return (
    <form className="t-upload" onSubmit={handleSubmit} noValidate>
      <label className="t-upload__field">
        <span className="t-upload__label">File or photo</span>
        <input
          type="file"
          accept={ACCEPT}
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setError(null);
          }}
        />
        <span className="t-upload__hint">PDF, JPEG or PNG, up to 10 MB.</span>
      </label>

      <label className="t-upload__field">
        <span className="t-upload__label">Expiry date, if it has one</span>
        <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
      </label>

      <label className="t-upload__field">
        <span className="t-upload__label">Number on the document (optional)</span>
        <input
          type="text"
          value={reference}
          maxLength={120}
          onChange={(event) => setReference(event.target.value)}
        />
      </label>

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="t-action t-action--primary" disabled={sending}>
        {sending ? 'Sending…' : `Send ${item.requirement.name}`}
      </button>
      <button type="button" className="t-action" onClick={onCancel} disabled={sending}>
        <span className="t-action__body">
          <span className="t-action__label">Cancel</span>
        </span>
      </button>
    </form>
  );
}

export default function TripDocuments({ checklist, documents = [], onUpload }) {
  const [openKey, setOpenKey] = useState(null);
  const [sentKey, setSentKey] = useState(null);

  if (!checklist) {
    return (
      <div className="t-card">
        <div className="t-card__body">
          <p className="muted">
            Nothing to check yet — your itinerary has not been confirmed.
          </p>
        </div>
      </div>
    );
  }

  const { summary, items } = checklist;
  const needsYou = items.filter((item) => !item.satisfied);
  const done = items.filter((item) => item.satisfied);
  const beingChecked = needsYou.filter((item) => item.status === 'submitted').length;
  const toSend = needsYou.length - beingChecked;
  const live = typeof onUpload === 'function';

  const documentFor = (item) =>
    item.documentId ? documents.find((doc) => String(doc.id) === String(item.documentId)) : null;

  let bannerTitle = 'Everything is in order';
  let bannerText = 'Nothing further is required before you travel.';
  if (!summary.ready) {
    if (toSend === 0 && beingChecked > 0) {
      bannerTitle = 'Everything has been sent';
      bannerText = 'Your coordinator is checking what you sent. You will be told if anything needs redoing.';
    } else {
      bannerTitle = `${summary.outstanding} of ${summary.mandatory} still needed`;
      bannerText =
        beingChecked > 0
          ? `${beingChecked} ${beingChecked === 1 ? 'is' : 'are'} being checked. Upload the rest below.`
          : 'Upload each one below. Your coordinator checks it before it counts.';
    }
  }

  return (
    <>
      <div className={`t-banner t-banner--${summary.ready ? 'ready' : 'action'}`}>
        <p className="t-banner__title">{bannerTitle}</p>
        <p>{bannerText}</p>
      </div>

      {needsYou.length > 0 && (
        <div className="t-card">
          <div className="t-card__header">
            <h2 className="t-card__title">Still needed</h2>
          </div>
          {needsYou.map((item) => {
            const key = `${item.destination.id}-${item.requirement.id}`;
            const state = classify(item);
            const held = documentFor(item);
            const submitted = item.status === 'submitted';

            return (
              <div key={key} className="t-status">
                <span className={`t-status__mark t-status__mark--${state.mark}`} aria-hidden="true">
                  {state.symbol}
                </span>
                <div className="t-status__body">
                  <p className="t-status__label">{item.requirement.name}</p>
                  <p className="t-status__meta">
                    {item.destination.name} · {state.tone}
                    {!submitted && item.dueBy && ` · by ${formatDate(item.dueBy)}`}
                  </p>

                  {submitted && (
                    <p className="t-status__sent">
                      Sent{held ? ` ${formatDate(held.createdAt)}` : ''}
                      {held?.fileName ? ` · ${held.fileName}` : ''}. Your coordinator checks it
                      before it counts.
                    </p>
                  )}

                  {item.status === 'rejected' && (
                    <p className="t-status__reason">
                      {held?.notes
                        ? `Your coordinator said: ${held.notes}`
                        : 'Your coordinator could not accept this one. Send it again.'}
                    </p>
                  )}

                  {/* While a document is being checked, the things only staff can
                      fill in (an insurer's phone number, the altitude on a policy)
                      are still blank. Listing them here would read as the
                      traveller's mistake a second after they did the right thing. */}
                  {!submitted && item.issues.length > 0 && (
                    <ul className="t-status__issues">
                      {item.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}

                  {sentKey === key && openKey !== key && (
                    <p className="alert alert--info" role="status">
                      Sent. You will get a notification when it has been checked.
                    </p>
                  )}

                  {openKey === key ? (
                    <UploadForm
                      item={item}
                      onUpload={onUpload}
                      onDone={() => {
                        setOpenKey(null);
                        setSentKey(key);
                      }}
                      onCancel={() => setOpenKey(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`t-action t-status__action${
                        item.status === 'submitted' ? '' : ' t-action--call'
                      }`}
                      onClick={() => {
                        setOpenKey(key);
                        setSentKey(null);
                      }}
                      disabled={!live}
                    >
                      <span className="t-action__body">
                        <span className="t-action__label">{uploadLabel(item)}</span>
                        {!live && (
                          <span className="t-action__hint">
                            Preview only — the traveller uploads from their own sign-in.
                          </span>
                        )}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <div className="t-card">
          <div className="t-card__header">
            <h2 className="t-card__title">Received and checked</h2>
          </div>
          {done.map((item) => (
            <div key={`${item.destination.id}-${item.requirement.id}`} className="t-status">
              <span className="t-status__mark t-status__mark--ok" aria-hidden="true">
                ✓
              </span>
              <div className="t-status__body">
                <p className="t-status__label">{item.requirement.name}</p>
                <p className="t-status__meta">
                  {item.destination.name} · {humanise(item.status)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="t-unbuilt">
        <span className="t-unbuilt__label">Not built</span>
        Virus scanning. An uploaded file is checked for type and size and nothing else, so
        whoever opens it at the agency should treat it like any attachment from outside.
      </div>
    </>
  );
}
