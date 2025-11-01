import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import * as XLSX from 'xlsx';
import { Prisma, PrismaClient } from '@prisma/client';

type ColumnKey = string;

type ColumnMap = {
  ownerName: ColumnKey;
  ownerTin: ColumnKey;
  ownerPhone?: ColumnKey;
  ownerAddress?: ColumnKey;
  storeNumber: ColumnKey;
  storeArea?: ColumnKey;
  monthlyFee?: ColumnKey;
  issueDate?: ColumnKey;
  expiryDate?: ColumnKey;
  certificateNumber?: ColumnKey;
  storeNotes?: ColumnKey;
};

const DEFAULT_COLUMN_MAP: ColumnMap = {
  storeNumber: 'A',
  ownerName: 'B',
  ownerAddress: 'C',
  issueDate: 'D',
  expiryDate: 'E',
  storeArea: 'F',
  ownerTin: 'G',
  ownerPhone: 'H',
  monthlyFee: 'I',
  certificateNumber: 'J',
  storeNotes: 'L',
};

type CliOptions = {
  file: string;
  sheet?: string;
  createdById: number;
  mapPath?: string;
  dryRun?: boolean;
  skipRows: number;
  issueMonthOffset: number;
  issueDay?: number;
};

type ImportStats = {
  ownersCreated: number;
  ownersUpdated: number;
  storesCreated: number;
  storesUpdated: number;
  contractsCreated: number;
  contractsSkipped: number;
  rowsProcessed: number;
  rowsSkipped: number;
};

type EnsureOwnerResult =
  | { id: number; created: boolean; updated: boolean }
  | null;

type EnsureStoreResult =
  | { id: number; created: boolean; updated: boolean }
  | null;

const prisma = new PrismaClient();

async function updateStorePaymentLinks(
  storeId: number,
  amount?: number,
): Promise<void> {
  const serviceId = process.env.CLICK_SERVICE_ID;
  const merchantId = process.env.CLICK_MERCHANT_ID;

  if (!serviceId || !merchantId) {
    return;
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { storeNumber: true },
  });

  if (!store) return;

  const amountValue =
    amount !== undefined && amount !== null ? amount : 0;

  const clickUrl = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amountValue}&transaction_param=${store.storeNumber}`;

  const data: Prisma.StoreUpdateInput = {
    click_payment_url: clickUrl,
  };

  const tenantId = process.env.TENANT_ID;
  const paymentMerchantId = process.env.PAYMENT_MERCHANT_ID;
  const myDomain = process.env.MY_DOMAIN;

  if (
    tenantId === 'ipak_yuli' &&
    paymentMerchantId &&
    myDomain
  ) {
    const encodedMerchant = Buffer.from(paymentMerchantId).toString('base64');
    data.payme_payment_url = `https://checkout.paycom.uz/m=${encodedMerchant};acc.id=1;acc.contractId=${store.storeNumber};a=${amountValue};c=${myDomain}`;
  }

  await prisma.store.update({
    where: { id: storeId },
    data,
  });
}

function columnIndexToLetter(index: number): string {
  let result = '';
  let i = index;

  while (i >= 0) {
    result = String.fromCharCode((i % 26) + 65) + result;
    i = Math.floor(i / 26) - 1;
  }

  return result;
}

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseArgs(argv: string[]): CliOptions {
  const args: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;

    const [rawKey, rawValue] = current.slice(2).split('=');
    const key = rawKey.trim();
    if (rawValue !== undefined) {
      args[key] = rawValue;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }

  const fileArg = args.file ?? args.f;
  if (!fileArg || typeof fileArg !== 'string') {
    throw new Error('Missing required argument: --file <path-to-excel>');
  }

  const createdByArg = args.createdBy ?? args.createdById ?? '1';
  if (typeof createdByArg !== 'string' || Number.isNaN(Number(createdByArg))) {
    throw new Error('Invalid --createdBy argument. It must be a number.');
  }

  const skipRowsArg =
    args.skipRows ??
    args['skip-rows'] ??
    args['skiprows'] ??
    args['skip_rows'] ??
    '1';
  if (
    typeof skipRowsArg !== 'string' ||
    Number.isNaN(Number(skipRowsArg)) ||
    Number(skipRowsArg) < 0
  ) {
    throw new Error(
      'Invalid --skip-rows argument. It must be a non-negative number.',
    );
  }

  const dryRun = Boolean(args.dryRun ?? args['dry-run']);

  const issueMonthOffsetArg =
    args.issueMonthOffset ??
    args['issue-month-offset'] ??
    args['issueMonthOffset'] ??
    args['issue_month_offset'] ??
    '0';
  if (
    typeof issueMonthOffsetArg !== 'string' ||
    Number.isNaN(Number(issueMonthOffsetArg))
  ) {
    throw new Error(
      'Invalid --issue-month-offset argument. It must be a number.',
    );
  }

  const issueDayArg =
    args.issueDay ??
    args['issue-day'] ??
    args['issueDay'] ??
    args['issue_day'];
  let issueDay: number | undefined;
  if (issueDayArg !== undefined) {
    if (
      typeof issueDayArg !== 'string' ||
      Number.isNaN(Number(issueDayArg)) ||
      Number(issueDayArg) < 1 ||
      Number(issueDayArg) > 31
    ) {
      throw new Error(
        'Invalid --issue-day argument. It must be an integer between 1 and 31.',
      );
    }
    issueDay = Number(issueDayArg);
  }

  return {
    file: fileArg,
    sheet: typeof args.sheet === 'string' ? args.sheet : undefined,
    mapPath: typeof args.map === 'string' ? args.map : undefined,
    createdById: Number(createdByArg),
    dryRun,
    skipRows: Number(skipRowsArg),
    issueMonthOffset: Number(issueMonthOffsetArg),
    issueDay,
  };
}

function loadColumnMap(mapPath?: string): ColumnMap {
  if (!mapPath) {
    return DEFAULT_COLUMN_MAP;
  }

  const resolved = path.resolve(mapPath);
  const content = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(content);
  return { ...DEFAULT_COLUMN_MAP, ...parsed };
}

function buildRowRecord(
  cells: unknown[],
  headers?: string[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  cells.forEach((value, columnIndex) => {
    const letter = columnIndexToLetter(columnIndex);
    const lowerLetter = letter.toLowerCase();
    const asStringIndex = String(columnIndex);

    record[letter] = value;
    record[lowerLetter] = value;
    record[columnIndex] = value;
    record[asStringIndex] = value;

    const header = headers?.[columnIndex];
    if (header && String(header).trim().length) {
      const trimmed = String(header).trim();
      const lower = trimmed.toLowerCase();
      const normalized = normalizeHeaderKey(trimmed);

      record[trimmed] = value;
      record[lower] = value;
      record[normalized] = value;
    }
  });

  return record;
}

function loadSheetRows(
  workbook: XLSX.WorkBook,
  sheetName: string | undefined,
  skipRows: number,
): Record<string, unknown>[] {
  const targetSheet = sheetName ?? workbook.SheetNames[0];
  if (!targetSheet) {
    throw new Error('The Excel workbook does not contain any sheets.');
  }

  const sheet = workbook.Sheets[targetSheet];
  if (!sheet) {
    throw new Error(`Sheet "${targetSheet}" was not found in the workbook.`);
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  }) as unknown[][];

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return [];
  }

  const headersRow =
    rawRows.length > 0
      ? rawRows[0].map((cell) =>
          cell === undefined || cell === null ? '' : String(cell),
        )
      : [];

  const startIndex = Math.min(skipRows, rawRows.length);
  const dataRows = rawRows.slice(startIndex);

  return dataRows.map((cells) =>
    buildRowRecord(Array.isArray(cells) ? cells : [], headersRow as string[]),
  );
}

function resolveValue(
  row: Record<string, unknown>,
  key?: ColumnKey,
): unknown {
  if (!key) return undefined;
  if (key in row) return row[key];

  const trimmed = key.trim();
  if (trimmed && trimmed in row) return row[trimmed];

  const upper = trimmed.toUpperCase();
  if (upper in row) return row[upper];

  const lower = trimmed.toLowerCase();
  if (lower in row) return row[lower];

  const normalized = normalizeHeaderKey(trimmed);
  if (normalized in row) return row[normalized];

  return undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  const asString = String(value).replace(/\s+/g, '').replace(/,/g, '.');
  const cleaned = asString.replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    const utc = new Date(Date.UTC(parsed.y, (parsed.m ?? 1) - 1, parsed.d ?? 1));
    return Number.isNaN(utc.getTime()) ? undefined : utc;
  }

  const str = String(value).trim();
  if (!str) return undefined;

  const dotted = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(str);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    const year = Number(dotted[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function shiftDateByMonths(date: Date, offset: number): Date {
  if (!offset) return date;
  const base = new Date(date.getTime());
  base.setUTCMonth(base.getUTCMonth() + offset);
  return base;
}

function applyIssueDay(date: Date, day?: number): Date {
  if (!day) return date;
  const adjusted = new Date(date.getTime());
  const daysInMonth = new Date(
    Date.UTC(adjusted.getUTCFullYear(), adjusted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  adjusted.setUTCDate(Math.min(day, daysInMonth));
  adjusted.setUTCHours(0, 0, 0, 0);
  return adjusted;
}

async function ensureOwner(
  createdById: number,
  rowIndex: number,
  ownerName?: string,
  ownerTin?: string,
  ownerPhone?: string,
  ownerAddress?: string,
  dryRun?: boolean,
): Promise<EnsureOwnerResult> {
  if (!ownerName || !ownerTin) {
    console.warn(
      `Row ${rowIndex}: missing owner name or TIN. Skipping record.`,
    );
    return null;
  }

  if (dryRun) {
    return { id: -1, created: false, updated: false };
  }

  const existing = await prisma.owner.findUnique({ where: { tin: ownerTin } });
  if (existing) {
    const updateData: Prisma.OwnerUpdateInput = {};
    if (ownerPhone) updateData.phoneNumber = ownerPhone;
    if (ownerAddress) updateData.address = ownerAddress;

    if (Object.keys(updateData).length) {
      await prisma.owner.update({
        where: { id: existing.id },
        data: updateData,
      });
      return { id: existing.id, created: false, updated: true };
    }

    return { id: existing.id, created: false, updated: false };
  }

  const created = await prisma.owner.create({
    data: {
      fullName: ownerName,
      tin: ownerTin,
      phoneNumber: ownerPhone,
      address: ownerAddress,
      createdById,
    },
  });

  return { id: created.id, created: true, updated: false };
}

async function ensureStore(
  rowIndex: number,
  storeNumber?: string,
  storeArea?: number,
  notes?: string,
  dryRun?: boolean,
): Promise<EnsureStoreResult> {
  if (!storeNumber) {
    console.warn(`Row ${rowIndex}: missing store number. Skipping record.`);
    return null;
  }

  if (dryRun) {
    return { id: -1, created: false, updated: false };
  }

  const existing = await prisma.store.findUnique({
    where: { storeNumber },
  });

  if (existing) {
    const updateData: Prisma.StoreUpdateInput = {};
    if (storeArea !== undefined && storeArea !== existing.area) {
      updateData.area = storeArea;
    }
    if (notes && notes !== existing.description) {
      updateData.description = notes;
    }

    if (Object.keys(updateData).length) {
      await prisma.store.update({
        where: { id: existing.id },
        data: updateData,
      });
      return { id: existing.id, created: false, updated: true };
    }

    return { id: existing.id, created: false, updated: false };
  }

  if (storeArea === undefined) {
    console.warn(
      `Row ${rowIndex}: missing store area for new store "${storeNumber}". Using 0.`,
    );
  }

  const created = await prisma.store.create({
    data: {
      storeNumber,
      area: storeArea ?? 0,
      description: notes,
    },
  });

  return { id: created.id, created: true, updated: false };
}

async function createContract(
  createdById: number,
  ownerId: number,
  storeId: number,
  feeValue?: number,
  issueDate?: Date,
  expiryDate?: Date,
  certificateNumber?: string,
  dryRun?: boolean,
): Promise<'created' | 'skipped'> {
  if (dryRun) {
    return 'created';
  }

  const where: Prisma.ContractWhereInput = {
    ownerId,
    storeId,
  };

  if (certificateNumber) {
    where.certificateNumber = certificateNumber;
  }
  if (issueDate) {
    where.issueDate = issueDate;
  }
  if (expiryDate) {
    where.expiryDate = expiryDate;
  }
  if (feeValue !== undefined) {
    where.shopMonthlyFee = new Prisma.Decimal(feeValue);
  }

  const existing = await prisma.contract.findFirst({
    where,
  });

  if (existing) {
    console.warn(
      `Contract skipped: owner ${ownerId}, store ${storeId} already has a matching contract (id: ${existing.id}).`,
    );
    return 'skipped';
  }

  const created = await prisma.contract.create({
    data: {
      ownerId,
      storeId,
      createdById,
      certificateNumber,
      issueDate,
      expiryDate,
      shopMonthlyFee:
        feeValue !== undefined && feeValue !== null
          ? new Prisma.Decimal(feeValue)
          : undefined,
    },
  });

  const amountValue =
    feeValue !== undefined && feeValue !== null
      ? feeValue
      : created.shopMonthlyFee
        ? Number(created.shopMonthlyFee.toString())
        : undefined;

  await updateStorePaymentLinks(storeId, amountValue);

  return 'created';
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(options.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found at ${filePath}`);
  }

  const map = loadColumnMap(options.mapPath);
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const rows = loadSheetRows(workbook, options.sheet, options.skipRows);

  const stats: ImportStats = {
    ownersCreated: 0,
    ownersUpdated: 0,
    storesCreated: 0,
    storesUpdated: 0,
    contractsCreated: 0,
    contractsSkipped: 0,
    rowsProcessed: 0,
    rowsSkipped: 0,
  };

  const dryRunOwners = new Set<string>();
  const dryRunStores = new Set<string>();
  const dryRunContracts = new Set<string>();

  console.log(
    `Starting import from ${filePath} (sheet: ${
      options.sheet ?? workbook.SheetNames[0]
    })`,
  );
  if (options.dryRun) {
    console.log('Running in dry-run mode. No changes will be written.');
  }
  if (options.issueMonthOffset !== 0) {
    console.log(
      `Adjusting issue dates by ${options.issueMonthOffset} month(s).`,
    );
  }
  if (options.issueDay !== undefined) {
    console.log(`Setting issue dates to day ${options.issueDay} of the month.`);
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowIndex = options.skipRows + i + 1; // human-friendly row number

    const ownerName = normalizeString(resolveValue(row, map.ownerName));
    const ownerTin = normalizeString(resolveValue(row, map.ownerTin));
    const ownerPhone = normalizeString(resolveValue(row, map.ownerPhone));
    const ownerAddress = normalizeString(resolveValue(row, map.ownerAddress));
    const storeNumber = normalizeString(resolveValue(row, map.storeNumber));
    const storeArea = normalizeNumber(resolveValue(row, map.storeArea));
    const monthlyFee = normalizeNumber(resolveValue(row, map.monthlyFee));
    const originalIssueDate = normalizeDate(resolveValue(row, map.issueDate));
    const issueDate = originalIssueDate
      ? applyIssueDay(
          shiftDateByMonths(originalIssueDate, options.issueMonthOffset),
          options.issueDay,
        )
      : undefined;
    const expiryDate = normalizeDate(resolveValue(row, map.expiryDate));
    const certificateNumber = normalizeString(
      resolveValue(row, map.certificateNumber),
    );
    const storeNotes = normalizeString(resolveValue(row, map.storeNotes));

    if (!ownerName || !ownerTin || !storeNumber) {
      stats.rowsSkipped += 1;
      console.warn(
        `Row ${rowIndex}: missing required fields (Owner, TIN, Store). Skipping.`,
      );
      continue;
    }

    stats.rowsProcessed += 1;

    const ownerResult = await ensureOwner(
      options.createdById,
      rowIndex,
      ownerName,
      ownerTin,
      ownerPhone,
      ownerAddress,
      options.dryRun,
    );

    if (ownerResult === null) {
      stats.rowsSkipped += 1;
      continue;
    }

    if (options.dryRun) {
      if (!dryRunOwners.has(ownerTin)) {
        dryRunOwners.add(ownerTin);
        stats.ownersCreated += 1;
      } else {
        stats.ownersUpdated += 1;
      }
    } else if (ownerResult.created) {
      stats.ownersCreated += 1;
    } else if (ownerResult.updated) {
      stats.ownersUpdated += 1;
    }

    const storeResult = await ensureStore(
      rowIndex,
      storeNumber,
      storeArea,
      storeNotes,
      options.dryRun,
    );

    if (storeResult === null) {
      stats.rowsSkipped += 1;
      continue;
    }

    if (options.dryRun) {
      if (!dryRunStores.has(storeNumber)) {
        dryRunStores.add(storeNumber);
        stats.storesCreated += 1;
      } else {
        stats.storesUpdated += 1;
      }
    } else if (storeResult.created) {
      stats.storesCreated += 1;
    } else if (storeResult.updated) {
      stats.storesUpdated += 1;
    }

    if (ownerResult.id === -1 || storeResult.id === -1 || options.dryRun) {
      const contractKey = [
        ownerTin,
        storeNumber,
        issueDate ? issueDate.toISOString().slice(0, 10) : '',
        expiryDate ? expiryDate.toISOString().slice(0, 10) : '',
        monthlyFee ?? '',
        certificateNumber ?? '',
      ].join('__');

      if (!dryRunContracts.has(contractKey)) {
        dryRunContracts.add(contractKey);
        stats.contractsCreated += 1;
      } else {
        stats.contractsSkipped += 1;
      }
      continue;
    }

    const contractResult = await createContract(
      options.createdById,
      ownerResult.id,
      storeResult.id,
      monthlyFee,
      issueDate,
      expiryDate,
      certificateNumber,
      options.dryRun,
    );

    if (contractResult === 'created') {
      stats.contractsCreated += 1;
    } else {
      stats.contractsSkipped += 1;
    }
  }

  console.log('Import completed.');
  console.table(stats);
}

run()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
