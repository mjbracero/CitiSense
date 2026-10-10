// Generates SQL that inserts demo complaints dated Sep 1–12, 2026 (Asia/Manila)
// located inside Bogo City. Usage:
//   node scripts/seed-september-complaints.mjs > .tmp-seed.sql
//   supabase db query --linked -f .tmp-seed.sql
import { randomUUID } from "node:crypto";

const TOTAL = Number(process.argv[2] || 400);

const CITIZEN_IDS = [
  "094c243a-38e8-4267-9f50-3db438ca6cfa",
  "4ab629d9-e3af-4798-bb32-fab287547c7e",
  "b40b507d-cbf8-46d7-b1b4-ce9cb82f26fc",
  "6891af17-3cc0-42a6-b6f1-7c0ff564d578",
  "0b25c698-83f9-47a3-8438-74b9bc566d3e",
  "42b3f488-1871-4cd4-8176-c08671c99f50",
  "aaefe357-bd25-489b-a1a2-b507c2bea2c7",
  "608102eb-f665-43be-a370-15327a32dffd",
  "34d3f64a-e3cc-4589-9546-0f33ff315749",
  "341b925b-3298-4c6c-86ed-8a316a251556",
  "8ef62fc6-f160-43ff-a0d7-9d309b202a97",
  "96f0b304-87e4-4361-a59d-893ef59d0f3c",
  "da871f20-f52c-4920-964b-d28ccd7ea4b7",
  "7f9c0e6f-16e6-414c-abb3-21294a1d3095",
  "429982d5-d94d-490c-ae77-dcaf1f0ba37a",
];

// Approximate barangay centers; all within BOGO_CITY_BOUNDS (lib/bogoCityBounds.js).
const BARANGAYS = [
  ["Anonang Norte", 11.08, 124.045],
  ["Anonang Sur", 11.072, 124.05],
  ["Banban", 11.0, 124.025],
  ["Binabag", 11.015, 124.035],
  ["Bungtod", 11.055, 124.028],
  ["Carbon", 11.055, 124.006],
  ["Cayang", 11.01, 124.015],
  ["Cogon", 11.0525, 124.008],
  ["Dakit", 11.065, 124.018],
  ["Don Pedro Rodriguez", 11.025, 124.06],
  ["Gairan", 11.0444, 124.0183],
  ["Guadalupe", 11.03, 124.045],
  ["La Paz", 11.035, 124.01],
  ["La Purisima Concepcion", 11.044, 124.007],
  ["Libertad", 11.0203, 124.02],
  ["Lourdes", 11.047, 124.009],
  ["Malingin", 11.045, 124.045],
  ["Marangog", 11.095, 124.03],
  ["Nailon", 11.085, 124.02],
  ["Odlot", 11.06, 124.055],
  ["Pandan", 11.07, 124.04],
  ["Polambato", 11.078, 124.008],
  ["Sambag", 11.035, 124.03],
  ["San Vicente", 11.038, 124.014],
  ["Santo Niño", 11.05, 124.006],
  ["Siocon", 11.102, 124.04],
  ["Sudlonon", 11.09, 124.055],
  ["Taytayan", 11.058, 124.012],
];

const STREETS = [
  "National Highway",
  "P. Rodriguez Street",
  "A. Pedroza Street",
  "San Vicente Street",
  "Mabini Street",
  "Rizal Street",
  "Bonifacio Street",
  "Barangay Road",
  "Farm-to-Market Road",
  "Coastal Road",
];

// [category, office, weight, [[title, description], ...]]
const CATEGORIES = [
  ["Waste and Environmental Concerns", "CENRO", 12, [
    ["Daghan ug basura sa kilid sa dalan", "Wala pa makolekta ang basura sulod sa usa ka semana. Baho na kaayo ug daghan na langaw."],
    ["Uncollected garbage near the market", "Garbage bags have piled up beside the road for several days and are blocking part of the sidewalk."],
    ["Illegal dumping sa bakanteng lote", "Adunay nag-ilabay ug basura sa bakanteng lote. Nagkadaghan na ang basura ug baho kaayo."],
    ["Burning of garbage every night", "A neighbor burns plastic garbage every night. The smoke is affecting children with asthma."],
  ]],
  ["Road and Infrastructure Concerns", "City Engineering Office", 11, [
    ["Damaged road with big potholes", "There are deep potholes on the road. Motorcycles almost fall every time it rains."],
    ["Guba nga dalan", "Guba na kaayo ang dalan ug lisod na agian sa mga sakyanan labi na kung ting-ulan."],
    ["Cracked bridge railing", "The railing of the small bridge is cracked and loose. It is dangerous for pedestrians and students."],
    ["Unfinished road concreting", "The road concreting was left unfinished and the loose gravel causes accidents."],
  ]],
  ["Streetlight Concerns", "City Engineering Office", 9, [
    ["Not working streetlight", "The streetlight has not been working for two weeks. The area is very dark at night."],
    ["Patay ang suga sa dalan", "Dugay na nga patay ang streetlight diri. Delikado moagi kung gabii."],
    ["Flickering streetlight near school", "The streetlight near the school keeps flickering and turns off completely after midnight."],
  ]],
  ["Drainage and Flooding Concerns", "City Engineering Office", 8, [
    ["Clogged drainage causing flood", "The drainage canal is clogged with garbage. The street floods even after light rain."],
    ["Baha kada ulan", "Kada ulan mobaha diri tungod kay barado ang kanal. Musulod na ang tubig sa mga balay."],
    ["Open drainage without cover", "The drainage has no cover and a child almost fell in. Please install a grill cover."],
  ]],
  ["Water Concerns", "Bogo Water District", 8, [
    ["Walay tubig sulod sa tulo ka adlaw", "Walay tubig nga moabot sa among lugar sulod na sa tulo ka adlaw."],
    ["Leaking water pipe on the road", "A water pipe is leaking on the road and wasting a lot of water since yesterday."],
    ["Dirty water from the faucet", "The water from our faucet is brown and has a bad smell."],
  ]],
  ["Traffic and Road Safety Concerns", "BTMO", 7, [
    ["Illegal parking along the highway", "Vehicles are parked on both sides of the highway causing heavy traffic every morning."],
    ["Walay traffic enforcer sa crossing", "Grabe ang traffic sa crossing kung buntag ug hapon kay walay traffic enforcer."],
    ["Missing pedestrian lane near school", "The pedestrian lane near the school has faded. Students have difficulty crossing."],
  ]],
  ["Health and Sanitation Concerns", "City Health Office", 6, [
    ["Stagnant water breeding mosquitoes", "There is stagnant water in an abandoned lot and many mosquitoes. We are worried about dengue."],
    ["Baho nga septic tank", "Nag-awas ang septic tank sa silingan ug baho kaayo ang palibot."],
    ["Request for fogging due to dengue cases", "There are several dengue cases in our purok. We request fogging and a clean-up drive."],
  ]],
  ["Animal Concerns", "City Veterinary Office", 5, [
    ["Stray dogs roaming the street", "Several stray dogs are roaming and chasing children going to school."],
    ["Iro nga nangpaak", "Adunay iro nga nangpaak sa mga tawo nga moagi. Palihug aksyuni."],
    ["Dead animal on the road", "There is a dead dog on the side of the road for two days now and it smells very bad."],
  ]],
  ["Peace and Order Concerns", "Bogo City Police Station / PNP", 5, [
    ["Late night noise and drinking", "A group is drinking and making loud noise until 2 AM almost every night."],
    ["Kawatan sa among lugar", "Daghan na nawad-an ug motor ug gamit sa among lugar. Palihug pag-patrol."],
    ["Suspicious persons at night", "There are unknown persons loitering near the waiting shed every night."],
  ]],
  ["Fire Safety Concerns", "BFP Bogo City Fire Station", 3, [
    ["Fire hazard from tangled wires", "Illegal electrical connections and tangled wires near houses may cause a fire."],
    ["Sunog sa sagbot duol sa balay", "Adunay nagsunog ug sagbot duol sa mga balay. Delikado kaayo kay hangin."],
  ]],
  ["Disaster and Emergency Concerns", "CDRRMO", 3, [
    ["Landslide risk after heavy rain", "Soil from the hillside is sliding onto the road after heavy rain. Houses below are at risk."],
    ["Natumba nga kahoy sa dalan", "Adunay kahoy nga natumba sa dalan tungod sa kusog nga hangin. Dili makaagi ang sakyanan."],
  ]],
  ["Public Market Concerns", "Bogo Public Market Office", 3, [
    ["Dirty comfort room in the public market", "The comfort room in the public market is very dirty and has no water."],
    ["Vendors blocking market aisle", "Vendors are placing their goods on the aisle making it hard for buyers to pass."],
  ]],
  ["Transport Terminal Concerns", "Bogo City Central Bus Terminal Office", 2, [
    ["Overcharging at the bus terminal", "Some barkers at the terminal are charging extra fees to passengers."],
    ["Broken seats at the terminal waiting area", "Most seats in the terminal waiting area are broken and there is no fan."],
  ]],
  ["City Facility Concerns", "General Services Office", 3, [
    ["Broken aircon at city hall lobby", "The air conditioner at the city hall lobby is broken and it is very hot for people waiting."],
    ["Guba nga CR sa city hall", "Guba ang flush sa CR sa city hall ug walay tubig."],
  ]],
  ["Public Plaza Concerns", "Bogo Public Plaza Office", 2, [
    ["Broken benches at the plaza", "Several benches at the plaza are broken and some lights are not working."],
  ]],
  ["Building and Construction Concerns", "Office of the Building Official", 2, [
    ["Construction without permit", "A structure is being built beside the road without any building permit posted."],
    ["Construction materials blocking sidewalk", "Sand and hollow blocks from a construction site are blocking the sidewalk."],
  ]],
  ["Coastal and Marine Protection Concerns", "Bantay Dagat", 1, [
    ["Illegal fishing near the shore", "Some fishermen are using fine nets and dynamite near the shore at night."],
  ]],
  ["PWD Accessibility Concerns", "PDAO", 1, [
    ["No wheelchair ramp at the health center", "The barangay health center has no ramp for persons with disability."],
  ]],
  ["Tax and Treasury Concerns", "City Treasurer's Office", 1, [
    ["Long queue for real property tax payment", "The queue at the treasurer's office is very long and there is only one cashier open."],
  ]],
];

const STATUS_WEIGHTS = [
  ["Pending", 42],
  ["In Progress", 26],
  ["For Validation", 12],
  ["Completed", 20],
];

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const END_UTC = Date.UTC(2026, 8, 12, 23, 59, 59) - MANILA_OFFSET_MS;
const HOUR = 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let seed = 20260901;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + rand() * (max - min);
function weighted(list, weightIndex) {
  const total = list.reduce((sum, item) => sum + item[weightIndex], 0);
  let roll = rand() * total;
  for (const item of list) {
    roll -= item[weightIndex];
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}

function randomCreatedAt() {
  const day = Math.floor(rand() * 12);
  // Office hours only: 8:00 AM – 4:59 PM.
  const hour = 8 + Math.floor(rand() * 9);
  const minute = Math.floor(rand() * 60);
  const second = Math.floor(rand() * 60);
  return Date.UTC(2026, 8, 1 + day, hour, minute, second) - MANILA_OFFSET_MS;
}

function formatSubmitted(utcMs) {
  const d = new Date(utcMs + MANILA_OFFSET_MS);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}

const iso = (ms) => new Date(ms).toISOString();
const q = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);

const rows = [];
for (let i = 0; i < TOTAL; i += 1) {
  const id = randomUUID();
  const [category, office, , templates] = weighted(CATEGORIES, 2);
  const [title, description] = pick(templates);
  const [barangay, lat0, lng0] = pick(BARANGAYS);
  const latitude = Number((lat0 + between(-0.004, 0.004)).toFixed(7));
  const longitude = Number((lng0 + between(-0.004, 0.004)).toFixed(7));
  const purok = 1 + Math.floor(rand() * 7);
  const locationText = `Purok ${purok}, ${pick(STREETS)}, ${barangay}, Bogo City, Cebu`;

  const emergencyCategory = ["Fire Safety Concerns", "Disaster and Emergency Concerns", "Peace and Order Concerns"].includes(category);
  const isEmergency = emergencyCategory ? rand() < 0.6 : rand() < 0.04;
  const priority = isEmergency
    ? "Critical"
    : weighted([["High", 18], ["Normal", 70], ["Low", 12]], 1)[0];

  const createdAt = randomCreatedAt();
  let status = weighted(STATUS_WEIGHTS, 1)[0];

  const aiCorrect = rand() < 0.965;
  const wrong = weighted(CATEGORIES.filter((c) => c[0] !== category), 2);
  const aiCategory = aiCorrect ? category : wrong[0];
  const aiOffice = aiCorrect ? office : wrong[1];
  const aiConfidence = Number((aiCorrect ? between(0.72, 0.98) : between(0.5, 0.78)).toFixed(2));

  let inProgressAt = null;
  let forValidationAt = null;
  let completedAt = null;
  if (status !== "Pending") {
    inProgressAt = createdAt + between(1, 30) * HOUR;
    if (inProgressAt > END_UTC) status = "Pending";
  }
  if (status === "For Validation" || status === "Completed") {
    forValidationAt = inProgressAt + between(2, 48) * HOUR;
    if (forValidationAt > END_UTC) status = "In Progress";
  }
  if (status === "Completed") {
    completedAt = forValidationAt + between(1, 24) * HOUR;
    if (completedAt > END_UTC) status = "For Validation";
  }
  if (status === "Pending") {
    inProgressAt = null;
    forValidationAt = null;
    completedAt = null;
  } else if (status === "In Progress") {
    forValidationAt = null;
    completedAt = null;
  } else if (status === "For Validation") {
    completedAt = null;
  }

  const completed = status === "Completed";
  rows.push(
    `(${[
      q(id),
      q(CITIZEN_IDS[i % CITIZEN_IDS.length]),
      q(title),
      q(description),
      q(`09${String(Math.floor(rand() * 1e9)).padStart(9, "0")}`),
      q(isEmergency ? "Emergency" : "Non-Emergency"),
      isEmergency,
      q(status),
      q(priority),
      q(category),
      q(office),
      q(locationText),
      latitude,
      longitude,
      q(formatSubmitted(createdAt)),
      "'[]'::jsonb",
      q(iso(createdAt)),
      q(aiCategory),
      q(aiOffice),
      aiConfidence,
      q(iso(createdAt)),
      q(iso(createdAt + 2000)),
      q(inProgressAt && iso(inProgressAt)),
      q(forValidationAt && iso(forValidationAt)),
      q(completedAt && iso(completedAt)),
      q(completed ? "Validated" : null),
      q(completed ? "Validated" : null),
      q(completed ? "resolved" : null),
      q(completed ? "The issue has been fixed. Thank you." : null),
      q(completed ? iso(completedAt) : null),
      q(completed ? "approved" : null),
      completed ? "true" : "null",
      completed ? Number(between(0.8, 0.97).toFixed(2)) : "null",
      q(completed ? "mark_complete" : null),
    ].join(", ")})`
  );
}

const NOTIFY_TRIGGERS = [
  "admin_complaint_notification_trigger",
  "complaint_change_notification_trigger",
  "complaints_citizen_validation_admin_notify",
  "moderator_complaint_notification_trigger",
];

console.log("begin;");
for (const t of NOTIFY_TRIGGERS) console.log(`alter table public.complaints disable trigger ${t};`);
console.log(`insert into public.complaints (
  id, citizen_id, title, description, contact_number, complaint_type, is_emergency,
  status, priority, category, assigned_office, location_text, latitude, longitude,
  submitted_date_time, photo_urls, created_at,
  ai_category, ai_assigned_office, ai_confidence, ai_analyzed_at, routed_at,
  in_progress_at, for_validation_at, completed_at,
  validation_status, citizen_validation_status, citizen_validation_answer,
  citizen_validation_feedback, citizen_validated_at,
  ai_validation_status, ai_validation_approved, ai_validation_confidence,
  ai_validation_recommendation
) values
${rows.join(",\n")};`);
for (const t of NOTIFY_TRIGGERS) console.log(`alter table public.complaints enable trigger ${t};`);
console.log("commit;");
