import { prisma } from "@/lib/db";

export interface CreateProfileInput {
  name: string;
  monthlyIncome?: number;
  netWorth?: number;
  goalAmount?: number;
  goalYear?: number;
  riskAppetite?: "conservative" | "moderate" | "aggressive";
  taxRegime?: "old" | "new";
}

export interface AddHoldingInput {
  userId: string;
  assetType: string;
  name: string;
  ticker?: string;
  units?: number;
  currentNav?: number;
  investedAmount: number;
  currentValue?: number;
  category?: string;
  notes?: string;
}

export async function createProfile(input: CreateProfileInput) {
  return prisma.userProfile.create({
    data: {
      name: input.name,
      monthlyIncome: input.monthlyIncome ?? 0,
      netWorth: input.netWorth ?? null,
      goalAmount: input.goalAmount ?? null,
      goalYear: input.goalYear ?? null,
      riskAppetite: input.riskAppetite ?? "moderate",
      taxRegime: input.taxRegime ?? "new",
    },
  });
}

export async function updateProfile(userId: string, input: Partial<CreateProfileInput>) {
  return prisma.userProfile.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.monthlyIncome !== undefined && { monthlyIncome: input.monthlyIncome }),
      ...(input.netWorth !== undefined && { netWorth: input.netWorth }),
      ...(input.goalAmount !== undefined && { goalAmount: input.goalAmount }),
      ...(input.goalYear !== undefined && { goalYear: input.goalYear }),
      ...(input.riskAppetite !== undefined && { riskAppetite: input.riskAppetite }),
      ...(input.taxRegime !== undefined && { taxRegime: input.taxRegime }),
    },
  });
}

export async function addHolding(input: AddHoldingInput) {
  return prisma.holding.create({
    data: {
      userId: input.userId,
      assetType: input.assetType,
      name: input.name,
      ticker: input.ticker,
      units: input.units,
      currentNav: input.currentNav,
      investedAmount: input.investedAmount,
      currentValue: input.currentValue,
      category: input.category,
      notes: input.notes,
    },
  });
}

export async function getOrCreateSession(userId: string, sessionId?: string) {
  if (sessionId) {
    const existing = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (existing) return existing;
  }
  return prisma.chatSession.create({
    data: { userId, title: `Session ${new Date().toLocaleDateString("en-IN")}` },
  });
}
