import { PrismaService } from "../../prisma/prisma.service";

function startOfCurrentMonth(reference = new Date()) {
  return new Date(reference.getFullYear(), reference.getMonth(), 1, 0, 0, 0, 0);
}

export const checkStore = async (prisma: PrismaService, storeNumber: string) => {
  const store = await prisma.store.findFirst({
    where: { storeNumber },
    include: { contracts: true },
  });

  const contract = store?.contracts?.find((c: any) => c.isActive) ?? store?.contracts?.[0];

  let paidThisMonth = false;

  if (contract) {
    // Use payment periods table as the source of truth, not raw transactions window
    const start = startOfCurrentMonth();
    const period = await prisma.contractPaymentPeriod.findFirst({
      where: {
        contractId: contract.id,
        periodStart: start,
        status: 'PAID',
      },
      select: { id: true },
    });
    paidThisMonth = Boolean(period);
  }

  return {
    store,
    contract,
    paidThisMonth,
    paidOrIsNotActive: !contract || !contract.isActive || paidThisMonth,
  };
};

export const checkAttendance = async (prisma: PrismaService, attendanceId: number) => {
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
  });

  if (!attendance) return { attendance: null, alreadyPaid: false };

  const existingTransaction = await prisma.transaction.findFirst({
    where: {
      attendanceId: attendance.id,
      status: 'PAID',
    },
  });

  return {
    attendance,
    alreadyPaid: attendance.status === 'PAID' || !!existingTransaction,
  };
};
