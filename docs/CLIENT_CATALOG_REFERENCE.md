# LA Chef Client Catalog Reference

## Source

This reference was transcribed from two promotional materials supplied by LA Chef. It should guide catalog design and data modeling. Before production entry, the client should approve the transcription, current availability, spelling, and prices.

The promotional artwork remains source material. This file records business data without embedding personal or unrelated document content.

The client also supplied a [public Google Drive folder of original event photos](https://drive.google.com/drive/folders/1qX39SoDi-sZ6-G2Pd_hC7GOrbGpzlAgD). The current website import was captured on October 17, 2026. The folder is still being completed by the client, so this is a provisional media inventory rather than the final gallery set.

## Client Photo Inventory

The website stores local copies of the supplied photos so package galleries do not depend on Google Drive availability or sharing permissions at runtime.

| Website category | Client source folder | Imported photos |
| --- | --- | ---: |
| Wedding | Wedding, including its nested folder | 19 |
| Debut | Debut, including its nested folders | 29 |
| Birthday | Kids Birthday, including `7th Birthday` | 13 |
| Corporate | Business Forum and Team Building | 10 |

- Total current import: 71 original JPEG files.
- Anniversary, Standard Catering, and Custom Event galleries continue to use the existing placeholders until matching client photos are supplied.
- The same category gallery is shared by packages in that category. Per-package photo assignment can be added later if LA Chef identifies which images belong to each specific offer.
- New client photos should be appended to the matching local category folder and gallery mapping after their event category is confirmed.

## Standard Catering Packages

### PHP 480 Per Head

- Steamed rice
- Choice of one pasta, noodle, or vegetable
- Choice of three main dishes: pork, chicken, and fish
- Choice of one dessert
- Choice of one drink
- Purified water with tube ice

### PHP 580 Per Head

- Steamed rice
- Choice of one pasta, noodle, or vegetable
- Choice of four main dishes: beef, pork, chicken, and fish
- Choice of one dessert
- Choice of one drink
- Purified water with tube ice

### PHP 680 Per Head

- Choice of one soup
- Steamed rice
- Choice of one pasta or noodle
- Choice of four main dishes: beef, pork, chicken, and fish
- Choice of one vegetable
- Choice of one dessert
- Choice of one drink
- Purified water with tube ice

### Shared Standard Inclusions

- Menage buffet service
- Complete buffet setup with chafing dishes, silverware, and buffet centerpiece
- Complete catering and dining utensils
- Menu labels for each menu item
- Round-table setting with floor-length cloth, motif runner, and table topper
- Basic table centerpieces
- Dressed monoblock chairs with cover and ribbon
- Dressed drinking station, cake table, or gift table
- Trained and uniformed waiters and food attendants

## Debut Packages

### Amethyst Package

- Base price: PHP 85,888
- Included capacity: 50 guests
- Excess guest rate: PHP 650 per head
- Food: steamed rice; three main dishes; one pasta, noodle, or vegetable; one dessert; one drink; purified water with tube ice
- Setup: dressed tables and monoblock chairs; complete catering utensils
- Basic backdrop: three wooden panels, debutant's name, artificial flower accents, and debutant's chair
- Centerpieces: vase with artificial flowers and table number
- Photo and video: one photographer, one videographer, 20-page photo book, and edited files delivered through Google Drive
- Basic unlimited photobooth for two hours
- Traditional hair and makeup for preparation and reception looks
- 18 roses, red carpet, and wine for debutant toast
- Professional host and one usherette
- Basic sound and lights
- One-tier fondant cake
- Trained and uniformed waiters and food attendants

### Diamond Package

- Base price: PHP 138,888
- Included capacity: 100 guests
- Excess guest rate: PHP 750 per head
- Food: one soup; steamed rice; four main dishes; one pasta, noodle, or vegetable; one dessert; one drink; purified water with tube ice
- Setup: dressed VIP tables and Tiffany chairs for all guests; complete catering utensils
- Basic backdrop: three wooden panels, debutant's name, artificial flower accents, and debutant's chair
- Centerpieces: vase with artificial flowers and table number
- Photo and video: one photographer, one videographer, 20-page photo book, 11x14 debutant portrait, and edited files delivered through Google Drive
- Basic unlimited photobooth for two hours
- Traditional hair and makeup for preparation and reception looks
- 18 roses, red carpet, and wine for debutant toast
- Professional host and two usherettes
- Two-tier edible fondant cake
- Grazing table for 50 guests
- Basic sound and lights
- Trained and uniformed waiters and food attendants

### Ruby Package

- Base price: PHP 198,888
- Included capacity: 120 guests
- Excess guest rate: PHP 850 per head
- Food: one soup; steamed rice; four main dishes; one pasta or noodle; one vegetable; one dessert; one drink; purified water with tube ice
- Setup: dressed VIP tables and Tiffany chairs for all guests; complete catering utensils
- Styling: themed stage backdrop and entrance arch
- Centerpieces: table centerpiece and table number
- Photo and video: one photographer, one videographer, 40-page photo book, 11x14 debutant portrait, save-the-date video, same-day edit video, and edited files delivered through Google Drive
- Unlimited magnetic photobooth for two hours
- Airbrush hair and makeup for preparation and reception looks
- 18 roses, red carpet, and wine for debutant toast
- Professional host and two usherettes
- Two-tier edible fondant cake
- Grazing table for 50 guests
- Coffee bar for 50 cups
- Basic sound and lights
- Trained and uniformed waiters and food attendants

## Add-Ons and Event Enhancements

| Add-on | Price |
| --- | ---: |
| Tiffany chair | PHP 100 per chair |
| Same-day edit video | PHP 15,000 |
| Traditional hair and makeup upgraded to airbrush | PHP 6,000 |
| Stage backdrop | PHP 15,000 |
| LED wall | PHP 20,000 |
| Basic sound and lights | PHP 7,000 |
| Professional host | PHP 8,000 |
| Host or magician | PHP 7,000 |
| Basic photobooth, two hours unlimited | PHP 4,000 |
| Magnetic photobooth, two hours unlimited | PHP 5,000 |
| Mirror photobooth, two hours unlimited | PHP 10,000 |
| Lechon, 25-30 kg live weight | PHP 12,500 |
| Lechon, 35-40 kg live weight | PHP 14,000 |
| Grazing table for 50 guests | PHP 15,000 |
| Grazing table for 100 guests | PHP 22,000 |
| Coffee bar for 50 guests | PHP 15,000 |
| Coffee bar for 100 guests | PHP 22,000 |

## Brand and Content Direction

- Use the official LA Chef monogram and business name consistently.
- The visual tone is formal, elegant, celebratory, and service-led.
- Client photography should be preferred over generic catering stock imagery.
- Strong recurring colors are warm ivory, muted gold, deep wine, plum, and dark navy.
- Avoid reproducing dense flyer layouts directly in the website. Translate the information into readable package comparison and detail views.

## Required Data-Model Changes

The current package schema supports one `price_per_head` value. It cannot accurately represent the debut pricing above. Before importing these offers, add an explicit pricing model such as:

- `pricing_type`: `PER_HEAD` or `BASE_PLUS_EXCESS`
- `base_price`: fixed included-package price
- `included_guests`: guest count included in the base price
- `excess_guest_price`: price for each guest over the included capacity
- `min_guests` and `max_guests`: booking constraints

The calculation service must snapshot all applicable values on the reservation. Package inclusions should remain structured menu or inclusion records rather than one long description.

## Client Confirmation Checklist

- **Pending:** Confirm that every listed price remains current.
- **Pending:** Confirm whether the PHP 480, PHP 580, and PHP 680 tiers have official package names. The controlled sync currently uses the literal labels `PHP 480 Per Head`, `PHP 580 Per Head`, and `PHP 680 Per Head`.
- **Pending:** Confirm whether `Standard Catering` is the preferred website category name for the three general per-head tiers.
- **Pending:** Confirm the minimum and maximum guest count for each standard and debut package. Both limits remain `NULL` until confirmed.
- **Pending:** Confirm whether add-ons are available for every event type.
- **Pending:** Confirm whether "host or magician" is one combined option or two separately priced options.
- **Pending:** Confirm whether debut package prices include taxes, delivery, venue fees, or geographic restrictions.
- **Confirmed from the supplied client materials:** Facebook/Messenger uses `https://www.facebook.com/share/1F8DnqJnB9/`; public contact details are Panorama Ville, Dita, Santa Rosa, Laguna; Smart `0939-298-7324`; Globe `0926-089-4301`; and Viber `0947-966-2352`.
- **Partially complete:** Original event photos have been imported for Wedding, Debut, Kids Birthday, Business Forum, and Team Building. Matching photos are still pending for Anniversary, Standard Catering, and Custom Event packages, along with final confirmation that the shared Drive collection is complete.
- **Pending:** Obtain the final official web-ready logo files.

## Controlled Catalog Sync

Run `npm.cmd run db:catalog:sync -- --dry-run` from `backend` to inspect the six packages, 86 inclusions, and 17 add-ons without changing data. The command defaults to dry-run when no flag is provided. Only an explicit `--apply` performs parameterized upserts. The optional `--deactivate-provisional` flag is valid only with `--apply`; it deactivates the known legacy sample entries without deleting reservations or financial history. Unrelated catalog rows remain untouched.

Do not run `--apply` against production until every pending price, label, category, and guest-limit item above is confirmed by LA Chef.
