import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Prisma, PrismaClient } from '@prisma/client';

type PrefixMap = Map<string, string>;

type CliOptions = {
  showHelp: boolean;
  defaultSaleTypeId: number;
  defaultArea: number;
  targetPerSection: number;
  sectionIds?: number[];
  prefixMapPath?: string;
  separator: string;
  padding: number;
  startNumber: number;
  resume: boolean;
  dryRun: boolean;
  yes: boolean;
  description?: string;
};

type SectionSummary = {
  sectionId: number;
  sectionName: string;
  existingBefore: number;
  generated: number;
  finalTotal: number;
  prefix: string;
  firstStall?: string;
  lastStall?: string;
};

type ClickConfig = {
  serviceId: string;
  merchantId: string;
} | null;

const prisma = new PrismaClient();

function printHelp(): void {
  console.log(`
Usage:
  npx ts-node scripts/generate-stalls.ts --saleTypeId=1 --area=12.5 [options]

Options:
  --saleTypeId <id>        SaleType id used for every generated stall (required)
  --area <value>           Default stall area in square meters (required)
  --target <count>         Desired total stalls per section (default: 150)
  --sectionIds <ids>       Comma separated section ids (defaults to every section)
  --prefixMap <path>       JSON file that maps section ids/names to stall prefixes
  --separator <char>       Stall number separator between prefix and digits (default: "-")
  --padding <n>            Minimum digits for the numeric part (default: 3)
  --start <n>              Starting index for stall numbers (default: 1)
  --[no-]resume            Continue numbering after the highest existing suffix (default: resume)
  --description <text>     Description applied to each generated stall
  --dry-run                Preview without writing to the database
  --yes                    Required to actually insert rows (safety latch)
  --help                   Show this message
`);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value "${value}"`);
}

function parseNumberOption(value: string | undefined, label: string): number {
  if (!value) {
    throw new Error(`Missing value for --${label}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for --${label}: ${value}`);
  }
  return parsed;
}

function parsePositiveNumber(value: string | undefined, label: string): number {
  const parsed = parseNumberOption(value, label);
  if (parsed <= 0) {
    throw new Error(`--${label} must be greater than 0`);
  }
  return parsed;
}

function parsePositiveInt(value: string | undefined, label: string): number {
  const parsed = parsePositiveNumber(value, label);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${label} must be an integer`);
  }
  return parsed;
}

function parseSectionIds(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => Number(id));

  if (ids.some((id) => Number.isNaN(id))) {
    throw new Error(`Invalid --sectionIds value "${value}"`);
  }

  return ids;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    showHelp: false,
    defaultSaleTypeId: Number.NaN,
    defaultArea: Number.NaN,
    targetPerSection: 150,
    sectionIds: undefined,
    prefixMapPath: undefined,
    separator: '-',
    padding: 3,
    startNumber: 1,
    resume: true,
    dryRun: false,
    yes: false,
    description: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;

    const [rawKey, rawValue] = current.slice(2).split('=');
    let value = rawValue;

    if (value === undefined) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        value = next;
        i += 1;
      }
    }

    const key = normalizeKey(rawKey);

    switch (key) {
      case 'help':
        options.showHelp = true;
        break;
      case 'saletypeid':
      case 'saletype':
        options.defaultSaleTypeId = parsePositiveInt(value, 'saleTypeId');
        break;
      case 'area':
      case 'defaultarea':
        options.defaultArea = parsePositiveNumber(value, 'area');
        break;
      case 'target':
      case 'count':
      case 'persection':
        options.targetPerSection = parsePositiveInt(value, 'target');
        break;
      case 'sectionids':
      case 'sections':
        options.sectionIds = parseSectionIds(value);
        break;
      case 'prefixmap':
        options.prefixMapPath = value;
        break;
      case 'separator':
      case 'sep':
        options.separator = value ?? '-';
        break;
      case 'padding':
      case 'pad':
        options.padding = parsePositiveInt(value, 'padding');
        break;
      case 'start':
      case 'startnumber':
        options.startNumber = parsePositiveInt(value, 'start');
        break;
      case 'resume':
        options.resume = parseBoolean(value, true);
        break;
      case 'noresume':
        options.resume = false;
        break;
      case 'dryrun':
        options.dryRun = parseBoolean(value, true);
        break;
      case 'yes':
      case 'force':
        options.yes = true;
        break;
      case 'description':
        options.description = value;
        break;
      default:
        throw new Error(`Unknown option: --${rawKey}`);
    }
  }

  if (options.showHelp) {
    return options;
  }

  if (!Number.isFinite(options.defaultSaleTypeId)) {
    throw new Error('Missing required option: --saleTypeId');
  }

  if (!Number.isFinite(options.defaultArea)) {
    throw new Error('Missing required option: --area');
  }

  return options;
}

function resolvePath(relativePath: string): string {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.join(process.cwd(), relativePath);
}

function loadPrefixMap(mapPath?: string): PrefixMap {
  const map: PrefixMap = new Map();
  if (!mapPath) return map;

  const resolved = resolvePath(mapPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Prefix map "${mapPath}" does not exist`);
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Prefix map file must contain an object');
  }

  Object.entries(parsed).forEach(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Invalid prefix value for key "${key}"`);
    }
    map.set(key.toLowerCase(), value.trim());
  });

  return map;
}

function derivePrefix(sectionName: string, sectionId: number): string {
  const normalized = sectionName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase();
  return normalized || `SECTION${sectionId}`;
}

function getPrefixForSection(
  section: { id: number; name: string },
  prefixMap: PrefixMap,
): string {
  const byId = prefixMap.get(String(section.id).toLowerCase());
  if (byId) return byId;

  const byName = prefixMap.get(section.name.toLowerCase());
  if (byName) return byName;

  return derivePrefix(section.name, section.id);
}

function formatStallNumber(
  prefix: string,
  index: number,
  separator: string,
  padding: number,
): string {
  const numeric = index.toString().padStart(padding, '0');
  return separator ? `${prefix}${separator}${numeric}` : `${prefix}${numeric}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeResumeStart(
  existingNumbers: string[],
  prefix: string,
  separator: string,
  start: number,
): number {
  if (!existingNumbers.length) return start;
  const pattern = new RegExp(
    `^${escapeRegExp(prefix)}${separator ? escapeRegExp(separator) : ''}(\\d+)$`,
  );
  let max = 0;
  existingNumbers.forEach((value) => {
    const match = pattern.exec(value);
    if (!match) return;
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) {
      max = Math.max(max, parsed);
    }
  });
  return Math.max(start, max + 1);
}

function pickEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }
  return undefined;
}

function resolveClickConfig(): ClickConfig {
  const serviceId = pickEnv([
    'PAYMENT_SERVICE_ID',
    'CLICK_SERVICE_ID',
    'SERVICE_ID',
    'serviceId',
  ]);
  const merchantId = pickEnv([
    'PAYMENT_MERCHANT_ID',
    'CLICK_MERCHANT_ID',
    'MERCHANT_ID',
    'merchantId',
  ]);

  if (!serviceId || !merchantId) {
    return null;
  }

  return { serviceId, merchantId };
}

function buildClickUrl(
  config: ClickConfig,
  amount: Prisma.Decimal,
  stallNumber: string,
): string | null {
  if (!config) return null;
  const amountValue = amount.toString();
  const encodedRef = encodeURIComponent(stallNumber);
  return `https://my.click.uz/services/pay?service_id=${config.serviceId}&merchant_id=${config.merchantId}&amount=${amountValue}&transaction_param=${encodedRef}`;
}

type BuildPlanArgs = {
  section: { id: number; name: string };
  existingNumbers: string[];
  needed: number;
  options: CliOptions;
  prefixMap: PrefixMap;
  dailyFee: Prisma.Decimal;
  description: string;
  clickConfig: ClickConfig;
};

type BuildPlanResult = {
  prefix: string;
  first?: string;
  last?: string;
  data: Prisma.StallCreateManyInput[];
};

function buildPlan({
  section,
  existingNumbers,
  needed,
  options,
  prefixMap,
  dailyFee,
  description,
  clickConfig,
}: BuildPlanArgs): BuildPlanResult {
  const prefix = getPrefixForSection(section, prefixMap);
  const usedNumbers = new Set(existingNumbers);
  const startIndex = options.resume
    ? computeResumeStart(existingNumbers, prefix, options.separator, options.startNumber)
    : options.startNumber;

  const plan: Prisma.StallCreateManyInput[] = [];
  let counter = startIndex;
  let attempts = 0;
  const maxAttempts = needed * 25;

  while (plan.length < needed) {
    attempts += 1;
    if (attempts > maxAttempts) {
      throw new Error(
        `Unable to allocate ${needed} unique stall numbers for section "${section.name}". Consider adjusting the prefix or padding.`,
      );
    }
    const stallNumber = formatStallNumber(prefix, counter, options.separator, options.padding);
    counter += 1;
    if (usedNumbers.has(stallNumber)) {
      continue;
    }
    usedNumbers.add(stallNumber);
    plan.push({
      stallNumber,
      area: options.defaultArea,
      saleTypeId: options.defaultSaleTypeId,
      sectionId: section.id,
      dailyFee,
      description,
      click_payment_url: buildClickUrl(clickConfig, dailyFee, stallNumber),
    });
  }

  return {
    prefix,
    first: plan[0]?.stallNumber ?? undefined,
    last: plan[plan.length - 1]?.stallNumber ?? undefined,
    data: plan,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.showHelp) {
    printHelp();
    return;
  }

  const prefixMap = loadPrefixMap(options.prefixMapPath);
  const saleType = await prisma.saleType.findUnique({
    where: { id: options.defaultSaleTypeId },
  });

  if (!saleType) {
    throw new Error(`SaleType with id ${options.defaultSaleTypeId} not found`);
  }

  const sections = await prisma.section.findMany({
    where: options.sectionIds ? { id: { in: options.sectionIds } } : undefined,
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  if (!sections.length) {
    console.log('No sections matched the provided criteria.');
    return;
  }

  if (!options.dryRun && !options.yes) {
    throw new Error('Refusing to insert stalls without --yes. Run with --dry-run to preview.');
  }

  const clickConfig = resolveClickConfig();
  const runDescription =
    options.description ??
    `Generated on ${new Date().toISOString()}`;
  const dailyFee = new Prisma.Decimal(saleType.tax ?? 0);
  const summaries: SectionSummary[] = [];
  let totalGenerated = 0;

  for (const section of sections) {
    const existing = await prisma.stall.findMany({
      where: { sectionId: section.id },
      select: { stallNumber: true },
    });

    const existingNumbers = existing
      .map((stall) => stall.stallNumber)
      .filter((value): value is string => Boolean(value));

    const existingCount = existing.length;
    const target = options.targetPerSection;
    const needed = Math.max(0, target - existingCount);

    if (needed === 0) {
      summaries.push({
        sectionId: section.id,
        sectionName: section.name,
        existingBefore: existingCount,
        generated: 0,
        finalTotal: existingCount,
        prefix: getPrefixForSection(section, prefixMap),
      });
      console.log(
        `Skipping section "${section.name}" (id=${section.id}) — already has ${existingCount}/${target} stalls.`,
      );
      continue;
    }

    const plan = buildPlan({
      section,
      existingNumbers,
      needed,
      options,
      prefixMap,
      dailyFee,
      description: runDescription,
      clickConfig,
    });

    if (options.dryRun) {
      summaries.push({
        sectionId: section.id,
        sectionName: section.name,
        existingBefore: existingCount,
        generated: needed,
        finalTotal: existingCount + needed,
        prefix: plan.prefix,
        firstStall: plan.first,
        lastStall: plan.last,
      });
      console.log(
        `[dry-run] Would create ${needed} stalls for section "${section.name}" using prefix "${plan.prefix}".`,
      );
      continue;
    }

    const result = await prisma.stall.createMany({
      data: plan.data,
    });

    totalGenerated += result.count;

    summaries.push({
      sectionId: section.id,
      sectionName: section.name,
      existingBefore: existingCount,
      generated: result.count,
      finalTotal: existingCount + result.count,
      prefix: plan.prefix,
      firstStall: plan.first,
      lastStall: plan.last,
    });

    console.log(
      `Created ${result.count} stalls for section "${section.name}" (now ${existingCount + result.count}/${target}).`,
    );
  }

  console.log('\nSummary:');
  summaries.forEach((summary) => {
    console.log(
      [
        `• Section ${summary.sectionId} "${summary.sectionName}"`,
        `prefix=${summary.prefix}`,
        `existing=${summary.existingBefore}`,
        `generated=${summary.generated}`,
        `final=${summary.finalTotal}`,
        summary.firstStall && summary.lastStall
          ? `range=${summary.firstStall}..${summary.lastStall}`
          : undefined,
      ]
        .filter(Boolean)
        .join(' | '),
    );
  });

  const createdTotal = summaries.reduce((acc, item) => acc + item.generated, 0);
  console.log(`\n${options.dryRun ? 'Would create' : 'Created'} ${createdTotal} stalls in total.`);
}

main()
  .catch((error) => {
    console.error('Failed to generate stalls:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
