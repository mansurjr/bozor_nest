export class ManualPaymentDto {
  transferNumber!: string; // required unique reference
  transferDate?: string;   // ISO date string
  amount?: number;         // total amount paid; must be multiple of monthly fee
  months?: number;         // alternative to amount; number of months to apply
  startMonth?: string;     // YYYY-MM to start applying payments; defaults to next unpaid month
  notes?: string;
}

