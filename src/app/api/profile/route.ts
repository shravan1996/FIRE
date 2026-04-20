import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createProfile, updateProfile, addHolding } from "@/lib/profile/profile-context";
import { prisma } from "@/lib/db";

const CreateProfileSchema = z.object({
  name: z.string().min(1),
  monthlyIncome: z.number().nonnegative().optional(),
  netWorth: z.number().optional(),
  goalAmount: z.number().optional(),
  goalYear: z.number().int().min(2025).max(2075).optional(),
  riskAppetite: z.enum(["conservative", "moderate", "aggressive"]).optional(),
  taxRegime: z.enum(["old", "new"]).optional(),
});

const AddHoldingSchema = z.object({
  userId: z.string(),
  assetType: z.enum(["mf", "equity", "etf", "fd", "real_estate", "other"]),
  name: z.string().min(1),
  ticker: z.string().optional(),
  units: z.number().optional(),
  currentNav: z.number().optional(),
  investedAmount: z.number().positive(),
  currentValue: z.number().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = req.nextUrl.searchParams.get("action");

    if (action === "add-holding") {
      const parsed = AddHoldingSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      const holding = await addHolding(parsed.data);
      return NextResponse.json({ holding });
    }

    const parsed = CreateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const profile = await createProfile(parsed.data);
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    include: { holdings: true },
  });

  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PATCH(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  try {
    const body = await req.json();
    const profile = await updateProfile(userId, body);
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
