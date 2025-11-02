import { PrismaService } from "../../prisma/prisma.service";

export const checkStore = async (prisma: PrismaService, storeNumber: string) => {
  const store = await prisma.store.findFirst({
    where: { storeNumber },
    include: { contracts: true },
  });

  const contract = store?.contracts?.find((c: any) => c.isActive) ?? store?.contracts?.[0];

  return {
    store,
    contract,
    paidOrIsNotActive: !contract || !contract.isActive,
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

