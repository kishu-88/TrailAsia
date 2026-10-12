'use strict';

/**
 * Two more public-site content fields on `destinations`, alongside the
 * marketing fields and travel-guide fields already there:
 *
 * - `attractions` — named tourist attractions within the country (Kathmandu
 *   Durbar Square, Ha Long Bay, ...), distinct from `highlights`, which
 *   describes the specific trip itinerary itself. Same JSON-array reasoning
 *   as `highlights`/`whatToPack`: a short list nobody queries across, but
 *   this one is an array of `{ name, description }` objects rather than
 *   plain strings, since an attraction needs more than a label.
 * - `thingsToKnow` — quick practical facts a traveller would want before
 *   booking (currency, language, time zone, visa, plug type), as an array
 *   of `{ label, value }` pairs so the public site can render it as a
 *   simple fact grid without hard-coding which facts every destination has.
 *
 * Both nullable, same "staff backfill destination by destination" pattern.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('destinations', 'attractions', {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.addColumn('destinations', 'things_to_know', {
      type: Sequelize.JSON,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('destinations', 'attractions');
    await queryInterface.removeColumn('destinations', 'things_to_know');
  },
};
