export enum Roles {
  ADMIN = 'ADMIN',
  CHECKER = 'CHECKER',
  SUPERADMIN = 'SUPERADMIN',
}

export enum PaymentMethod {
  PAYME = 'PAYME',
  CLICK = 'CLICK',
  CASH = 'CASH',
}

export enum ContractPaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  REVERSED = 'REVERSED',
}

export enum ContractPaymentType {
  ONLINE = 'ONLINE',
  BANK_ONLY = 'BANK_ONLY',
}

export enum AttendancePayment {
  PAID = 'PAID',
  UNPAID = 'UNPAID',
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
  // Some endpoints also return these at the top level
  total?: number;
  page?: number;
  limit?: number;
}

// ==================== ENTITY INTERFACES ====================

export interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Roles;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Owner {
  id: number;
  fullName: string;
  address: string | null;
  tin: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: number;
  createdBy?: Partial<User>;
  contracts?: Partial<Contract>[];
}

export interface Store {
  id: number;
  storeNumber: string;
  area: number;
  click_payment_url: string | null;
  payme_payment_url: string | null;
  description: string | null;
  sectionId: number | null;
  Section?: Section;
  isOccupied?: boolean;
}

export interface Stall {
  id: number;
  stallNumber: string | null;
  area: number;
  saleTypeId: number | null;
  sectionId: number | null;
  click_payment_url: string | null;
  payme_payment_url: string | null;
  description: string | null;
  dailyFee: string | number; // Decimal from Prisma
  SaleType?: SaleType;
  Section?: Section;
}

export interface Contract {
  id: number;
  certificateNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  isActive: boolean;
  paymentType: ContractPaymentType;
  shopMonthlyFee: string | number | null;
  ownerId: number;
  storeId: number;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  owner?: Owner;
  store?: Store;
  createdBy?: User;
  transactions?: Transaction[];
  paymentSnapshot?: any; // Enriched data from service
}

export interface Attendance {
  id: number;
  date: string;
  stallId: number;
  status: AttendancePayment;
  amount: string | number | null;
  transactionId: number | null;
  createdAt: string;
  updatedAt: string | null;
  Stall?: Stall;
  transaction?: Transaction;
}

export interface Transaction {
  id: number;
  transactionId: string;
  amount: string | number;
  status: string;
  paymentMethod: PaymentMethod;
  contractId: number | null;
  attendanceId: number | null;
  createdAt: string;
  updatedAt: string;
  contract?: Partial<Contract>;
  attendance?: Partial<Attendance>;
}

export interface Section {
  id: number;
  name: string;
  description: string | null;
  assignedCheckerId: number;
  assignedChecker?: Partial<User>;
}

export interface SaleType {
  id: number;
  name: string;
  description: string | null;
  tax: number;
}

// ==================== FIND ALL RESPONSE INTERFACES ====================

export interface AttendanceListResponse extends ListResponse<Attendance> {}

export interface ContractListResponse extends ListResponse<Contract> {
  // Contracts service specifically returns these at top level too
  total: number;
  page: number;
  limit: number;
}

export interface OwnerListResponse extends ListResponse<Owner> {}

export interface StallListResponse extends ListResponse<Stall> {
  total: number;
  page: number;
  limit: number;
}

export interface StoreListResponse extends ListResponse<Store> {
  total: number;
  page: number;
  limit: number;
}

export interface TransactionListResponse extends ListResponse<Transaction> {}

export interface UserListResponse extends ListResponse<User> {}

export interface SaleTypeListResponse extends ListResponse<SaleType> {}

// NOTE: Section findAll returns Section[] directly
export type SectionListResponse = Section[];
