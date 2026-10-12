'use strict';

const reportService = require('../services/report.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/**
 * One endpoint per tab.
 *
 * The alternative — eight endpoints, one per report — reads better on paper and
 * worse in practice: the page would fire eight requests, each opening its own
 * connection, to render one screen. These two do a tab's worth of work in one
 * round trip, and the service underneath still exposes each report separately
 * for anything that wants just one.
 */

const commercial = handle(async (req, res) => {
  const data = await reportService.commercial(req.validatedQuery || req.query, req.user);
  res.json({ data });
});

const operational = handle(async (req, res) => {
  const data = await reportService.operational(req.validatedQuery || req.query);
  res.json({ data });
});

// The dashboard's headline figures, without the rest of the commercial tab.
// Kept separate because it is on the landing screen and must stay quick.
const headline = handle(async (req, res) => {
  const [pipeline, departures] = await Promise.all([
    reportService.pipeline(req.validatedQuery || req.query),
    reportService.departureReadiness({ horizonDays: '30' }),
  ]);

  res.json({
    data: {
      pipeline: {
        from: pipeline.from,
        to: pipeline.to,
        total: pipeline.total,
        won: pipeline.won,
        lost: pipeline.lost,
        stillOpen: pipeline.stillOpen,
        conversionRate: pipeline.conversionRate,
      },
      departures: departures.summary,
    },
  });
});

module.exports = { commercial, operational, headline };
