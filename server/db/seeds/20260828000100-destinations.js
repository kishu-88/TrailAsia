'use strict';

/**
 * Starting destination set and the documents each one needs.
 *
 * These are the agency's core Himalayan programmes plus the Southeast Asian
 * countries the business case identifies as the growth market. Requirements are
 * planning assumptions for the assignment — real visa and insurance rules change
 * and would be confirmed against Smartraveller and each embassy before go-live.
 */

const DESTINATIONS = [
  {
    code: 'NP',
    name: 'Nepal',
    country_code: 'NP',
    region: 'Himalaya',
    currency_code: 'NPR',
    max_altitude_metres: 5644,
    advisory_notes:
      'Trekking insurance must state helicopter evacuation and altitude cover. Verify cover directly with the insurer before agreeing to any evacuation.',
  },
  {
    code: 'BT',
    name: 'Bhutan',
    country_code: 'BT',
    region: 'Himalaya',
    currency_code: 'BTN',
    max_altitude_metres: 4500,
    advisory_notes:
      'Entry is via a licensed operator with a pre-paid daily fee. Permits are arranged through the ground operator.',
  },
  {
    code: 'TIB',
    name: 'Tibet',
    country_code: 'CN',
    region: 'Himalaya',
    currency_code: 'CNY',
    max_altitude_metres: 5200,
    advisory_notes:
      'Requires a Tibet Travel Permit in addition to a Chinese visa. Permits are issued to groups, not individuals.',
  },
  {
    code: 'VN',
    name: 'Vietnam',
    country_code: 'VN',
    region: 'Southeast Asia',
    currency_code: 'VND',
    max_altitude_metres: 3143,
    advisory_notes: null,
  },
  {
    code: 'ID',
    name: 'Indonesia',
    country_code: 'ID',
    region: 'Southeast Asia',
    currency_code: 'IDR',
    max_altitude_metres: 3726,
    advisory_notes: null,
  },
  {
    code: 'TH',
    name: 'Thailand',
    country_code: 'TH',
    region: 'Southeast Asia',
    currency_code: 'THB',
    max_altitude_metres: 2565,
    advisory_notes: null,
  },
];

/** Applied to every destination. */
const BASE_REQUIREMENTS = [
  {
    type: 'passport',
    name: 'Valid passport',
    description: 'Must remain valid for six months beyond the return date.',
    is_mandatory: true,
    lead_time_days: 60,
    min_validity_months: 6,
    requires_altitude_cover: false,
  },
  {
    type: 'insurance',
    name: 'Travel insurance',
    description: 'Policy number, insurer emergency contact and cover limits recorded.',
    is_mandatory: true,
    lead_time_days: 21,
    min_validity_months: null,
    requires_altitude_cover: false,
  },
];

/** Extra requirements, by destination code. */
const EXTRA_REQUIREMENTS = {
  NP: [
    {
      type: 'insurance',
      name: 'High-altitude trekking cover',
      description:
        'Policy must state cover to the maximum altitude of the itinerary and include helicopter evacuation.',
      is_mandatory: true,
      lead_time_days: 21,
      min_validity_months: null,
      requires_altitude_cover: true,
    },
    {
      type: 'visa',
      name: 'Nepal tourist visa',
      description: 'Available on arrival for Australian passport holders.',
      is_mandatory: true,
      lead_time_days: 14,
      min_validity_months: null,
      requires_altitude_cover: false,
    },
    {
      type: 'permit',
      name: 'TIMS card and conservation area permit',
      description: 'Arranged by the ground operator; record the permit numbers.',
      is_mandatory: true,
      lead_time_days: 14,
      min_validity_months: null,
      requires_altitude_cover: false,
    },
    {
      type: 'health_declaration',
      name: 'High-altitude health declaration',
      description: 'Traveller declaration of fitness and any conditions affected by altitude.',
      is_mandatory: true,
      lead_time_days: 30,
      min_validity_months: null,
      requires_altitude_cover: false,
    },
  ],
  BT: [
    {
      type: 'visa',
      name: 'Bhutan visa clearance',
      description: 'Issued through the licensed ground operator once the tour is paid.',
      is_mandatory: true,
      lead_time_days: 30,
      min_validity_months: null,
      requires_altitude_cover: false,
    },
  ],
  TIB: [
    {
      type: 'visa',
      name: 'Chinese tourist visa',
      is_mandatory: true,
      lead_time_days: 45,
      min_validity_months: null,
      requires_altitude_cover: false,
      description: null,
    },
    {
      type: 'permit',
      name: 'Tibet Travel Permit',
      description: 'Group permit; every traveller must be listed before it is issued.',
      is_mandatory: true,
      lead_time_days: 30,
      min_validity_months: null,
      requires_altitude_cover: false,
    },
    {
      type: 'health_declaration',
      name: 'High-altitude health declaration',
      is_mandatory: true,
      lead_time_days: 30,
      min_validity_months: null,
      requires_altitude_cover: false,
      description: null,
    },
  ],
  VN: [
    {
      type: 'visa',
      name: 'Vietnam e-visa',
      is_mandatory: true,
      lead_time_days: 21,
      min_validity_months: null,
      requires_altitude_cover: false,
      description: null,
    },
  ],
};

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    for (const destination of DESTINATIONS) {
      // eslint-disable-next-line no-await-in-loop
      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM destinations WHERE code = ? LIMIT 1',
        { replacements: [destination.code] }
      );
      if (existing.length > 0) continue; // seeding twice must not duplicate

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.bulkInsert('destinations', [
        { ...destination, is_active: true, created_at: now, updated_at: now },
      ]);

      // eslint-disable-next-line no-await-in-loop
      const [inserted] = await queryInterface.sequelize.query(
        'SELECT id FROM destinations WHERE code = ? LIMIT 1',
        { replacements: [destination.code] }
      );
      const destinationId = inserted[0].id;

      const requirements = [
        ...BASE_REQUIREMENTS,
        ...(EXTRA_REQUIREMENTS[destination.code] || []),
      ].map((requirement) => ({
        ...requirement,
        description: requirement.description ?? null,
        destination_id: destinationId,
        is_active: true,
        created_at: now,
        updated_at: now,
      }));

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.bulkInsert('document_requirements', requirements);
    }
  },

  async down(queryInterface) {
    const codes = DESTINATIONS.map((destination) => destination.code);
    const [rows] = await queryInterface.sequelize.query(
      `SELECT id FROM destinations WHERE code IN (${codes.map(() => '?').join(',')})`,
      { replacements: codes }
    );
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return;

    await queryInterface.sequelize.query(
      `DELETE FROM document_requirements WHERE destination_id IN (${ids.map(() => '?').join(',')})`,
      { replacements: ids }
    );
    await queryInterface.sequelize.query(
      `DELETE FROM destinations WHERE id IN (${ids.map(() => '?').join(',')})`,
      { replacements: ids }
    );
  },
};
