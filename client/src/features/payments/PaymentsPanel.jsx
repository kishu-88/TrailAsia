import { useCallback, useEffect, useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
// Both destructive actions here need a typed reason, so they use a plain Modal
// with a disabled confirm rather than ConfirmModal.
import Modal from '../../components/common/Modal.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import {
  FieldGrid,
  SelectField,
  TextArea,
  TextField,
} from '../../components/common/Field.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import * as operatorsService from '../../services/operators.service.js';
import * as paymentsService from '../../services/payments.service.js';
import { formatDate, formatMoney, relativeDays } from '../../utils/format.js';
import { can } from '../../utils/permissions.js';
import {
  DIRECTION_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  paymentStatusTone,
  scheduleLabel,
  scheduleTone,
} from './paymentLabels.js';

const BLANK_SCHEDULE = { label: '', dueOn: '', amount: '', notes: '' };

const BLANK_PAYMENT = {
  direction: 'incoming',
  method: 'bank_transfer',
  status: 'pending',
  paymentScheduleId: '',
  operatorConfirmationId: '',
  currencyCode: '',
  amount: '',
  exchangeRate: '',
  reference: '',
  receivedOn: '',
  notes: '',
};

/**
 * One booking's money: the plan, the ledger, and the gap between them.
 *
 * The business case describes payment tracking as a spreadsheet plus whatever
 * the consultant remembers, and the question it cannot answer quickly is the
 * one at the top of this panel — how much is still owed on this trip, today.
 *
 * Who sees which button is deliberate and is mirrored on the server. A
 * consultant reads every figure here and can set the plan; they cannot record
 * that money arrived, because the person with a commission interest in a
 * booking looking paid should not be the person who says it is.
 */
export default function PaymentsPanel({ booking, canEdit }) {
  const { user } = useAuth();
  const toast = useToast();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [scheduleForm, setScheduleForm] = useState(null); // 'new' | schedule
  const [scheduleValues, setScheduleValues] = useState(BLANK_SCHEDULE);
  const [scheduleError, setScheduleError] = useState(null);

  const [paymentForm, setPaymentForm] = useState(false);
  const [paymentValues, setPaymentValues] = useState(BLANK_PAYMENT);
  const [paymentError, setPaymentError] = useState(null);
  const [payableArrangements, setPayableArrangements] = useState([]);

  const [settling, setSettling] = useState(null);
  const [settleStatus, setSettleStatus] = useState('cleared');
  const [settleReason, setSettleReason] = useState('');

  const [waiving, setWaiving] = useState(null);
  const [waiveReason, setWaiveReason] = useState('');

  const canPlan = canEdit && can.planPayments(user);
  const canRecord = can.recordPayments(user);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await paymentsService.getBookingSummary(booking.id));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [booking.id]);

  useEffect(() => {
    load();
  }, [load]);

  const setSchedule = (key) => (event) =>
    setScheduleValues((current) => ({ ...current, [key]: event.target.value }));
  const setPayment = (key) => (event) =>
    setPaymentValues((current) => ({ ...current, [key]: event.target.value }));

  const scheduleFieldError = (name) => scheduleError?.details?.[name];
  const paymentFieldError = (name) => paymentError?.details?.[name];

  function openNewSchedule() {
    setScheduleValues(BLANK_SCHEDULE);
    setScheduleError(null);
    setScheduleForm('new');
  }

  function openEditSchedule(schedule) {
    setScheduleValues({
      label: schedule.label,
      dueOn: schedule.dueOn || '',
      amount: schedule.amount,
      notes: schedule.notes || '',
    });
    setScheduleError(null);
    setScheduleForm(schedule);
  }

  async function handleSaveSchedule(event) {
    event.preventDefault();
    setBusy(true);
    setScheduleError(null);

    const payload = {
      label: scheduleValues.label.trim(),
      dueOn: scheduleValues.dueOn,
      amount: scheduleValues.amount,
      notes: scheduleValues.notes.trim() || null,
    };

    try {
      if (scheduleForm === 'new') {
        await paymentsService.addSchedule({ ...payload, bookingId: booking.id });
        toast.success('Instalment added.');
      } else {
        await paymentsService.updateSchedule(scheduleForm.id, payload);
        toast.success('Instalment updated.');
      }
      setScheduleForm(null);
      await load();
    } catch (caught) {
      setScheduleError(caught);
    } finally {
      setBusy(false);
    }
  }

  function openNewPayment(schedule) {
    setPaymentValues({
      ...BLANK_PAYMENT,
      currencyCode: booking.currencyCode || 'AUD',
      receivedOn: new Date().toISOString().slice(0, 10),
      paymentScheduleId: schedule ? schedule.id : '',
      // Pre-fill what is still owed rather than the full instalment: on a part
      // paid row, the amount somebody is about to key is the remainder.
      amount: schedule ? schedule.outstanding || schedule.amount : '',
    });
    setPaymentError(null);
    setPaymentForm(true);
    loadPayableArrangements();
  }

  /**
   * What this booking could legitimately be paying an operator for.
   *
   * Only confirmed arrangements — the API refuses the rest, because money
   * leaving for a service nobody has agreed to provide is exactly the mistake
   * worth blocking. Failing quietly here leaves the dropdown empty rather than
   * breaking the form; the server still has the final say.
   */
  async function loadPayableArrangements() {
    try {
      const readiness = await operatorsService.getBookingReadiness(booking.id);
      setPayableArrangements(
        (readiness.confirmations || []).filter((row) => row.status === 'confirmed')
      );
    } catch {
      setPayableArrangements([]);
    }
  }

  /** Picking an arrangement fills in what was agreed with that operator. */
  function chooseArrangement(event) {
    const id = event.target.value;
    const arrangement = payableArrangements.find((row) => row.id === id);
    setPaymentValues((current) => ({
      ...current,
      operatorConfirmationId: id,
      currencyCode: arrangement?.currencyCode || current.currencyCode,
      amount: arrangement?.amount || current.amount,
    }));
  }

  async function handleRecordPayment(event) {
    event.preventDefault();
    setBusy(true);
    setPaymentError(null);

    const converted = paymentValues.currencyCode !== (booking.currencyCode || 'AUD');

    try {
      await paymentsService.recordPayment({
        bookingId: booking.id,
        direction: paymentValues.direction,
        method: paymentValues.method,
        status: paymentValues.status,
        paymentScheduleId: paymentValues.paymentScheduleId || null,
        operatorConfirmationId: paymentValues.operatorConfirmationId || null,
        currencyCode: paymentValues.currencyCode || undefined,
        amount: paymentValues.amount,
        // Only sent when it means something. The API rejects a rate on a
        // same-currency payment rather than quietly ignoring it.
        exchangeRate: converted && paymentValues.exchangeRate ? paymentValues.exchangeRate : undefined,
        reference: paymentValues.reference.trim() || null,
        receivedOn: paymentValues.receivedOn || undefined,
        notes: paymentValues.notes.trim() || null,
      });
      setPaymentForm(false);
      await load();
      toast.success('Payment recorded.');
    } catch (caught) {
      setPaymentError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleSettle() {
    setBusy(true);
    try {
      await paymentsService.settlePayment(settling.id, {
        status: settleStatus,
        reason: settleStatus === 'cleared' ? null : settleReason.trim(),
      });
      setSettling(null);
      setSettleReason('');
      await load();
      toast.success(`Marked ${PAYMENT_STATUS_LABELS[settleStatus].toLowerCase()}.`);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleWaive() {
    setBusy(true);
    try {
      await paymentsService.closeSchedule(waiving.id, {
        status: 'waived',
        reason: waiveReason.trim(),
      });
      setWaiving(null);
      setWaiveReason('');
      await load();
      toast.success('Instalment written off.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card title="Payments">
        <Spinner block label="Loading payments…" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Payments">
        <ErrorNotice error={error} onRetry={load} />
      </Card>
    );
  }

  const { totals, schedules, payments, currencyCode } = summary;
  const liveSchedules = schedules.filter((row) => row.status !== 'cancelled');
  const openSchedules = schedules.filter((row) => row.isLive && !row.settled);

  return (
    <Card
      title="Payments"
      subtitle={
        totals.quoted
          ? `${formatMoney(totals.received, currencyCode)} of ${formatMoney(
              totals.quoted,
              currencyCode
            )} received`
          : 'This booking has no price on it yet.'
      }
      actions={
        <>
          {canPlan && (
            <Button size="small" onClick={openNewSchedule}>
              Add instalment
            </Button>
          )}
          {canRecord && (
            <Button size="small" variant="primary" onClick={() => openNewPayment(null)}>
              Record payment
            </Button>
          )}
        </>
      }
      padded={false}
    >
      {/* --- Where this booking stands ------------------------------------ */}

      <div className="stat-row stat-row--inset">
        <Stat label="Received" value={formatMoney(totals.received, currencyCode)} />
        <Stat
          label="Still owed"
          value={formatMoney(totals.balance, currencyCode)}
          tone={totals.overdueAmount !== '0.00' ? 'danger' : undefined}
          hint={
            totals.overdueAmount !== '0.00'
              ? `${formatMoney(totals.overdueAmount, currencyCode)} overdue`
              : undefined
          }
        />
        <Stat
          label="Awaiting clearance"
          value={formatMoney(totals.awaitingClearance, currencyCode)}
          hint="Not counted above"
        />
        <Stat
          label="Paid to operators"
          value={formatMoney(totals.paidOut, currencyCode)}
        />
      </div>

      {totals.fullyPaid && (
        <div className="readiness-banner readiness-banner--ready">
          <p className="readiness-banner__headline">This booking is paid in full</p>
          <p className="muted">
            {formatMoney(totals.received, currencyCode)} received against a quoted{' '}
            {formatMoney(totals.quoted, currencyCode)}.
          </p>
        </div>
      )}

      {/* The plan and the price disagreeing is somebody having changed one and
          forgotten the other. Better said here than discovered by the traveller
          when the final invoice comes up short. */}
      {!totals.planMatchesTotal && liveSchedules.length > 0 && (
        <div className="alert alert--warning" style={{ margin: 'var(--space-4)' }}>
          <p className="alert__title">The instalment plan does not add up to the price</p>
          <p className="alert__message">
            The plan comes to {formatMoney(totals.scheduled, currencyCode)} against a quoted{' '}
            {formatMoney(totals.quoted, currencyCode)} —{' '}
            {formatMoney(totals.planShortfall, currencyCode)} unaccounted for.
          </p>
        </div>
      )}

      {totals.refunded !== '0.00' && (
        <div className="alert alert--warning" style={{ margin: 'var(--space-4)' }}>
          <p className="alert__title">
            {formatMoney(totals.refunded, currencyCode)} has been refunded
          </p>
          <p className="alert__message">
            Refunded money is not counted as received, so anything it was paying for is
            owed again.
          </p>
        </div>
      )}

      {/* --- The plan ------------------------------------------------------ */}

      <h3 className="panel-heading">Instalment plan</h3>

      {liveSchedules.length === 0 ? (
        <EmptyState
          title="No payment plan yet"
          message="Set out what the traveller agreed to pay, and when. Money can still be recorded without one."
          action={canPlan && <Button onClick={openNewSchedule}>Add the first instalment</Button>}
        />
      ) : (
        <ul className="confirmation-list">
          {liveSchedules.map((schedule) => (
            <li key={schedule.id} className="confirmation">
              <div className="confirmation__body">
                <div className="confirmation__heading">
                  <strong>{schedule.label}</strong>
                  <Badge tone={scheduleTone(schedule)}>{scheduleLabel(schedule)}</Badge>
                </div>

                <p className="muted confirmation__meta">
                  {formatMoney(schedule.amount, schedule.currencyCode)}
                  {' · due '}
                  {formatDate(schedule.dueOn)} ({relativeDays(schedule.dueOn)})
                </p>

                {schedule.isLive && (
                  <p className="muted confirmation__meta">
                    {schedule.paid !== '0.00'
                      ? `${formatMoney(schedule.paid, schedule.currencyCode)} received`
                      : 'Nothing received yet'}
                    {!schedule.settled &&
                      ` · ${formatMoney(schedule.outstanding, schedule.currencyCode)} outstanding`}
                    {schedule.awaitingClearance !== '0.00' &&
                      ` · ${formatMoney(
                        schedule.awaitingClearance,
                        schedule.currencyCode
                      )} awaiting clearance`}
                  </p>
                )}

                {schedule.status === 'waived' && schedule.waivedReason && (
                  <p className="confirmation__decline">
                    Written off: {schedule.waivedReason}
                  </p>
                )}
              </div>

              <div className="confirmation__actions">
                {canRecord && schedule.isLive && !schedule.settled && (
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => openNewPayment(schedule)}
                  >
                    Record payment
                  </Button>
                )}
                {canPlan && schedule.isLive && (
                  <Button size="small" variant="ghost" onClick={() => openEditSchedule(schedule)}>
                    Edit
                  </Button>
                )}
                {canRecord && schedule.isLive && (
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => {
                      setWaiving(schedule);
                      setWaiveReason('');
                    }}
                  >
                    Write off
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* --- The ledger ---------------------------------------------------- */}

      <h3 className="panel-heading">Ledger</h3>

      {payments.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          message={
            canRecord
              ? 'Every movement of money on this booking appears here, in or out.'
              : 'Finance records payments; they appear here as they are entered.'
          }
        />
      ) : (
        <ul className="confirmation-list">
          {payments.map((payment) => (
            <li key={payment.id} className="confirmation">
              <div className="confirmation__body">
                <div className="confirmation__heading">
                  <strong>
                    {payment.direction === 'outgoing' && '− '}
                    {formatMoney(payment.amount, payment.currencyCode)}
                  </strong>
                  <Badge tone={paymentStatusTone(payment.status)}>
                    {PAYMENT_STATUS_LABELS[payment.status] || payment.status}
                  </Badge>
                  <Badge tone="neutral">{DIRECTION_LABELS[payment.direction]}</Badge>
                </div>

                <p className="muted confirmation__meta">
                  {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                  {' · '}
                  {formatDate(payment.receivedOn)}
                  {payment.reference && ` · ref ${payment.reference}`}
                  {payment.schedule && ` · ${payment.schedule.label}`}
                  {payment.operatorConfirmation &&
                    ` · ${payment.operatorConfirmation.summary}`}
                </p>

                {/* The rate is shown, not hidden, because it is the reason this
                    figure will still read the same next March. */}
                {payment.isConverted && (
                  <p className="muted confirmation__meta">
                    Converted at {payment.exchangeRate} ={' '}
                    {formatMoney(payment.amountInBase, payment.baseCurrencyCode)}
                  </p>
                )}

                {payment.settledReason && (
                  <p className="confirmation__decline">{payment.settledReason}</p>
                )}
              </div>

              {canRecord && payment.allowedNextStatuses.length > 0 && (
                <div className="confirmation__actions">
                  <Button
                    size="small"
                    onClick={() => {
                      setSettling(payment);
                      setSettleStatus(payment.allowedNextStatuses[0]);
                      setSettleReason('');
                    }}
                  >
                    Update
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* --- Add or edit an instalment -------------------------------------- */}

      <Modal
        open={Boolean(scheduleForm)}
        title={scheduleForm === 'new' ? 'Add an instalment' : 'Edit instalment'}
        onClose={() => setScheduleForm(null)}
        size="small"
      >
        <form onSubmit={handleSaveSchedule} noValidate>
          {scheduleError && !scheduleError.details && <ErrorNotice error={scheduleError} />}

          <TextField
            label="What it is"
            required
            value={scheduleValues.label}
            onChange={setSchedule('label')}
            error={scheduleFieldError('label')}
            placeholder="Deposit"
          />

          <FieldGrid>
            <TextField
              label="Due on"
              type="date"
              required
              value={scheduleValues.dueOn}
              onChange={setSchedule('dueOn')}
              error={scheduleFieldError('dueOn')}
            />
            <TextField
              label={`Amount (${currencyCode})`}
              inputMode="decimal"
              required
              value={scheduleValues.amount}
              onChange={setSchedule('amount')}
              error={scheduleFieldError('amount')}
              placeholder="1000.00"
            />
          </FieldGrid>

          <TextArea
            label="Notes"
            rows={2}
            value={scheduleValues.notes}
            onChange={setSchedule('notes')}
            error={scheduleFieldError('notes')}
          />

          <div className="form-actions">
            <Button onClick={() => setScheduleForm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* --- Record a payment ----------------------------------------------- */}

      <Modal
        open={paymentForm}
        title="Record a payment"
        onClose={() => setPaymentForm(false)}
      >
        <form onSubmit={handleRecordPayment} noValidate>
          {paymentError && !paymentError.details && <ErrorNotice error={paymentError} />}

          <FieldGrid>
            <SelectField
              label="Direction"
              value={paymentValues.direction}
              onChange={setPayment('direction')}
              error={paymentFieldError('direction')}
              options={[
                { value: 'incoming', label: 'From the traveller' },
                { value: 'outgoing', label: 'To a ground operator' },
              ]}
            />
            <SelectField
              label="Method"
              value={paymentValues.method}
              onChange={setPayment('method')}
              error={paymentFieldError('method')}
              options={PAYMENT_METHODS.map((method) => ({
                value: method,
                label: PAYMENT_METHOD_LABELS[method],
              }))}
            />
          </FieldGrid>

          {paymentValues.direction === 'incoming' && openSchedules.length > 0 && (
            <SelectField
              label="Against which instalment"
              value={paymentValues.paymentScheduleId}
              onChange={setPayment('paymentScheduleId')}
              error={paymentFieldError('paymentScheduleId')}
              placeholder="Not against a specific instalment"
              options={openSchedules.map((schedule) => ({
                value: schedule.id,
                label: `${schedule.label} — ${formatMoney(
                  schedule.outstanding,
                  schedule.currencyCode
                )} outstanding`,
              }))}
            />
          )}

          {paymentValues.direction === 'outgoing' && (
            <SelectField
              label="Which arrangement"
              value={paymentValues.operatorConfirmationId}
              onChange={chooseArrangement}
              error={paymentFieldError('operatorConfirmationId')}
              placeholder="Not against a specific arrangement"
              options={payableArrangements.map((row) => ({
                value: row.id,
                label: `${row.operator?.name || 'Operator'} — ${row.summary}${
                  row.amount ? ` (${formatMoney(row.amount, row.currencyCode)})` : ''
                }`,
              }))}
              hint={
                payableArrangements.length === 0
                  ? 'Nothing on this booking has been confirmed by an operator yet.'
                  : 'Only confirmed arrangements. Choosing one fills in what was agreed.'
              }
            />
          )}

          <FieldGrid columns={3}>
            <TextField
              label="Currency"
              maxLength={3}
              value={paymentValues.currencyCode}
              onChange={setPayment('currencyCode')}
              error={paymentFieldError('currencyCode')}
            />
            <TextField
              label="Amount"
              inputMode="decimal"
              required
              value={paymentValues.amount}
              onChange={setPayment('amount')}
              error={paymentFieldError('amount')}
              placeholder="1000.00"
            />
            <TextField
              label="Received on"
              type="date"
              value={paymentValues.receivedOn}
              onChange={setPayment('receivedOn')}
              error={paymentFieldError('receivedOn')}
            />
          </FieldGrid>

          {paymentValues.currencyCode !== (booking.currencyCode || 'AUD') && (
            <TextField
              label={`Rate into ${booking.currencyCode || 'AUD'}`}
              inputMode="decimal"
              required
              value={paymentValues.exchangeRate}
              onChange={setPayment('exchangeRate')}
              error={paymentFieldError('exchangeRate')}
              placeholder="0.01187500"
              hint="Stored with the payment, so this figure never changes when rates move."
            />
          )}

          <TextField
            label="Bank or gateway reference"
            value={paymentValues.reference}
            onChange={setPayment('reference')}
            error={paymentFieldError('reference')}
            placeholder="BT-99417"
            hint="Never card details — the agency does not hold them."
          />

          <SelectField
            label="Has it cleared?"
            value={paymentValues.status}
            onChange={setPayment('status')}
            error={paymentFieldError('status')}
            options={[
              { value: 'pending', label: 'Not yet — awaiting clearance' },
              { value: 'cleared', label: 'Yes, the money is in' },
            ]}
            hint="Only cleared money counts towards the balance."
          />

          <TextArea
            label="Notes"
            rows={2}
            value={paymentValues.notes}
            onChange={setPayment('notes')}
            error={paymentFieldError('notes')}
          />

          <div className="form-actions">
            <Button onClick={() => setPaymentForm(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Record it
            </Button>
          </div>
        </form>
      </Modal>

      {/* --- Settle a payment ------------------------------------------------ */}

      <Modal
        open={Boolean(settling)}
        title="Update this payment"
        description={
          settling
            ? `${formatMoney(settling.amount, settling.currencyCode)} · ${formatDate(
                settling.receivedOn
              )}`
            : undefined
        }
        onClose={() => setSettling(null)}
        size="small"
        footer={
          <>
            <Button onClick={() => setSettling(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSettle}
              loading={busy}
              disabled={settleStatus !== 'cleared' && settleReason.trim().length < 3}
            >
              Save
            </Button>
          </>
        }
      >
        <SelectField
          label="What happened"
          value={settleStatus}
          onChange={(event) => setSettleStatus(event.target.value)}
          options={(settling?.allowedNextStatuses || []).map((status) => ({
            value: status,
            label: PAYMENT_STATUS_LABELS[status] || status,
          }))}
        />
        {settleStatus !== 'cleared' && (
          <TextArea
            label="Reason"
            required
            rows={2}
            value={settleReason}
            onChange={(event) => setSettleReason(event.target.value)}
            hint="Kept on the record. A bounced transfer with no explanation is unreadable six months later."
          />
        )}
        <p className="muted small">
          The amount cannot be changed. A figure keyed wrongly is marked failed and
          re-entered, so the ledger shows both the mistake and the correction.
        </p>
      </Modal>

      {/* --- Write off an instalment ----------------------------------------- */}

      <Modal
        open={Boolean(waiving)}
        title="Write off this instalment?"
        description={waiving?.label}
        onClose={() => setWaiving(null)}
        size="small"
        footer={
          <>
            <Button onClick={() => setWaiving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleWaive}
              loading={busy}
              disabled={waiveReason.trim().length < 3}
            >
              Write it off
            </Button>
          </>
        }
      >
        <p className="muted">
          The traveller will no longer owe{' '}
          {waiving && formatMoney(waiving.outstanding, waiving.currencyCode)}. The
          instalment stays on the record with your name against it.
        </p>
        <TextArea
          label="Why"
          required
          rows={2}
          value={waiveReason}
          onChange={(event) => setWaiveReason(event.target.value)}
          placeholder="Goodwill after the Lukla flight cancellation."
        />
      </Modal>

    </Card>
  );
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <p className="stat__value">{value}</p>
      <p className="stat__label">{label}</p>
      {hint && <p className="muted small">{hint}</p>}
    </div>
  );
}
