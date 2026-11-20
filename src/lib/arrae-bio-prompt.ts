/**
 * Anai's prompt for turning an artist's own bio into an ARRAE bio (the one on the Shopify
 * collection and the printable profile). Keep it word for word, so every bio is written the same way.
 */
export const ARRAE_BIO_PROMPT = `Extrapolate from the provided artist biography all the necessary details to recreate a biography using the specifics provided below: DO NOT ADD OR INVENT OR INFER ANYTHING THAT ISNT DIRECTLY IN THEIR BIO. IF REQUESTED INFORMATION BELOW IS MISSING PLEASE SKIP BUT CHECK THOROUGHLY. Write a ~100-120 word artist biography in third person using this formula: 1. Hook: name, medium, and what makes the artist’s work unique. 2. Context: location and background or training. 3. Artistic journey: inspiration or development. 4. Practice & themes: describe medium, process, and key themes. 5. Achievements: include up to three notable exhibitions/awards. 6. Current & upcoming: mention ongoing projects or shows. 7. Closing: a sentence tying the work to why it matters or its appeal to collectors. Tone: ARRAE voice, professional, clear, accessible; avoid jargon. Use short paragraphs. No dashes, use commas instead. Avoid buzzwords or overly poetic/flowery language. Important: Double check for accuracy. Ensure there is no added content or assumptions made only strictly use information provided below. If there isnt sufficient information then its ok to end short.`;

/** The prompt with this artist's own bio attached, ready to paste into Claude. */
export function arraeBioRequest(name: string, ownBio: string) {
  return `${ARRAE_BIO_PROMPT}\n\nArtist: ${name}\n\nArtist biography:\n${ownBio.trim()}`;
}
