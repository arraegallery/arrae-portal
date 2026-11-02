import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** The artist partnership terms shown before the application, from the original Airtable form. Editable on the Shows page. */
export const DEFAULT_TERMS = `**Partnering with ARRAE Gallery**

ARRAE is a contemporary art gallery in Coconut Grove. We are continuing to build our artist roster and shape a collection that reflects the diversity and texture of art in Miami.

We welcome both emerging and established artists working in a range of media, including painting, sculpture, ceramics, fiber, print, and beyond. We're looking for original work that's well-crafted and visually strong — pieces that hold their own in a group setting and contribute to a thoughtful, layered collection.

Our curatorial style leans toward contemporary work with a clear point of view. That might mean bold color and form, quiet material presence, or a focus on process and texture. We're especially interested in pieces that reflect the artist's hand and perspective rather than trend-driven or mass-produced aesthetics. If your work is priced between $100 and $10,000 and aligns with this kind of approach, we'd love to see it.

We're especially focused on reaching a growing but underserved group within the art world; new collectors who care deeply about good work and appreciate a straightforward, genuine presentation. They're looking for meaningful pieces at approachable prices. We want to make space for that; for honest connections between artists and collectors without overcomplicating the process.

We prioritize transparency, collaboration, and accessibility for both artists and collectors. We don't require artist exclusivity. We work in partnership with artists and maintain a clear, fair, and intentional approach.

## Artist Partnership Outline

**Consignment Term**
Our standard consignment agreement lasts approximately 4 months and can be renewed by mutual consent. We do not require exclusivity.

**Commission Structure**
- Artist receives 55%
ARRAE covers transaction fees. Artist payments are issued at the earliest within 30 days of cleared funds from sale, latest by the end of the collection (volume).

**Pricing**
You set the retail price. It should include ARRAE's commission.
Work must be priced between $100 and $10,000.
We ask that comparable work (same size, medium, and date) not be listed elsewhere at a lower price.
For the duration of the contract plus six months, any client introduced by ARRAE should be routed through the gallery.

**Discounts & Promotions**
ARRAE may offer a discount or share of up to 10% to close a sale, support a promotion, or benefit a charitable partner. This is split using the same commission ratio.

**Shipping**
Buyers cover packing, shipping, and insurance.
If ARRAE offers free shipping, the cost is deducted from the sale price before commission is calculated.

**Submitting Work**
Artists may submit up to 3 completed works via the application form. If selected, we may invite additional submissions.
Decisions are made a few weeks prior to show openings.

Accepted work must arrive ready to display and at the pre-arranged date and time. This includes:
- Framing or appropriate hardware
- Clear labeling (artist name, title, medium, year, price)
- Certificate of Authenticity (we can assist if you don't have one)

**Exhibition Format**
ARRAE is a curated retail-style space that features a wide range of work at once. Pieces are shown in context alongside others; creating a rich, approachable environment for discovery and conversation.

**Artist Events**
We host occasional artist-led events, such as casual coffee talks, where collectors and visitors can meet the makers and hear more about the work.`;

/** A short fingerprint of the terms text, saved with each agreement so a change asks people to agree again. */
export function termsVersion(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export async function getTerms() {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "application_terms"));
  const text = row?.value?.trim() || DEFAULT_TERMS;
  return { text, version: termsVersion(text), custom: !!row };
}
