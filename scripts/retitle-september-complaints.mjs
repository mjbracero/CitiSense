// Gives each seeded September complaint a unique title + description that still
// matches its category. Only title/description change; routing and notification
// triggers are disabled for the update so category, office, status and dates stay.
// Usage:
//   node scripts/retitle-september-complaints.mjs rows.json > .tmp-retitle.sql
//   supabase db query --linked -f .tmp-retitle.sql
// rows.json: [{ "id": "...", "category": "..." }, ...]
import { readFileSync } from "node:fs";

const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));

const EN_PLACES = [
  "near the barangay hall",
  "beside the chapel",
  "near the elementary school",
  "along the national highway",
  "in front of the health center",
  "near the basketball court",
  "by the waiting shed",
  "near the sari-sari store",
  "at the corner of the main road",
  "near the day care center",
  "beside the small bridge",
  "behind the covered court",
  "near the purok center",
  "along the farm-to-market road",
];
const CEB_PLACES = [
  "duol sa barangay hall",
  "tupad sa kapilya",
  "duol sa eskwelahan",
  "sa kilid sa highway",
  "atubangan sa health center",
  "duol sa basketball court",
  "sa waiting shed",
  "duol sa tindahan",
  "sa kanto sa dalan",
  "duol sa day care",
  "duol sa gamay nga tulay",
  "luyo sa covered court",
  "sa sentro sa purok",
  "sa farm-to-market road",
];

const EN_SINCE = [
  "This has been going on for three days now.",
  "It started last Monday and nothing has changed.",
  "We first noticed it two weeks ago.",
  "It has been like this since the start of the month.",
  "It got worse after the heavy rain last night.",
  "Residents have been complaining about it for a week.",
  "It happens almost every day, especially in the afternoon.",
  "This is the second time we are reporting this.",
];
const EN_ASK = [
  "Please send someone to check as soon as possible.",
  "We hope the office can act on this right away.",
  "Kindly inspect the area and fix it.",
  "Please help us, many residents are affected.",
  "We are requesting immediate assistance.",
  "Hoping for your quick response. Thank you.",
];
const CEB_SINCE = [
  "Tulo na ka adlaw nga ingon ani.",
  "Nagsugod ni sa miaging Lunes ug wala pay kausaban.",
  "Duha na ka semana sukad namo kini namatikdan.",
  "Sukad pa sa sinugdanan sa bulan ingon ani na.",
  "Misamot kini human sa kusog nga ulan gabii.",
  "Usa na ka semana nga nagreklamo ang mga residente.",
  "Halos adlaw-adlaw kini mahitabo labi na sa hapon.",
  "Ikaduha na ni namo nga report.",
];
const CEB_ASK = [
  "Palihug padala ug tawo aron susihon dayon.",
  "Hinaot maaksyunan dayon sa opisina.",
  "Palihug inspeksyona ug ayuha.",
  "Tabangi mi palihug, daghan ang naapektuhan.",
  "Nangayo mi ug dinaliang tabang.",
  "Salamat daan sa inyong paspas nga aksyon.",
];

// Category -> base issues. lang "en" | "ceb". Optional places override the generic landmarks.
const POOLS = {
  "Road and Infrastructure Concerns": [
    ["en", "Deep potholes on the road", "Deep potholes have formed on the road and motorcycles almost fall when it rains."],
    ["ceb", "Guba nga dalan", "Guba na kaayo ang dalan ug lisod na agian sa mga sakyanan labi na kung ting-ulan."],
    ["en", "Cracked bridge railing", "The railing of the bridge is cracked and loose and is dangerous for pedestrians and students."],
    ["en", "Unfinished road concreting", "The road concreting was left unfinished and the loose gravel is causing accidents."],
    ["ceb", "Nabuak nga semento sa dalan", "Nabuak ang semento sa dalan ug nagbuy-od ang mga bato nga delikado sa motor."],
    ["en", "Sinking road shoulder", "The road shoulder is sinking and vehicles that pull over could slide into the ditch."],
    ["en", "Damaged sidewalk slabs", "The sidewalk slabs are broken and uneven so pedestrians have to walk on the road."],
    ["ceb", "Lapok nga dalan human sa ulan", "Lapok kaayo ang dalan kada human sa ulan ug dili na maagian sa tricycle."],
  ],
  "Streetlight Concerns": [
    ["en", "Streetlight not working", "The streetlight is not working and the area is very dark at night."],
    ["ceb", "Patay ang suga sa dalan", "Dugay na nga patay ang streetlight diri ug delikado moagi kung gabii."],
    ["en", "Flickering streetlight", "The streetlight keeps flickering and turns off completely after midnight."],
    ["en", "Streetlight on during the day", "The streetlight stays on the whole day, which wastes electricity."],
    ["ceb", "Nabuak nga bombilya sa poste", "Nabuak ang bombilya sa poste ug ngitngit na kaayo ang dalan kung gabii."],
    ["en", "Leaning streetlight post", "The streetlight post is leaning and the lamp no longer lights the road."],
    ["ceb", "Ngitngit nga dalan tungod walay suga", "Walay suga sa dalan mao nga daghan na ang nahadlok moagi kung gabii."],
  ],
  "Water Concerns": [
    ["ceb", "Walay tubig sa among lugar", "Walay tubig nga moabot sa among lugar ug kinahanglan pa mi mopalit."],
    ["en", "Leaking water pipe on the road", "A water pipe is leaking on the road and wasting a lot of water."],
    ["en", "Dirty water from the faucet", "The water from our faucet is brown and has a bad smell."],
    ["en", "Very low water pressure", "The water pressure is very low and barely fills a pail in an hour."],
    ["ceb", "Buak nga tubo sa tubig", "Buak ang tubo sa tubig ug nagbaha na ang kilid sa dalan."],
    ["en", "Water only flows at midnight", "Water only comes out of our faucet around midnight and stops before morning."],
    ["ceb", "Lubog nga tubig gikan sa gripo", "Lubog ug baho ang tubig nga mogawas sa gripo mao nga dili na mainom."],
  ],
  "Waste and Environmental Concerns": [
    ["ceb", "Daghan ug basura sa kilid sa dalan", "Wala pa makolekta ang basura ug baho na kaayo ug daghan na langaw."],
    ["en", "Uncollected garbage piling up", "Garbage bags have piled up beside the road and are blocking part of the sidewalk."],
    ["ceb", "Illegal dumping sa bakanteng lote", "Adunay nag-ilabay ug basura sa bakanteng lote ug baho na kaayo."],
    ["en", "Open burning of plastic waste", "Someone burns plastic garbage at night and the smoke is affecting children with asthma."],
    ["en", "Overflowing garbage bin", "The public garbage bin is overflowing and stray animals scatter the trash."],
    ["ceb", "Wala moagi ang garbage truck", "Wala moagi ang garbage truck sa among purok mao nga nagtapok na ang basura."],
    ["en", "Foul smell from waste dumped in the creek", "Waste is being thrown into the creek and the smell reaches the houses nearby."],
  ],
  "Drainage and Flooding Concerns": [
    ["en", "Clogged drainage causing flood", "The drainage canal is clogged with garbage and the street floods even after light rain."],
    ["ceb", "Baha kada ulan", "Kada ulan mobaha diri tungod kay barado ang kanal ug musulod ang tubig sa balay."],
    ["en", "Open drainage without cover", "The drainage has no cover and a child almost fell in. Please install a grill cover."],
    ["en", "Stagnant water in the canal", "Water in the canal is not flowing and has turned black and smelly."],
    ["ceb", "Barado nga kanal", "Barado ang kanal sa yuta ug sagbot mao nga dili makaagas ang tubig."],
    ["en", "Collapsed drainage wall", "Part of the drainage wall has collapsed and soil is falling into the canal."],
  ],
  "Traffic and Road Safety Concerns": [
    ["en", "Illegal parking causing traffic", "Vehicles are parked on both sides of the road causing heavy traffic every morning."],
    ["ceb", "Walay traffic enforcer sa crossing", "Grabe ang traffic sa crossing kung buntag ug hapon kay walay traffic enforcer."],
    ["en", "Faded pedestrian lane", "The pedestrian lane has faded and students have difficulty crossing."],
    ["en", "Speeding motorcycles", "Motorcycles speed through this road even when children are crossing."],
    ["ceb", "Nawala ang traffic sign", "Nawala ang stop sign sa kanto mao nga daghan na ang hapit magbanggaay."],
    ["en", "Tricycles blocking the lane", "Tricycles wait for passengers in the middle of the lane and block traffic."],
  ],
  "Fire Safety Concerns": [
    ["en", "Fire hazard from tangled wires", "Illegal electrical connections and tangled wires near houses may cause a fire."],
    ["ceb", "Sunog sa sagbot", "Adunay nagsunog ug sagbot duol sa mga balay ug delikado kaayo kay hangin."],
    ["en", "Smoke coming from a junk shop", "Thick smoke is coming from a junk shop storing scrap and plastic."],
    ["ceb", "Nagsige ug sunog ug basura", "Adunay nagsige ug sunog ug basura duol sa mga balay nga hinimo sa kahoy."],
    ["en", "Blocked fire exit", "The fire exit of a building is blocked by stored goods and boxes."],
    ["en", "LPG tanks stored in the open", "Many LPG tanks are stored in the open under direct sunlight."],
  ],
  "Health and Sanitation Concerns": [
    ["en", "Stagnant water breeding mosquitoes", "There is stagnant water in an abandoned lot with many mosquitoes and we are worried about dengue."],
    ["ceb", "Baho nga septic tank", "Nag-awas ang septic tank sa silingan ug baho kaayo ang palibot."],
    ["en", "Request for fogging due to dengue", "There are several dengue cases in our purok and we request fogging and a clean-up drive."],
    ["en", "Unsanitary food stall", "A food stall prepares food beside an open canal with flies everywhere."],
    ["ceb", "Daghang nagkasakit og hilanat", "Daghan sa among silingan ang nagkasakit og hilanat ug kalibanga."],
    ["en", "Public toilet with no water", "The public toilet has no water and is very dirty and smelly."],
  ],
  "Peace and Order Concerns": [
    ["en", "Late night noise and drinking", "A group is drinking and making loud noise until 2 AM almost every night."],
    ["ceb", "Kawatan sa among lugar", "Daghan na nawad-an ug motor ug gamit sa among lugar. Palihug pag-patrol."],
    ["en", "Suspicious persons at night", "Unknown persons are loitering in the area every night."],
    ["ceb", "Away sa mga batan-on", "Kanunay mag-away ang mga batan-on diri kung gabii ug nahadlok ang mga residente."],
    ["en", "Vandalism on walls and gates", "Walls and gates in the area have been spray-painted overnight."],
  ],
  "Animal Concerns": [
    ["en", "Stray dogs roaming the street", "Several stray dogs are roaming and chasing children going to school."],
    ["ceb", "Iro nga nangpaak", "Adunay iro nga nangpaak sa mga tawo nga moagi. Palihug aksyuni."],
    ["en", "Dead animal on the road", "A dead dog has been lying on the side of the road and it smells very bad."],
    ["en", "Loose livestock on the road", "Goats and cows are left loose on the road and cause near accidents."],
    ["ceb", "Daghang iring nga ihalas", "Daghan na kaayo ang ihalas nga iring nga nangsulod sa mga balay."],
  ],
  "Public Market Concerns": [
    ["en", "Dirty comfort room in the market", "The comfort room in the public market is very dirty and has no water."],
    ["en", "Vendors blocking the aisle", "Vendors are placing their goods on the aisle making it hard for buyers to pass."],
    ["ceb", "Baha sa sulod sa merkado", "Mobaha sa sulod sa merkado kung ulan tungod sa guba nga atop."],
    ["en", "Broken market stall roof", "The roof above the market stalls is broken and leaks when it rains."],
  ],
  "Disaster and Emergency Concerns": [
    ["en", "Landslide risk after heavy rain", "Soil from the hillside is sliding onto the road after heavy rain and houses below are at risk."],
    ["ceb", "Natumba nga kahoy sa dalan", "Adunay kahoy nga natumba sa dalan tungod sa kusog nga hangin ug dili makaagi ang sakyanan."],
    ["en", "Fallen live wire after the storm", "A live wire fell onto the road after the storm and is sparking."],
    ["ceb", "Nagbitak nga yuta sa bungtod", "Nagbitak ang yuta sa bungtod duol sa mga balay human sa sunod-sunod nga ulan."],
  ],
  "Public Plaza Concerns": [
    ["en", "Broken benches at the plaza", "Several benches at the plaza are broken and unsafe to sit on."],
    ["en", "Plaza lights not working", "Most of the lights at the plaza are not working and the area is dark at night."],
    ["ceb", "Hugaw nga plaza", "Hugaw kaayo ang plaza ug daghang basura nga gibilin sa mga tawo."],
  ],
  "Transport Terminal Concerns": [
    ["en", "Overcharging by barkers", "Some barkers at the terminal are charging extra fees to passengers."],
    ["en", "Broken waiting area seats", "Most seats in the terminal waiting area are broken and there is no fan."],
    ["ceb", "Walay suga kung gabii", "Ngitngit kaayo ang terminal kung gabii ug delikado sa mga pasahero."],
  ],
  "City Facility Concerns": [
    ["en", "Broken aircon", "The air conditioner is broken and it is very hot for people waiting."],
    ["ceb", "Guba nga CR", "Guba ang flush sa CR ug walay tubig."],
    ["en", "Leaking roof", "The roof leaks whenever it rains and the floor gets slippery."],
  ],
  "Building and Construction Concerns": [
    ["en", "Construction without permit", "A structure is being built beside the road without any building permit posted."],
    ["en", "Construction materials blocking the sidewalk", "Sand and hollow blocks from a construction site are blocking the sidewalk."],
    ["ceb", "Delikado nga guba nga building", "Adunay daan nga building nga hapit na matumba ug duol sa agianan sa tawo."],
  ],
  "Coastal and Marine Protection Concerns": [
    ["en", "Illegal fishing near the shore", "Some fishermen are using fine nets and dynamite near the shore at night."],
    ["en", "Mangroves being cut down", "People are cutting mangroves along the coast for firewood."],
    ["ceb", "Basura sa baybayon", "Daghan kaayo ang basura nga gianod sa baybayon."],
  ],
  "PWD Accessibility Concerns": [
    ["en", "No wheelchair ramp", "There is no ramp for persons with disability so wheelchair users cannot enter."],
    ["en", "Blocked PWD ramp", "The PWD ramp is blocked by parked motorcycles."],
    ["ceb", "Taas kaayo nga hagdan nga walay handrail", "Taas ang hagdan ug walay handrail nga makapit sa mga senior ug PWD."],
  ],
  "Tax and Treasury Concerns": [
    ["en", "Long queue for real property tax payment", "The queue at the treasurer's office is very long and there is only one cashier open."],
    ["en", "No official receipt for tax payment", "We paid our real property tax but were told to come back for the official receipt."],
  ],
  Unclassified: [
    ["ceb", "Walay kuryente sukad gabii", "Walay kuryente sukad pa kagabii ug wala pay abiso."],
    ["en", "Sagging wires near the houses", "Wires are sagging very low near the houses and children play under them."],
    ["en", "Frequent power interruptions", "There are frequent brownouts in our area without any announcement."],
    ["ceb", "Nagsige ug brownout", "Halos adlaw-adlaw nga mag-brownout diri sa hapon."],
    ["en", "Electric post leaning over the road", "An electric post is leaning over the road after a truck hit it."],
  ],
};

// Venue-type categories use spots inside the venue instead of neighborhood landmarks.
const PLACE_OVERRIDES = {
  "Public Market Concerns": {
    en: ["at the fish section", "at the meat section", "near the vegetable stalls", "at the back entrance", "near the dry goods section", "on the second floor"],
    ceb: ["sa isdaan", "sa karnehan", "duol sa utanan", "sa likod nga ganghaan"],
  },
  "Transport Terminal Concerns": {
    en: ["at the central bus terminal", "at the van loading area", "at the jeepney bay", "near the ticket booth"],
    ceb: ["sa central bus terminal", "sa van terminal", "sa jeepney bay"],
  },
  "City Facility Concerns": {
    en: ["at the city hall lobby", "at the covered court", "at the sports complex", "on the city hall second floor"],
    ceb: ["sa city hall", "sa covered court", "sa sports complex"],
  },
  "Public Plaza Concerns": {
    en: ["near the stage", "by the fountain", "near the playground", "along the walkway"],
    ceb: ["duol sa entablado", "duol sa fountain", "sa agianan"],
  },
  "Coastal and Marine Protection Concerns": {
    en: ["near the fish landing", "along the Polambato shoreline", "near the boat docking area"],
    ceb: ["duol sa dunggoanan sa baroto", "sa baybayon sa Polambato"],
  },
  "Tax and Treasury Concerns": {
    en: ["at the city treasurer's office", "during the payment deadline"],
    ceb: ["sa opisina sa treasurer"],
  },
};

function* combos(category) {
  const pool = POOLS[category] || POOLS.Unclassified;
  const override = PLACE_OVERRIDES[category];
  const maxPlaces = Math.max(EN_PLACES.length, CEB_PLACES.length);
  for (let p = 0; p < maxPlaces; p += 1) {
    for (let b = 0; b < pool.length; b += 1) {
      const [lang, baseTitle, baseDescription] = pool[b];
      const places = override ? override[lang] : lang === "en" ? EN_PLACES : CEB_PLACES;
      if (p >= places.length) continue;
      const since = lang === "en" ? EN_SINCE : CEB_SINCE;
      const ask = lang === "en" ? EN_ASK : CEB_ASK;
      yield {
        title: `${baseTitle} ${places[p]}`,
        description: `${baseDescription} ${since[(b + p) % since.length]} ${ask[(b * 3 + p) % ask.length]}`,
      };
    }
  }
}

const generators = new Map();
const usedTitles = new Set();
const updates = [];

for (const row of rows) {
  if (!generators.has(row.category)) generators.set(row.category, combos(row.category));
  const generator = generators.get(row.category);
  let next = generator.next();
  while (!next.done && usedTitles.has(next.value.title)) next = generator.next();
  if (next.done) throw new Error(`Ran out of unique titles for ${row.category}`);
  usedTitles.add(next.value.title);
  updates.push({ id: row.id, ...next.value });
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const TRIGGERS = [
  "enforce_complaint_routing_update_trigger",
  "admin_complaint_notification_trigger",
  "complaint_change_notification_trigger",
  "moderator_complaint_notification_trigger",
];

console.log("begin;");
for (const t of TRIGGERS) console.log(`alter table public.complaints disable trigger ${t};`);
console.log(`update public.complaints c set title = v.title, description = v.description
from (values
${updates.map((u) => `  (${q(u.id)}::uuid, ${q(u.title)}, ${q(u.description)})`).join(",\n")}
) as v(id, title, description)
where c.id = v.id;`);
for (const t of TRIGGERS) console.log(`alter table public.complaints enable trigger ${t};`);
console.log("commit;");
