import { stripVTControlCharacters } from 'node:util';

export function tokenWeight(text: string) {
  let weight = 0;
  for (const character of stripVTControlCharacters(text)) {
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character)) weight += 1;
    else if (character >= ' ' || /[\r\n\t]/.test(character)) weight += 0.25;
  }
  return weight;
}
