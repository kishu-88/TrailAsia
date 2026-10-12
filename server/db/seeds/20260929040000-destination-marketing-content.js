'use strict';

/**
 * Backfills the public marketing + travel-guide fields for the six
 * destinations seeded by `20260828000100-destinations.js`. Those columns
 * (`summary`, `highlights`, `bestTimeToVisit`, etc.) were added by later
 * migrations but never populated, so the public site launched with real
 * destinations that carried no marketing content at all — every destination
 * card and page was effectively blank. This is a content backfill, not a
 * structural change: it only fills columns that are still NULL, so running
 * it again (or after staff have started editing this content by hand) is a
 * no-op rather than an overwrite.
 *
 * Image URLs are placeholders (`images.trailasia.example`, matching the
 * `@trailasia.example` convention already used for placeholder emails) —
 * there is no real photography yet; swap these for real assets before
 * go-live.
 */

const CONTENT = {
  NP: {
    summary:
      'Trek to Everest Base Camp through Sherpa villages, suspension bridges and high mountain passes, with local guides who know the route in every season.',
    hero_image_url: 'https://images.trailasia.example/destinations/nepal-ebc-hero.jpg',
    highlights: JSON.stringify([
      'Everest Base Camp views',
      'Sherpa-guided villages',
      'Tengboche monastery',
      'Kala Patthar sunrise',
    ]),
    duration_days: 14,
    price_from_amount: '3200.00',
    price_from_currency_code: 'AUD',
    best_time_to_visit: 'March–May and September–November, when skies are clearest and passes are snow-free',
    fitness_level: 'strenuous',
    what_to_pack: JSON.stringify([
      'Layered thermal clothing',
      'Broken-in trekking boots',
      'Water purification tablets',
      'Personal first-aid kit',
      'Sunscreen and UV sunglasses — high-altitude sun is intense',
    ]),
    culture_notes:
      "Most trails pass through Sherpa Buddhist communities — walk clockwise around mani walls and chortens, ask before photographing people or monasteries, and dress modestly in villages.",
  },
  BT: {
    summary:
      "A high-value, low-impact kingdom where trekking is balanced with dzongs, monasteries clinging to cliffs, and a government-set daily tariff that funds conservation.",
    hero_image_url: 'https://images.trailasia.example/destinations/bhutan-tigers-nest-hero.jpg',
    highlights: JSON.stringify([
      "Tiger's Nest monastery hike",
      'Punakha Dzong',
      'Licensed local guide throughout',
      'Conservation fee included in ground arrangements',
    ]),
    duration_days: 10,
    price_from_amount: '4200.00',
    price_from_currency_code: 'AUD',
    best_time_to_visit: 'October–November and March–April, for clear mountain views and festival season',
    fitness_level: 'moderate',
    what_to_pack: JSON.stringify([
      'Modest layered clothing — temples require covered shoulders and knees',
      "Good daypack for the Tiger's Nest hike",
      'Small amount of cash in Ngultrum',
      'Reusable water bottle',
    ]),
    culture_notes:
      "Bhutan is licensed-guide-only for foreign visitors — you won't explore independently. Remove shoes before entering temples; photography is often restricted inside dzongs, and your guide will tell you where.",
  },
  TIB: {
    summary:
      "The Tibetan plateau's monasteries, high passes and Everest's north face, travelled as a permitted group under a licensed Tibetan guide.",
    hero_image_url: 'https://images.trailasia.example/destinations/tibet-potala-hero.jpg',
    highlights: JSON.stringify([
      'Everest North Base Camp',
      'Potala Palace, Lhasa',
      'Yamdrok Lake',
      'Guided high-altitude acclimatisation route',
    ]),
    duration_days: 12,
    price_from_amount: '3800.00',
    price_from_currency_code: 'AUD',
    best_time_to_visit:
      'April–June and September–October; exact dates are confirmed once permits are issued for your group',
    fitness_level: 'challenging',
    what_to_pack: JSON.stringify([
      'Warm layers for high-altitude nights',
      'Any altitude-sickness medication discussed with your doctor beforehand',
      'Printed copies of your permit documents',
      'Sun protection for intense high-altitude glare',
    ]),
    culture_notes:
      "Entry requires a Tibet Travel Permit arranged as a group — independent travel isn't possible here. Be respectful photographing monks and pilgrims, and avoid raising political topics.",
  },
  VN: {
    summary:
      "From Hanoi's old quarter to Ha Long Bay's limestone karsts and the terraced hills of Sapa, a slower-paced introduction to Southeast Asia trekking.",
    hero_image_url: 'https://images.trailasia.example/destinations/vietnam-halong-hero.jpg',
    highlights: JSON.stringify([
      'Ha Long Bay overnight cruise',
      'Sapa rice-terrace trekking',
      'Hanoi street-food walking tour',
      'Local homestays',
    ]),
    duration_days: 9,
    price_from_amount: '2400.00',
    price_from_currency_code: 'AUD',
    best_time_to_visit:
      'September–November and March–April, avoiding the wettest summer months and the Tet (Lunar New Year) crowds',
    fitness_level: 'easy',
    what_to_pack: JSON.stringify([
      'Light breathable clothing plus a rain layer',
      'Comfortable walking shoes for old-quarter cobblestones and rice terraces',
      'Motion-sickness tablets for the Ha Long Bay transfer',
      'A phrasebook or translation app',
    ]),
    culture_notes:
      'Bargaining is expected in markets but not in restaurants or shops with marked prices. Dress modestly at temples and pagodas, and ask before photographing hill-tribe communities in Sapa.',
  },
  ID: {
    summary:
      "Volcano sunrise treks in Java, jungle trails in Bali's highlands, and coastal downtime built around the trip, not instead of it.",
    hero_image_url: 'https://images.trailasia.example/destinations/indonesia-bromo-hero.jpg',
    highlights: JSON.stringify([
      'Mount Bromo sunrise trek',
      'Balinese rice-terrace trekking',
      'Local guide-led village visits',
      'Optional coastal extension',
    ]),
    duration_days: 8,
    price_from_amount: '2100.00',
    price_from_currency_code: 'AUD',
    best_time_to_visit:
      "April–October (dry season) — Bromo's sunrise trek is weather-dependent and best outside the wet months",
    fitness_level: 'moderate',
    what_to_pack: JSON.stringify([
      "A warm layer for the pre-dawn Bromo climb — it's colder than the daytime heat suggests",
      'Sturdy shoes with grip for volcanic ash and grit',
      'Reef-safe sunscreen',
      'Modest clothing for temple visits',
    ]),
    culture_notes:
      'Sarongs are provided or required at temple entrances — your guide will have spares. Ask before entering a family compound, and use your right hand when giving or receiving anything.',
  },
  TH: {
    summary:
      'Jungle trekking in the northern hills around Chiang Mai, ethical elephant encounters, and a gentler pace for a first Southeast Asia trip.',
    hero_image_url: 'https://images.trailasia.example/destinations/thailand-chiangmai-hero.jpg',
    highlights: JSON.stringify([
      'Chiang Mai hill-tribe trekking',
      'Ethical elephant sanctuary visit',
      'Doi Inthanon national park',
      'Thai cooking class',
    ]),
    duration_days: 7,
    price_from_amount: '1800.00',
    price_from_currency_code: 'AUD',
    best_time_to_visit: 'November–February, the cool, dry season in the north',
    fitness_level: 'easy',
    what_to_pack: JSON.stringify([
      'Light layers plus a light jacket for cooler highland evenings',
      'Insect repellent',
      'Closed-toe shoes for jungle trails',
      'A change of clothes for the elephant sanctuary — expect mud and water',
    ]),
    culture_notes:
      "The head is considered sacred and the feet the lowest part of the body — avoid touching anyone's head and don't point your feet at people or Buddha images. Dress modestly at temples.",
  },
};

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    for (const [code, fields] of Object.entries(CONTENT)) {
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await queryInterface.sequelize.query(
        'SELECT id, summary FROM destinations WHERE code = ? LIMIT 1',
        { replacements: [code] }
      );
      if (rows.length === 0) continue; // this destination isn't seeded here
      if (rows[0].summary) continue; // already backfilled or staff-edited — never overwrite

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.bulkUpdate(
        'destinations',
        { ...fields, updated_at: now },
        { id: rows[0].id }
      );
    }
  },

  async down(queryInterface) {
    const codes = Object.keys(CONTENT);
    await queryInterface.bulkUpdate(
      'destinations',
      {
        summary: null,
        hero_image_url: null,
        highlights: null,
        duration_days: null,
        price_from_amount: null,
        price_from_currency_code: null,
        best_time_to_visit: null,
        fitness_level: null,
        what_to_pack: null,
        culture_notes: null,
      },
      { code: codes }
    );
  },
};
