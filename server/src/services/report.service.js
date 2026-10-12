'use strict';

const { Op } = require('sequelize');

const {
  Booking,
  ItinerarySegment,
  Destination,
  User,
  Task,
  Operator,
  OperatorConfirmation,
  Payment,
  PaymentSchedule,
} = require('../models');
const { addDecimal, clampAtZero, isZero, subtractDecimal, sumDecimals } = require('../utils/money');
const bookingService = require('./booking.service');
const { settle } = require('./payment.service');

/**
 * Reporting.
 *
 * **There are no reporting tables.** Every figure below is aggregated at read
 * time from the operational data. That is the right call at this scale and it
 * is worth saying why: a reporting table is a second copy of the truth, and the
 * day it disagrees with the booking screen is the day nobody trusts either.
 * When the agency outgrows this — tens of thousands of bookings, reports that
 * take seconds — the answer is a nightly rollup job, not a column that some
 * other service remembers to update.
 *
 * **Money is never added across currencies.** Every monetary row is keyed by
 * its currency, and a destination or consultant with bookings in two currencies
 * produces two rows rather than one meaningless total. This is the same rule
 * the payments module follows, for the same reason.
 *
 * **One definition of "ready".** The departure board calls the same
 * `bookingService.readiness()` the booking screen calls, rather than
 * re-deriving it from a cheaper query. Two screens disagreeing about whether a
 * trip is ready is worse than one slow screen, so the cost is bounded by only
 * looking at departures inside the horizon — see `departureReadiness`.
 */

// Reaching confirmed is what "won" means. A booking can be cancelled after
// that, and it still counts as won and then lost — collapsing the two would
// hide late cancellations, which are the expensive ones.
const WON_STATUSES = ['confirmed', 'in_progress', 'completed'];
const OPEN_STATUSES = ['enquiry', 'quoted'];

const DEFAULT_MONTHS_BACK = 12;
const DEFAULT_HORIZON_DAYS = 60;
const READINESS_LIMIT = 50;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthsAgo(months) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function plusDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The `YYYY-MM` a timestamp falls in, or null if it is not a usable date.
 *
 * The null matters. `new Date(x).toISOString()` throws on an unparseable value,
 * and a report that throws takes the whole tab down — so one task row with a
 * malformed or missing timestamp would cost a coordinator the departure board,
 * the overdue list and the partner table as well. A report is a read over data
 * somebody else wrote, including data written before the current rules existed;
 * it has to survive a bad row by leaving it out and saying so, not by falling
 * over.
 */
function monthKey(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
}

/**
 * Read a date range off a query, defaulting to the last twelve months.
 *
 * `to` is inclusive of the whole day. Bookings created at 14:00 on the end date
 * would otherwise fall outside a range the user believes they asked for, which
 * is the classic off-by-one that makes a month's figures quietly wrong.
 */
function range(query = {}) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '')
    ? query.from
    : monthsAgo(DEFAULT_MONTHS_BACK);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : today();
  return {
    from,
    to,
    createdWhere: { createdAt: { [Op.gte]: `${from} 00:00:00`, [Op.lte]: `${to} 23:59:59` } },
  };
}

/** Accumulate an amount into a `{key, currencyCode}` bucket map. */
function bucket(map, key, currencyCode, amount) {
  const id = `${key}::${currencyCode}`;
  const existing = map.get(id) || { key, currencyCode, total: '0.00', count: 0 };
  existing.total = addDecimal(existing.total, amount || '0.00');
  existing.count += 1;
  map.set(id, existing);
  return existing;
}

// --- Commercial ------------------------------------------------------------

/**
 * Where bookings created in this window ended up.
 *
 * The conversion rate is deliberately computed over *decided* bookings only.
 * An enquiry raised last Tuesday is not a lost sale, and counting it as one
 * makes every recent month look like a collapse — the sort of artefact that
 * gets a real decision made on a reporting bug.
 */
async function pipeline(query = {}) {
  const { from, to, createdWhere } = range(query);

  const bookings = await Booking.findAll({
    where: createdWhere,
    attributes: ['id', 'status', 'currencyCode', 'totalAmount', 'createdAt'],
  });

  const byStatus = new Map();
  for (const booking of bookings) {
    const row = byStatus.get(booking.status) || {
      status: booking.status,
      count: 0,
      value: new Map(),
    };
    row.count += 1;
    if (booking.totalAmount) {
      const existing = row.value.get(booking.currencyCode) || '0.00';
      row.value.set(booking.currencyCode, addDecimal(existing, booking.totalAmount));
    }
    byStatus.set(booking.status, row);
  }

  const won = bookings.filter((b) => WON_STATUSES.includes(b.status)).length;
  const lost = bookings.filter((b) => b.status === 'cancelled').length;
  const stillOpen = bookings.filter((b) => OPEN_STATUSES.includes(b.status)).length;
  const decided = won + lost;

  return {
    from,
    to,
    total: bookings.length,
    won,
    lost,
    stillOpen,
    decided,
    conversionRate: decided > 0 ? Math.round((won / decided) * 100) : null,
    byStatus: [...byStatus.values()].map((row) => ({
      status: row.status,
      count: row.count,
      value: [...row.value.entries()].map(([currencyCode, total]) => ({
        currencyCode,
        total,
      })),
    })),
  };
}

/**
 * Won revenue by the destination a trip starts in.
 *
 * A booking that visits Nepal and then Bhutan is counted once, against Nepal.
 * Splitting a quoted total across destinations would mean inventing a division
 * the agency never agreed with the traveller — and an invented number on a
 * revenue report is worse than a missing one, because somebody will plan
 * against it. The field is named `leadDestination` so nobody reads it as a
 * full attribution.
 */
async function revenueByDestination(query = {}) {
  const { from, to, createdWhere } = range(query);

  const bookings = await Booking.findAll({
    where: { ...createdWhere, status: { [Op.in]: WON_STATUSES } },
    include: [
      {
        model: ItinerarySegment,
        as: 'segments',
        required: false,
        include: [{ model: Destination, as: 'destination', required: false }],
      },
    ],
  });

  const buckets = new Map();
  let unattributed = 0;

  for (const booking of bookings) {
    const lead = (booking.segments || [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)[0];

    if (!lead || !lead.destination) {
      // A won booking with no itinerary yet. Named rather than dropped: a
      // report whose rows do not add up to the total is one nobody trusts.
      unattributed += 1;
      continue;
    }

    bucket(buckets, lead.destination.name, booking.currencyCode, booking.totalAmount);
  }

  return {
    from,
    to,
    unattributedBookings: unattributed,
    rows: [...buckets.values()]
      .map((row) => ({
        leadDestination: row.key,
        currencyCode: row.currencyCode,
        bookings: row.count,
        value: row.total,
      }))
      .sort((a, b) => Number(b.value) - Number(a.value)),
  };
}

/**
 * How each consultant's pipeline turned out.
 *
 * `restrictToUserId` narrows this to one person. The route passes it for a
 * consultant, so everyone can see their own figures but only management sees
 * the league table. That is a deliberate choice rather than an oversight: a
 * performance comparison visible to the people being compared changes their
 * behaviour, and whether the agency wants that is a management decision, not a
 * default that falls out of who happened to write the query.
 */
async function consultantPerformance(query = {}, { restrictToUserId = null } = {}) {
  const { from, to, createdWhere } = range(query);

  const where = { ...createdWhere };
  if (restrictToUserId) where.consultantId = restrictToUserId;

  const bookings = await Booking.findAll({
    where,
    include: [{ model: User, as: 'consultant', required: false }],
  });

  const perConsultant = new Map();

  for (const booking of bookings) {
    const id = String(booking.consultantId);
    const row = perConsultant.get(id) || {
      id,
      name: booking.consultant ? booking.consultant.fullName() : 'Unknown',
      created: 0,
      won: 0,
      lost: 0,
      stillOpen: 0,
      value: new Map(),
    };

    row.created += 1;
    if (WON_STATUSES.includes(booking.status)) {
      row.won += 1;
      if (booking.totalAmount) {
        const existing = row.value.get(booking.currencyCode) || '0.00';
        row.value.set(booking.currencyCode, addDecimal(existing, booking.totalAmount));
      }
    } else if (booking.status === 'cancelled') {
      row.lost += 1;
    } else {
      row.stillOpen += 1;
    }

    perConsultant.set(id, row);
  }

  return {
    from,
    to,
    restricted: Boolean(restrictToUserId),
    rows: [...perConsultant.values()]
      .map((row) => {
        const decided = row.won + row.lost;
        return {
          consultantId: row.id,
          name: row.name,
          created: row.created,
          won: row.won,
          lost: row.lost,
          stillOpen: row.stillOpen,
          conversionRate: decided > 0 ? Math.round((row.won / decided) * 100) : null,
          value: [...row.value.entries()].map(([currencyCode, total]) => ({
            currencyCode,
            total,
          })),
        };
      })
      .sort((a, b) => b.won - a.won || b.created - a.created),
  };
}

/**
 * Cleared money in, by month.
 *
 * Grouped on `receivedOn` rather than when the row was keyed — finance enters
 * last week's bank statement today, and a report that credits it to today is
 * reporting on data entry rather than on the business.
 */
async function revenueTimeline(query = {}) {
  const { from, to } = range(query);

  const payments = await Payment.findAll({
    where: {
      direction: 'incoming',
      status: 'cleared',
      receivedOn: { [Op.gte]: from, [Op.lte]: to },
    },
    attributes: ['receivedOn', 'baseCurrencyCode', 'amountInBase'],
  });

  const buckets = new Map();
  for (const payment of payments) {
    const month = String(payment.receivedOn).slice(0, 7);
    bucket(buckets, month, payment.baseCurrencyCode, payment.amountInBase);
  }

  return {
    from,
    to,
    rows: [...buckets.values()]
      .map((row) => ({
        month: row.key,
        currencyCode: row.currencyCode,
        payments: row.count,
        received: row.total,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

// --- Operational -----------------------------------------------------------

/**
 * The departure board: is each trip leaving soon actually ready?
 *
 * Three questions per booking — documents, ground arrangements, money — which
 * until now could only be answered by opening three panels on one booking at a
 * time. This is the screen that makes ten modules read as one system.
 *
 * Bounded deliberately. Document readiness is the expensive check (a
 * requirements checklist per traveller per destination), so it runs only over
 * departures inside the horizon, capped, and the response says when the cap
 * was hit rather than quietly truncating. Operator and payment readiness are
 * cheap bulk reads and are computed for the same set so the three columns
 * always describe the same bookings.
 */
async function departureReadiness(query = {}) {
  const horizonDays = Math.min(
    Math.max(Number.parseInt(query.horizonDays, 10) || DEFAULT_HORIZON_DAYS, 1),
    365
  );
  const horizon = plusDays(horizonDays);

  const bookings = await Booking.findAll({
    where: {
      status: { [Op.in]: ['confirmed', 'in_progress'] },
      departureDate: { [Op.gte]: today(), [Op.lte]: horizon },
    },
    order: [['departureDate', 'ASC']],
    limit: READINESS_LIMIT + 1,
  });

  const capped = bookings.length > READINESS_LIMIT;
  const inScope = bookings.slice(0, READINESS_LIMIT);
  const ids = inScope.map((booking) => booking.id);

  const [confirmations, schedules, payments] = await Promise.all([
    ids.length
      ? OperatorConfirmation.findAll({ where: { bookingId: { [Op.in]: ids } } })
      : [],
    ids.length
      ? PaymentSchedule.findAll({
          where: { bookingId: { [Op.in]: ids } },
          include: [{ model: Payment, as: 'payments', required: false }],
        })
      : [],
    ids.length
      ? Payment.findAll({
          where: { bookingId: { [Op.in]: ids }, direction: 'incoming', status: 'cleared' },
        })
      : [],
  ]);

  const rows = [];

  for (const booking of inScope) {
    const bookingId = String(booking.id);

    // Documents — the same call the booking screen makes. It throws when there
    // is no itinerary to check against, which is itself a finding, not a crash.
    let documents = null;
    try {
      const result = await bookingService.readiness(booking.id);
      documents = {
        ready: result.summary.ready,
        outstanding: result.summary.outstanding,
        overdue: result.summary.overdue,
        partySize: result.summary.partySize,
      };
    } catch {
      documents = { ready: false, outstanding: null, overdue: null, partySize: 0 };
    }

    // Ground arrangements.
    const live = confirmations.filter(
      (row) => String(row.bookingId) === bookingId && row.status !== 'cancelled'
    );
    const operators = {
      total: live.length,
      confirmed: live.filter((row) => row.status === 'confirmed').length,
      outstanding: live.filter((row) => row.isOpen()).length,
      declined: live.filter((row) => row.status === 'declined').length,
      overdue: live.filter((row) => row.isOverdue()).length,
      ready:
        live.length > 0 &&
        live.every((row) => row.status === 'confirmed'),
    };

    // Money.
    const bookingSchedules = schedules.filter((row) => String(row.bookingId) === bookingId);
    const settlements = bookingSchedules.map((row) => settle(row, row.payments || []));
    const received = sumDecimals(
      payments
        .filter((row) => String(row.bookingId) === bookingId)
        .map((row) => row.amountInBase)
    );
    const balance = booking.totalAmount
      ? clampAtZero(subtractDecimal(booking.totalAmount, received))
      : null;

    rows.push({
      booking: {
        id: bookingId,
        reference: booking.reference,
        title: booking.title,
        status: booking.status,
        departureDate: booking.departureDate,
        currencyCode: booking.currencyCode,
        totalAmount: booking.totalAmount,
      },
      documents,
      operators,
      payments: {
        received,
        balance,
        overdueInstalments: settlements.filter((s) => s.overdue).length,
        // An unpriced booking is not "paid" — it has not been quoted yet.
        ready: Boolean(booking.totalAmount) && balance !== null && isZero(balance),
      },
      ready:
        documents.ready &&
        operators.ready &&
        Boolean(booking.totalAmount) &&
        balance !== null &&
        isZero(balance),
    });
  }

  return {
    horizonDays,
    capped,
    limit: READINESS_LIMIT,
    summary: {
      departures: rows.length,
      readyOnAllThree: rows.filter((row) => row.ready).length,
      documentsBlocked: rows.filter((row) => !row.documents.ready).length,
      operatorsBlocked: rows.filter((row) => !row.operators.ready).length,
      paymentsBlocked: rows.filter((row) => !row.payments.ready).length,
    },
    rows,
  };
}

/**
 * Which partners answer, and which do not.
 *
 * The figures the agency currently keeps in one consultant's head. Operators
 * with no history are returned with nulls rather than zeros — an unproven
 * partner should look unproven, not bad, or no new operator ever gets a
 * second booking.
 */
async function operatorReliability() {
  const operators = await Operator.findAll({
    where: { isActive: true },
    include: [
      { model: Destination, as: 'destination', required: false },
      { model: OperatorConfirmation, as: 'confirmations', required: false },
    ],
  });

  const rows = operators.map((operator) => {
    const all = operator.confirmations || [];
    const answered = all.filter((row) => row.respondedAt);
    const confirmed = all.filter((row) => row.status === 'confirmed').length;
    const declined = all.filter((row) => row.status === 'declined').length;
    const responseTimes = answered
      .map((row) => row.responseDays())
      .filter((days) => days !== null);

    return {
      operatorId: String(operator.id),
      name: operator.name,
      destination: operator.destination?.name || null,
      type: operator.type,
      isVetted: operator.isVetted(),
      total: all.length,
      confirmed,
      declined,
      outstanding: all.filter((row) => row.isOpen()).length,
      overdue: all.filter((row) => row.isOverdue()).length,
      confirmationRate:
        answered.length > 0 ? Math.round((confirmed / answered.length) * 100) : null,
      averageResponseDays:
        responseTimes.length > 0
          ? Math.round(
              (responseTimes.reduce((sum, days) => sum + days, 0) / responseTimes.length) * 10
            ) / 10
          : null,
      statedResponseDays: operator.typicalResponseDays,
    };
  });

  return {
    rows: rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    unvetted: rows.filter((row) => !row.isVetted).length,
  };
}

/**
 * Is the queue keeping up?
 *
 * Raised against closed, by month. A month where more work arrived than left is
 * the leading indicator of the thing the business case describes — a
 * coordinator discovering a gap too late to fix it.
 */
async function taskThroughput(query = {}) {
  const { from, to, createdWhere } = range(query);

  const [raised, closed, open] = await Promise.all([
    Task.findAll({ where: createdWhere, attributes: ['id', 'createdAt'] }),
    Task.findAll({
      where: {
        status: 'done',
        completedAt: { [Op.gte]: `${from} 00:00:00`, [Op.lte]: `${to} 23:59:59` },
      },
      attributes: ['id', 'createdAt', 'completedAt'],
    }),
    Task.findAll({
      where: { status: { [Op.in]: Task.OPEN_STATUSES } },
      attributes: ['id', 'dueOn', 'status', 'priority'],
    }),
  ]);

  const months = new Map();
  const touch = (month) => {
    const row = months.get(month) || { month, raised: 0, closed: 0 };
    months.set(month, row);
    return row;
  };

  let undated = 0;

  for (const task of raised) {
    const month = monthKey(task.createdAt);
    if (month) touch(month).raised += 1;
    else undated += 1;
  }
  for (const task of closed) {
    const month = monthKey(task.completedAt);
    if (month) touch(month).closed += 1;
    else undated += 1;
  }

  // Clamped at zero rather than discarded, which is what the rest of the
  // codebase does with a duration — see OperatorConfirmation.responseDays. A
  // task closed the moment it was raised took no time; it did not take an
  // unknown amount of time. Filtering those out instead made the average blank
  // whenever the only closed task was a quick one, which is precisely when a
  // throughput figure is most flattering and least suspected.
  const durations = closed
    .map(
      (task) =>
        (new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()) / 86400000
    )
    .filter((days) => Number.isFinite(days))
    .map((days) => Math.max(days, 0));


  const overdue = open.filter(
    (task) => task.dueOn && String(task.dueOn) < today()
  ).length;

  return {
    from,
    to,
    raised: raised.length,
    closed: closed.length,
    openNow: open.length,
    overdueNow: overdue,
    // Rows that had no usable timestamp and so appear in the totals but not in
    // the monthly shape. Reported rather than hidden: a chart that silently
    // omits rows is worse than one that says how many it left out.
    undatedRows: undated,
    averageDaysToClose:
      durations.length > 0
        ? Math.round((durations.reduce((sum, d) => sum + d, 0) / durations.length) * 10) / 10
        : null,
    rows: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/**
 * Everything past its date, in one place.
 *
 * Three modules, one question. Each of these is already visible on its own
 * screen; the value here is that nobody has to open three screens to find out
 * whether anything is on fire this morning.
 */
async function overdueAcrossModules() {
  const now = today();

  const [tasks, confirmations, schedules] = await Promise.all([
    Task.findAll({
      where: { status: { [Op.in]: Task.OPEN_STATUSES }, dueOn: { [Op.lt]: now } },
      include: [{ model: Booking, as: 'booking', required: false }],
      order: [['dueOn', 'ASC']],
      limit: 25,
    }),
    OperatorConfirmation.findAll({
      where: {
        status: { [Op.in]: OperatorConfirmation.OPEN_STATUSES },
        dueBy: { [Op.lt]: now },
      },
      include: [
        { model: Booking, as: 'booking', required: true, where: { status: { [Op.notIn]: ['cancelled', 'completed'] } } },
        { model: Operator, as: 'operator', required: false },
      ],
      order: [['dueBy', 'ASC']],
      limit: 25,
    }),
    PaymentSchedule.findAll({
      where: { status: 'scheduled', dueOn: { [Op.lt]: now } },
      include: [
        { model: Booking, as: 'booking', required: true, where: { status: { [Op.ne]: 'cancelled' } } },
        { model: Payment, as: 'payments', required: false },
      ],
      order: [['dueOn', 'ASC']],
      limit: 25,
    }),
  ]);

  // An instalment past its date that has been paid is not overdue.
  const unpaid = schedules
    .map((row) => ({ row, settlement: settle(row, row.payments || []) }))
    .filter(({ settlement }) => !settlement.settled);

  return {
    asOf: now,
    counts: {
      tasks: tasks.length,
      operatorConfirmations: confirmations.length,
      instalments: unpaid.length,
    },
    tasks: tasks.map((task) => ({
      id: String(task.id),
      title: task.title,
      dueOn: task.dueOn,
      daysLate: Math.abs(task.daysUntilDue()),
      priority: task.priority,
      booking: task.booking
        ? { id: String(task.booking.id), reference: task.booking.reference }
        : null,
    })),
    operatorConfirmations: confirmations.map((row) => ({
      id: String(row.id),
      summary: row.summary,
      operator: row.operator?.name || null,
      dueBy: row.dueBy,
      daysLate: Math.abs(row.daysUntilDue()),
      booking: row.booking
        ? {
            id: String(row.booking.id),
            reference: row.booking.reference,
            departureDate: row.booking.departureDate,
          }
        : null,
    })),
    instalments: unpaid.map(({ row, settlement }) => ({
      id: String(row.id),
      label: row.label,
      dueOn: row.dueOn,
      daysLate: Math.abs(row.daysUntilDue()),
      currencyCode: row.currencyCode,
      outstanding: settlement.outstanding,
      booking: row.booking
        ? { id: String(row.booking.id), reference: row.booking.reference }
        : null,
    })),
  };
}

// --- One read per tab ------------------------------------------------------

/**
 * @param {object} actingUser Used only to decide whether the consultant table
 *   is a league table or a mirror. See `consultantPerformance`.
 */
async function commercial(query = {}, actingUser = null) {
  const restrictToUserId = actingUser && actingUser.role === 'consultant' ? actingUser.id : null;

  const [pipelineData, destinations, consultants, timeline] = await Promise.all([
    pipeline(query),
    revenueByDestination(query),
    consultantPerformance(query, { restrictToUserId }),
    revenueTimeline(query),
  ]);

  return { pipeline: pipelineData, destinations, consultants, timeline };
}

async function operational(query = {}) {
  // Not Promise.all: departureReadiness is the heavy one and runs a query per
  // booking in scope. Letting the three cheap reports pile onto the same pool
  // at the same moment is how a reporting page starves the rest of the API.
  const departures = await departureReadiness(query);
  const [operators, tasks, overdue] = await Promise.all([
    operatorReliability(),
    taskThroughput(query),
    overdueAcrossModules(),
  ]);

  return { departures, operators, tasks, overdue };
}

module.exports = {
  pipeline,
  revenueByDestination,
  consultantPerformance,
  revenueTimeline,

  departureReadiness,
  operatorReliability,
  taskThroughput,
  overdueAcrossModules,

  commercial,
  operational,

  WON_STATUSES,

  // Exported for the tests. The date guard is the piece most likely to be
  // "simplified" back into a bare toISOString by someone who has not seen it
  // take a whole reporting tab down.
  monthKey,
};
