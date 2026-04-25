const prefixes = [
  'Aerin', 'Bran', 'Cael', 'Dwyn', 'Eron', 'Fara', 'Galen', 'Hael',
  'Ilys', 'Jorn', 'Kael', 'Lyra', 'Mira', 'Nox', 'Orin', 'Pyre',
  'Quill', 'Rael', 'Sova', 'Talon', 'Ulan', 'Vera', 'Wren', 'Xan',
  'Yael', 'Zara', 'Aldric', 'Brynn', 'Calix', 'Draven',
];
const suffixes = [
  'shade', 'storm', 'thorn', 'wind', 'vale', 'fire', 'frost', 'dawn',
  'dusk', 'blade', 'song', 'gale', 'fang', 'star', 'veil', 'crest',
  'ash', 'brook', 'ember', 'hollow', 'peak', 'ridge', 'wake', 'wisp',
];

export function randomFantasyName() {
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];
  return p + s;
}
