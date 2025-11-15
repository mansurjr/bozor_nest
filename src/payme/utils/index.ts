import { PrismaService } from "../../prisma/prisma.service";

function getCurrentMonthRange(reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export const checkStore = async (prisma: PrismaService, storeNumber: string) => {
  const store = await prisma.store.findFirst({
    where: { storeNumber },
    include: { contracts: true },
  });

  const contract = store?.contracts?.find((c: any) => c.isActive) ?? store?.contracts?.[0];

  let paidThisMonth = false;

  if (contract) {
    const { start, end } = getCurrentMonthRange();
    const existingMonthly = await prisma.transaction.findFirst({
      where: {
        contractId: contract.id,
        status: "PAID",
        createdAt: { gte: start, lt: end },
      },
    });
    paidThisMonth = Boolean(existingMonthly);
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
