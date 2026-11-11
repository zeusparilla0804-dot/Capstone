import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import sql from 'mssql';
import { closeDatabase, getDbPool } from '../config/database.js';
import type { PackagePricingType } from '../types/domain.types.js';

export interface ClientPackageDefinition {
  readonly eventType: string;
  readonly name: string;
  readonly description: string;
  readonly pricingType: PackagePricingType;
  readonly pricePerGuest: number | null;
  readonly basePrice: number | null;
  readonly includedGuests: number | null;
  readonly excessGuestPrice: number | null;
  readonly minGuests: number | null;
  readonly maxGuests: number | null;
  readonly inclusions: readonly string[];
}

export const CLIENT_PACKAGE_DEFINITIONS: readonly ClientPackageDefinition[] = [
  {
    eventType: 'Standard Catering', name: 'PHP 480 Per Head', description: 'Classic buffet catering tier.',
    pricingType: 'PER_HEAD', pricePerGuest: 480, basePrice: null, includedGuests: null,
    excessGuestPrice: null, minGuests: null, maxGuests: null,
    inclusions: [
      'Dinner rolls with butter',
      'Seasonal fresh fruit platter',
      'Choice of three main dishes: pork, chicken, and fish',
      'Choice of one pasta, noodle, or vegetable dish',
      'Steamed rice',
      'Choice of one dessert',
      'Choice of one drink',
      'Purified water with tube ice',
      'Buffet service',
      'Complete buffet setup with chafing dishes, silverware, and a buffet centerpiece',
      'Complete catering and dining utensils',
      'Menu labels for each dish',
      'Round tables with floor-length tablecloths, runners that match the event motif, and table toppers',
      'Basic table centerpieces',
      'Monobloc chairs with chair covers and ribbons',
      'Dressed beverage station, cake table, or gift table',
      'Trained and uniformed waitstaff and food attendants',
    ],
  },
  {
    eventType: 'Standard Catering', name: 'PHP 580 Per Head', description: 'Expanded buffet catering tier.',
    pricingType: 'PER_HEAD', pricePerGuest: 580, basePrice: null, includedGuests: null,
    excessGuestPrice: null, minGuests: null, maxGuests: null,
    inclusions: [
      'Choice of one appetizer',
      'Fresh garden salad with dressing',
      'Choice of four main dishes: beef, pork, chicken, and fish',
      'Choice of one pasta, noodle, or vegetable dish',
      'Steamed rice',
      'Choice of one dessert',
      'Choice of one drink',
      'Purified water with tube ice',
      'Buffet service',
      'Complete buffet setup with chafing dishes, silverware, and a buffet centerpiece',
      'Complete catering and dining utensils',
      'Menu labels for each dish',
      'Round tables with floor-length tablecloths, runners that match the event motif, and table toppers',
      'Basic table centerpieces',
      'Monobloc chairs with chair covers and ribbons',
      'Dressed beverage station, cake table, or gift table',
    ],
  },
  {
    eventType: 'Standard Catering', name: 'PHP 680 Per Head', description: 'Full buffet catering tier.',
    pricingType: 'PER_HEAD', pricePerGuest: 680, basePrice: null, includedGuests: null,
    excessGuestPrice: null, minGuests: null, maxGuests: null,
    inclusions: [
      'Choice of one soup',
      'Choice of four main dishes: beef, pork, chicken, and fish',
      'Choice of one pasta or noodle dish',
      'Choice of one vegetable dish',
      'Steamed rice',
      'Choice of one dessert',
      'Choice of one drink',
      'Purified water with tube ice',
      'Buffet service',
      'Complete buffet setup with chafing dishes, silverware, and a buffet centerpiece',
      'Complete catering and dining utensils',
      'Menu labels for each dish',
      'Round tables with floor-length tablecloths, runners that match the event motif, and table toppers',
      'Basic table centerpieces',
      'Monobloc chairs with chair covers and ribbons',
      'Dressed beverage station, cake table, or gift table',
      'Trained and uniformed waitstaff and food attendants',
    ],
  },
  {
    eventType: 'Wedding', name: 'Bronze Package', description: 'Classic wedding catering and celebration package for 50 guests.',
    pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 32_500, includedGuests: 50,
    excessGuestPrice: 650, minGuests: null, maxGuests: null,
    inclusions: [
      'Steamed rice', 'Choice of three main dishes: beef or pork, chicken, and fish',
      'Choice of one pasta or noodle, or vegetable', 'Choice of one dessert', 'Choice of one drink',
      'Purified water with tube ice', 'Complete catering setup: dressed tables, monoblock chairs, and catering utensils',
      "Couple's basic backdrop: three wooden panels, couple's initials, artificial flower accents, and couple's chair",
      'VIP and guest table centerpieces: artificial flower vase and table number',
      'Basic photo and video coverage: one photographer, one videographer, 20-page photo book, edited photos and video via Google Drive',
      'Basic photobooth, unlimited use for two hours',
      'Ordinary flower arrangement: bridal bouquet, flowers for two mothers, five principal sponsors, five secondary sponsors, and three flower girls',
      'Professional host and two usherettes', 'One-tier fondant cake', 'Basic sound and lights',
      'Trained and uniformed waiters and food attendants', 'Wine for bridal toasting',
    ],
  },
  {
    eventType: 'Wedding', name: 'Silver Package', description: 'Expanded wedding catering and celebration package for 100 guests.',
    pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 75_000, includedGuests: 100,
    excessGuestPrice: 750, minGuests: null, maxGuests: null,
    inclusions: [
      'Choice of one soup', 'Steamed rice', 'Choice of four main dishes: beef, pork, chicken, and fish',
      'Choice of one pasta or noodle, or vegetable', 'Choice of one dessert', 'Choice of one drink',
      'Purified water with tube ice', 'Complete catering setup: Tiffany chairs for 100 guests and catering utensils',
      "Couple's basic backdrop: three wooden panels, couple's initials, artificial flower accents, and couple's chair",
      'VIP and guest table centerpieces: artificial flower vase and table number',
      'Basic photo and video coverage: one photographer, one videographer, 20-page photo book, 11×14 wedding portrait, edited photos and video via Google Drive',
      'Basic photobooth, unlimited use for two hours',
      'Traditional hair and makeup for bride and groom: preparation and ceremony looks, makeup for two mothers, and reception look',
      'Ordinary flower arrangement: bridal bouquet, flowers for two mothers, five principal sponsors, five secondary sponsors, and three flower girls',
      'Professional host and two usherettes', 'Two-tier fondant cake', 'Basic sound and lights',
      'Grazing table for 50 guests', 'Wine for bridal toasting', 'Trained and uniformed waiters and food attendants',
    ],
  },
  {
    eventType: 'Wedding', name: 'Gold Package', description: 'Signature wedding catering and celebration package for 120 guests.',
    pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 102_000, includedGuests: 120,
    excessGuestPrice: 850, minGuests: null, maxGuests: null,
    inclusions: [
      'Choice of one soup', 'Steamed rice', 'Choice of one pasta or noodle',
      'Choice of four main dishes: beef, pork, chicken, and fish', 'Choice of one vegetable',
      'Choice of one dessert', 'Choice of one drink', 'Purified water with tube ice',
      'Complete catering setup: Tiffany chairs for 120 guests and catering utensils',
      'Styling: themed stage backdrop and entrance arch',
      'VIP and guest table centerpieces: table centerpiece and table number',
      'Photo and video coverage: two photographers, two videographers, 40-page photo book, 11×14 wedding portrait, same-day edit video, edited photos and video via Google Drive',
      'Magnetic photobooth, unlimited use for two hours',
      'Airbrush hair and makeup for bride and groom: preparation and ceremony looks, makeup for two mothers, and reception look',
      'Ordinary flower arrangement: bridal bouquet, flowers for two mothers, five principal sponsors, five secondary sponsors, and three flower girls',
      'Professional host and three usherettes', 'Two-tier fondant cake', 'Grazing table for 50 guests',
      'Coffee bar for 50 cups', 'Wine for bridal toasting', 'Trained and uniformed waiters and food attendants',
    ],
  },
  {
    eventType: 'Debut', name: 'Amethyst Package', description: 'Complete debut catering and event package.',
    pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 85_888, includedGuests: 50,
    excessGuestPrice: 650, minGuests: null, maxGuests: null,
    inclusions: [
      'Steamed rice', 'Choice of three main dishes',
      'Choice of one pasta, noodle, or vegetable', 'Choice of one dessert and one drink',
      'Complete catering setup and utensils', 'Basic three-panel debut backdrop and debutant chair',
      'Artificial-flower centerpieces and table numbers', 'Basic photo and video coverage with photo book',
      'Basic unlimited photobooth for two hours', 'Traditional hair and makeup for two looks',
      '18 roses, red carpet, toast, host, and usherette', 'Basic sound and lights, one-tier cake, and service staff',
    ],
  },
  {
    eventType: 'Debut', name: 'Diamond Package', description: 'Elevated debut catering and event package.',
    pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 138_888, includedGuests: 100,
    excessGuestPrice: 750, minGuests: null, maxGuests: null,
    inclusions: [
      'Choice of one soup', 'Steamed rice', 'Choice of four main dishes',
      'Choice of one pasta, noodle, or vegetable', 'Choice of one dessert and one drink',
      'Dressed VIP tables and Tiffany chairs with catering utensils',
      'Basic three-panel debut backdrop and debutant chair', 'Artificial-flower centerpieces and table numbers',
      'Photo and video coverage with photo book and portrait', 'Basic unlimited photobooth for two hours',
      'Traditional hair and makeup for two looks', '18 roses, red carpet, toast, host, and two usherettes',
      'Two-tier cake, grazing table, sound and lights, and service staff',
    ],
  },
  {
    eventType: 'Debut', name: 'Ruby Package', description: 'Signature debut catering and event package.',
    pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 198_888, includedGuests: 120,
    excessGuestPrice: 850, minGuests: null, maxGuests: null,
    inclusions: [
      'Choice of one soup', 'Steamed rice', 'Choice of four main dishes',
      'Choice of one pasta or noodle and one vegetable', 'Choice of one dessert and one drink',
      'Dressed VIP tables and Tiffany chairs with catering utensils', 'Themed stage backdrop and entrance arch',
      'Table centerpieces and table numbers', 'Photo and video coverage with photo book, portrait, and event videos',
      'Unlimited magnetic photobooth for two hours', 'Airbrush hair and makeup for two looks',
      '18 roses, red carpet, toast, host, and two usherettes',
      'Two-tier cake, grazing table, and coffee bar', 'Basic sound and lights with service staff',
    ],
  },
] as const;

export interface ClientAddOnDefinition {
  readonly name: string;
  readonly description: string;
  readonly price: number;
}

export const CLIENT_ADD_ON_DEFINITIONS: readonly ClientAddOnDefinition[] = [
  { name: 'Tiffany Chair', description: 'Tiffany chair rental, priced per chair.', price: 100 },
  { name: 'Same-Day Edit Video', description: 'Same-day edit video coverage.', price: 15_000 },
  { name: 'Airbrush Hair and Makeup Upgrade', description: 'Upgrade from traditional hair and makeup to airbrush.', price: 6_000 },
  { name: 'Stage Backdrop', description: 'Stage backdrop event enhancement.', price: 15_000 },
  { name: 'LED Wall', description: 'LED wall event enhancement.', price: 20_000 },
  { name: 'Basic Sound and Lights', description: 'Basic sound and lighting package.', price: 7_000 },
  { name: 'Professional Host', description: 'Professional event host.', price: 8_000 },
  { name: 'Host or Magician', description: 'Event host or magician.', price: 7_000 },
  { name: 'Basic Photobooth (2 Hours Unlimited)', description: 'Basic photobooth for two hours with unlimited use.', price: 4_000 },
  { name: 'Magnetic Photobooth (2 Hours Unlimited)', description: 'Magnetic photobooth for two hours with unlimited use.', price: 5_000 },
  { name: 'Mirror Photobooth (2 Hours Unlimited)', description: 'Mirror photobooth for two hours with unlimited use.', price: 10_000 },
  { name: 'Lechon (25-30 kg Live Weight)', description: 'Lechon with 25-30 kg live weight.', price: 12_500 },
  { name: 'Lechon (35-40 kg Live Weight)', description: 'Lechon with 35-40 kg live weight.', price: 14_000 },
  { name: 'Grazing Table for 50 Guests', description: 'Grazing table good for 50 guests.', price: 15_000 },
  { name: 'Grazing Table for 100 Guests', description: 'Grazing table good for 100 guests.', price: 22_000 },
  { name: 'Coffee Bar for 50 Guests', description: 'Coffee bar good for 50 guests.', price: 15_000 },
  { name: 'Coffee Bar for 100 Guests', description: 'Coffee bar good for 100 guests.', price: 22_000 },
] as const;

const PROVISIONAL_PACKAGE_NAMES = [
  'Anniversary Table',
  'Birthday Celebration',
  'Corporate Gathering',
  'Debut Signature',
  'Intimate Wedding Table',
  'Grand Wedding Banquet',
  'Family Fiesta',
  'Custom Celebration',
  'Browser QA Package',
  'Browser Debut Package',
  'Browser Medium Capacity Package',
] as const;

const PROVISIONAL_ADD_ON_NAMES = [
  'Dessert Table',
  'Beverage Station',
  'Premium Table Styling',
  'Additional Service Crew',
  'Lechon Station',
  'Coffee and Tea Bar',
] as const;

export interface CatalogWriter {
  upsertPackage(item: ClientPackageDefinition): Promise<void>;
  upsertAddOn(item: ClientAddOnDefinition): Promise<void>;
  deactivateProvisionalCatalog(): Promise<void>;
}

export interface CatalogSyncMode {
  readonly apply: boolean;
  readonly deactivateProvisional: boolean;
}

export function parseCatalogSyncMode(args: readonly string[]): CatalogSyncMode {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) {
    return { apply: false, deactivateProvisional: false };
  }
  if (args.length === 1 && args[0] === '--apply') {
    return { apply: true, deactivateProvisional: false };
  }
  if (args.length === 2 && args.includes('--apply') && args.includes('--deactivate-provisional')) {
    return { apply: true, deactivateProvisional: true };
  }
  if (args.includes('--deactivate-provisional') && !args.includes('--apply')) {
    throw new Error('--deactivate-provisional requires --apply.');
  }
  throw new Error(`Unsupported catalog sync argument: ${args.join(' ')}`);
}

export async function syncClientCatalog(options: {
  apply: boolean;
  deactivateProvisional?: boolean;
  writer: CatalogWriter;
}) {
  const inclusionCount = CLIENT_PACKAGE_DEFINITIONS.reduce((sum, item) => sum + item.inclusions.length, 0);
  const summary = {
    packageCount: CLIENT_PACKAGE_DEFINITIONS.length,
    inclusionCount,
    addOnCount: CLIENT_ADD_ON_DEFINITIONS.length,
  };
  if (!options.apply) {
    return { mode: 'dry-run' as const, ...summary, deactivatedProvisional: false };
  }
  for (const item of CLIENT_PACKAGE_DEFINITIONS) await options.writer.upsertPackage(item);
  for (const item of CLIENT_ADD_ON_DEFINITIONS) await options.writer.upsertAddOn(item);
  if (options.deactivateProvisional) await options.writer.deactivateProvisionalCatalog();
  return {
    mode: 'apply' as const,
    ...summary,
    deactivatedProvisional: options.deactivateProvisional === true,
  };
}

export function createSqlCatalogWriter(pool: sql.ConnectionPool): CatalogWriter {
  return {
    async upsertPackage(item) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const eventRequest = new sql.Request(transaction).input('eventType', sql.NVarChar(100), item.eventType);
        let eventResult = await eventRequest.query(`SELECT event_id FROM dbo.EVENT WITH(UPDLOCK,HOLDLOCK)
          WHERE event_type=@eventType`);
        if (!eventResult.recordset[0]) {
          eventResult = await new sql.Request(transaction)
            .input('eventType', sql.NVarChar(100), item.eventType)
            .query(`INSERT dbo.EVENT(event_type,description) OUTPUT INSERTED.event_id
              VALUES(@eventType,'Client-supplied LA Chef catalog category')`);
        }
        const eventId = Number(eventResult.recordset[0].event_id);
        const existing = await new sql.Request(transaction)
          .input('eventId', sql.Int, eventId)
          .input('name', sql.NVarChar(150), item.name)
          .query(`SELECT package_id FROM dbo.PACKAGE WITH(UPDLOCK,HOLDLOCK)
            WHERE event_id=@eventId AND package_name=@name`);
        const packageRequest = new sql.Request(transaction)
          .input('eventId', sql.Int, eventId).input('name', sql.NVarChar(150), item.name)
          .input('description', sql.NVarChar(1000), item.description)
          .input('pricingType', sql.VarChar(20), item.pricingType)
          .input('pricePerGuest', sql.Decimal(12,2), item.pricePerGuest)
          .input('basePrice', sql.Decimal(12,2), item.basePrice)
          .input('includedGuests', sql.Int, item.includedGuests)
          .input('excessGuestPrice', sql.Decimal(12,2), item.excessGuestPrice)
          .input('minGuests', sql.Int, item.minGuests).input('maxGuests', sql.Int, item.maxGuests);
        let packageId: number;
        if (existing.recordset[0]) {
          packageId = Number(existing.recordset[0].package_id);
          await packageRequest.input('packageId', sql.Int, packageId).query(`UPDATE dbo.PACKAGE SET
            description=@description,pricing_type=@pricingType,price_per_head=@pricePerGuest,
            base_price=@basePrice,included_guests=@includedGuests,excess_guest_price=@excessGuestPrice,
            min_guest=@minGuests,max_guest=@maxGuests,is_active=1 WHERE package_id=@packageId`);
        } else {
          const inserted = await packageRequest.query(`INSERT dbo.PACKAGE(
              event_id,package_name,description,pricing_type,price_per_head,base_price,included_guests,
              excess_guest_price,min_guest,max_guest,is_active)
            OUTPUT INSERTED.package_id VALUES(
              @eventId,@name,@description,@pricingType,@pricePerGuest,@basePrice,@includedGuests,
              @excessGuestPrice,@minGuests,@maxGuests,1)`);
          packageId = Number(inserted.recordset[0].package_id);
        }
        for (const inclusion of item.inclusions) {
          await new sql.Request(transaction)
            .input('packageId', sql.Int, packageId)
            .input('itemName', sql.NVarChar(150), inclusion.slice(0, 150))
            .input('description', sql.NVarChar(1000), inclusion)
            .query(`IF EXISTS(SELECT 1 FROM dbo.MENU_ITEM WHERE package_id=@packageId AND item_name=@itemName)
                UPDATE dbo.MENU_ITEM SET category='INCLUSION',description=@description
                WHERE package_id=@packageId AND item_name=@itemName
              ELSE INSERT dbo.MENU_ITEM(package_id,item_name,category,description)
                VALUES(@packageId,@itemName,'INCLUSION',@description)`);
        }
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },
    async upsertAddOn(item) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const existing = await new sql.Request(transaction)
          .input('name', sql.NVarChar(150), item.name)
          .query(`SELECT add_on_id FROM dbo.ADD_ON WITH(UPDLOCK,HOLDLOCK)
            WHERE add_on_name=@name`);
        const request = new sql.Request(transaction)
          .input('name', sql.NVarChar(150), item.name)
          .input('description', sql.NVarChar(1000), item.description)
          .input('price', sql.Decimal(12, 2), item.price);
        if (existing.recordset[0]) {
          await request
            .input('addOnId', sql.Int, Number(existing.recordset[0].add_on_id))
            .query(`UPDATE dbo.ADD_ON SET description=@description,price=@price,is_active=1
              WHERE add_on_id=@addOnId`);
        } else {
          await request.query(`INSERT dbo.ADD_ON(add_on_name,description,price,is_active)
            VALUES(@name,@description,@price,1)`);
        }
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },
    async deactivateProvisionalCatalog() {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const request = new sql.Request(transaction)
          .input('disposablePrefix', sql.NVarChar(1000), 'Disposable %');
        const packageParameters = PROVISIONAL_PACKAGE_NAMES.map((name, index) => {
          const parameter = `packageName${index}`;
          request.input(parameter, sql.NVarChar(150), name);
          return `@${parameter}`;
        });
        const addOnParameters = PROVISIONAL_ADD_ON_NAMES.map((name, index) => {
          const parameter = `addOnName${index}`;
          request.input(parameter, sql.NVarChar(150), name);
          return `@${parameter}`;
        });
        await request.query(`
          UPDATE dbo.PACKAGE SET is_active=0
          WHERE is_active=1 AND (
            package_name IN (${packageParameters.join(',')}) OR description LIKE @disposablePrefix
          );
          UPDATE dbo.ADD_ON SET is_active=0
          WHERE is_active=1 AND (
            add_on_name IN (${addOnParameters.join(',')}) OR description LIKE @disposablePrefix
          );
        `);
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },
  };
}

async function main() {
  const mode = parseCatalogSyncMode(process.argv.slice(2));
  if (!mode.apply) {
    const result = await syncClientCatalog({
      apply: false,
      writer: {
        upsertPackage: async () => {},
        upsertAddOn: async () => {},
        deactivateProvisionalCatalog: async () => {},
      },
    });
    console.log(`Dry run: ${result.packageCount} packages, ${result.inclusionCount} inclusions, and ${result.addOnCount} add-ons are ready. No data changed.`);
    return;
  }
  const pool = await getDbPool();
  const result = await syncClientCatalog({
    apply: true,
    deactivateProvisional: mode.deactivateProvisional,
    writer: createSqlCatalogWriter(pool),
  });
  const cleanupMessage = result.deactivatedProvisional ? ' Provisional catalog entries were deactivated.' : '';
  console.log(`Applied ${result.packageCount} packages, ${result.inclusionCount} inclusions, and ${result.addOnCount} add-ons.${cleanupMessage}`);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryPoint) {
  main().finally(closeDatabase).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
