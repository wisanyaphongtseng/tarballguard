// Synthetic deterministic USTAR/gzip: index.html references style.css and absent app.js.
// Regeneration and byte identity are tested against the existing missing-reference fixture.
const exampleBase64 = 'H4sIAAAAAAACCu3TwQ6CMAwG4J15ioUHGAVBEkXeZYwpyIRlm4nE+O4GNWo4Ewym36VNe2qaX3PR8IMM6raUF1a5kyKTAwBYx/GjAsC4AqSrTz/MwyhJE0KBzOBsHTcEYIojv49biEzVbUMrI/c7nwXW9UoyYa2fe5kVptaOWiOGFdeaHa2fZ8FznnsELZ9+5f/9efKD/EfpOP9xEmL+51B0ZU+vVHSqMxtaKC6aLb1hthFC6N/dAf8eL5MADAAA';

export function createExamplePackage(): File {
  const bytes = Uint8Array.from(atob(exampleBase64), character => character.charCodeAt(0));
  return new File([bytes], 'b08-example.tgz', { type: 'application/gzip', lastModified: 0 });
}
