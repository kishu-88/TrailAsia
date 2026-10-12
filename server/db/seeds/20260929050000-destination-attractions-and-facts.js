'use strict';

/**
 * Backfills `attractions` and `thingsToKnow` for the six seeded destinations
 * — named tourist attractions within each country, and the practical quick
 * facts (currency, language, time zone, visa, plugs) a traveller would want
 * before booking. Same guard as `destination-marketing-content`: only fills
 * a row whose `attractions` is still NULL, so it never overwrites a
 * destination staff have already edited by hand, and re-running it is a
 * no-op.
 */

const CONTENT = {
  NP: {
    attractions: [
      { name: 'Kathmandu Durbar Square', description: 'UNESCO World Heritage royal palace complex in the historic centre of Kathmandu.' },
      { name: 'Pokhara & Phewa Lake', description: 'Gateway to the Annapurna range, with paragliding and lakeside views of the Annapurna massif.' },
      { name: 'Chitwan National Park', description: "Lowland jungle safari for rhinos and, if you're lucky, Bengal tigers, by dugout canoe and jeep." },
      { name: 'Boudhanath Stupa', description: 'One of the largest Buddhist stupas in the world, ringed by monasteries and prayer flags.' },
    ],
    thingsToKnow: [
      { label: 'Currency', value: 'Nepalese Rupee (NPR) — cash is king outside Kathmandu' },
      { label: 'Language', value: 'Nepali, with English widely spoken on trekking routes' },
      { label: 'Time zone', value: 'NPT, UTC+5:45' },
      { label: 'Visa', value: 'Available on arrival for Australian passport holders' },
      { label: 'Plugs', value: 'Type C/D/M, 230V' },
    ],
  },
  BT: {
    attractions: [
      { name: "Paro Taktsang (Tiger's Nest)", description: "The iconic cliffside monastery above Paro valley — Bhutan's most photographed site." },
      { name: 'Punakha Dzong', description: 'A 17th-century fortress-monastery at the confluence of two rivers, among the most striking in the Himalaya.' },
      { name: 'Thimphu', description: 'The capital — traditional architecture, weekend markets, and the giant Buddha Dordenma statue.' },
      { name: 'Phobjikha Valley', description: 'A glacial valley and winter home to the endangered black-necked crane.' },
    ],
    thingsToKnow: [
      { label: 'Currency', value: 'Ngultrum (BTN), pegged to the Indian Rupee' },
      { label: 'Language', value: 'Dzongkha; English is the medium of instruction and widely spoken' },
      { label: 'Time zone', value: 'BTT, UTC+6' },
      { label: 'Visa', value: 'Arranged through your licensed ground operator, tied to the daily tariff' },
      { label: 'Plugs', value: 'Type D/F/G, 230V' },
    ],
  },
  TIB: {
    attractions: [
      { name: 'Potala Palace, Lhasa', description: 'The former seat of the Dalai Lamas, towering over Lhasa — a UNESCO World Heritage Site.' },
      { name: 'Jokhang Temple', description: "Tibetan Buddhism's most sacred temple, at the heart of Lhasa's Barkhor pilgrim circuit." },
      { name: 'Yamdrok Lake', description: "A turquoise high-altitude lake, one of Tibet's three holiest, on the road toward Everest." },
      { name: 'Everest North Base Camp', description: "The Tibetan-side base camp, reached by road — dramatic views of Everest's north face." },
    ],
    thingsToKnow: [
      { label: 'Currency', value: 'Chinese Yuan (CNY)' },
      { label: 'Language', value: 'Tibetan and Mandarin' },
      { label: 'Time zone', value: 'China Standard Time, UTC+8' },
      { label: 'Visa', value: 'Chinese visa plus a group Tibet Travel Permit' },
      { label: 'Plugs', value: 'Type A/C/I, 220V' },
    ],
  },
  VN: {
    attractions: [
      { name: 'Ha Long Bay', description: 'Thousands of limestone karsts rising from emerald water, usually seen from an overnight boat.' },
      { name: 'Hanoi Old Quarter', description: '36 narrow streets of street food, tailors and colonial-era shophouses.' },
      { name: 'Sapa rice terraces', description: 'Terraced hillsides in the northern highlands, home to several ethnic minority communities.' },
      { name: 'Hoi An Ancient Town', description: 'A UNESCO-listed trading port known for lantern-lit streets and tailor shops.' },
    ],
    thingsToKnow: [
      { label: 'Currency', value: 'Vietnamese Dong (VND)' },
      { label: 'Language', value: 'Vietnamese; English spoken in tourist areas' },
      { label: 'Time zone', value: 'ICT, UTC+7' },
      { label: 'Visa', value: 'E-visa available for Australian passport holders' },
      { label: 'Plugs', value: 'Type A/C, 220V' },
    ],
  },
  ID: {
    attractions: [
      { name: 'Mount Bromo', description: 'An active volcano in East Java, famous for its sunrise view over a sea of clouds.' },
      { name: 'Ubud, Bali', description: "Rice terraces, temples and a highland arts scene in Bali's cultural heart." },
      { name: 'Borobudur Temple', description: "The world's largest Buddhist temple, on Java, best seen at sunrise." },
      { name: 'Ijen Crater', description: 'Home to an electric-blue sulphur flame, visible only before dawn.' },
    ],
    thingsToKnow: [
      { label: 'Currency', value: 'Indonesian Rupiah (IDR)' },
      { label: 'Language', value: 'Indonesian (Bahasa Indonesia)' },
      { label: 'Time zone', value: 'WIB/WITA depending on region, UTC+7/+8' },
      { label: 'Visa', value: 'Visa on arrival available for Australian passport holders' },
      { label: 'Plugs', value: 'Type C/F, 230V' },
    ],
  },
  TH: {
    attractions: [
      { name: 'Doi Inthanon', description: "Thailand's highest peak, with jungle trails, waterfalls and hill-tribe villages." },
      { name: 'Chiang Mai Old City', description: 'Moated old town packed with temples, night markets and a laid-back highland pace.' },
      { name: 'Elephant Nature Park', description: 'An ethical elephant sanctuary near Chiang Mai — observation and care, not riding.' },
      { name: 'Wat Phra That Doi Suthep', description: 'A gold-spired mountaintop temple overlooking Chiang Mai.' },
    ],
    thingsToKnow: [
      { label: 'Currency', value: 'Thai Baht (THB)' },
      { label: 'Language', value: 'Thai; English spoken in tourist areas' },
      { label: 'Time zone', value: 'ICT, UTC+7' },
      { label: 'Visa', value: 'Visa exemption on arrival for Australian passport holders (short stays)' },
      { label: 'Plugs', value: 'Type A/B/C, 220V' },
    ],
  },
};

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    for (const [code, fields] of Object.entries(CONTENT)) {
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await queryInterface.sequelize.query(
        'SELECT id, attractions FROM destinations WHERE code = ? LIMIT 1',
        { replacements: [code] }
      );
      if (rows.length === 0) continue; // this destination isn't seeded here
      if (rows[0].attractions) continue; // already backfilled or staff-edited — never overwrite

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.bulkUpdate(
        'destinations',
        {
          attractions: JSON.stringify(fields.attractions),
          things_to_know: JSON.stringify(fields.thingsToKnow),
          updated_at: now,
        },
        { id: rows[0].id }
      );
    }
  },

  async down(queryInterface) {
    const codes = Object.keys(CONTENT);
    await queryInterface.bulkUpdate(
      'destinations',
      { attractions: null, things_to_know: null },
      { code: codes }
    );
  },
};
