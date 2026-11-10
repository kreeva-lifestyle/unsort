// A small, editable Hindi / Hinglish → English word list for the look-alike
// detector (tagLook.ts) — it only SUGGESTS ("'Kala' looks like 'Black'"); it
// never tags a product by itself (matching uses only the names and "also
// known as" words staff saved). Keys and values are tagKey() forms. Add a
// line when staff keep accepting the same translation by hand.
export const HINDI: Record<string, string> = {
  // colours
  kala: 'black', kaala: 'black', kali: 'black', kaali: 'black',
  lal: 'red', laal: 'red',
  safed: 'white', safaid: 'white', sufaid: 'white',
  peela: 'yellow', pila: 'yellow', peeli: 'yellow', pili: 'yellow',
  hara: 'green', hari: 'green', haraa: 'green',
  neela: 'blue', nila: 'blue', neeli: 'blue', nili: 'blue',
  gulabi: 'pink', gulaabi: 'pink',
  narangi: 'orange', santri: 'orange',
  jamuni: 'purple', baingani: 'purple',
  bhura: 'brown', bhoora: 'brown',
  sunehra: 'golden', sunehri: 'golden', sunhera: 'golden',
  chandi: 'silver', chaandi: 'silver', rupehri: 'silver',
  // work
  kadhai: 'embroidery', kadai: 'embroidery', kadhaai: 'embroidery', 'kadhai work': 'embroidery',
  gota: 'gota patti', gotta: 'gota patti', 'gota work': 'gota patti',
  jari: 'zari', jaree: 'zari',
  resham: 'thread work', 'resham work': 'thread work',
  bandhej: 'bandhani', bandhni: 'bandhani', bandani: 'bandhani',
  chikan: 'chikankari', 'chikan kari': 'chikankari', chikenkari: 'chikankari',
  sitara: 'sequins', sitare: 'sequins', sitaara: 'sequins',
  moti: 'pearl', 'moti work': 'pearl',
  chapai: 'printed', chhapai: 'printed', chhapa: 'printed',
  // fabric
  reshmi: 'silk', resmi: 'silk',
  suti: 'cotton', sooti: 'cotton',
  malmal: 'mulmul',
};

/** Words that name a shade of a colour: "rani pink", "baby pink", "bottle green" → the head colour. */
export const SHADE_WORDS = new Set([
  'rani', 'baby', 'light', 'dark', 'deep', 'pastel', 'neon', 'bottle', 'royal', 'sky', 'navy', 'hot', 'dusty',
  'onion', 'mehendi', 'mehndi', 'lemon', 'mint', 'pale', 'bright', 'dull', 'off', 'ice', 'peacock', 'parrot',
  'wine', 'rust', 'olive', 'lime', 'sea', 'powder', 'blush', 'candy', 'coral', 'ash', 'charcoal', 'jet',
]);
