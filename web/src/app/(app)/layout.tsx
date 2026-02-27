import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import { ParlayProvider } from "@/context/ParlayContext";
import ParlaySlip from "@/components/parlay-slip/ParlaySlip";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const wallet = await prisma.wallet.findUnique({
    where: { userId: user.userId },
  });

  const available = wallet
    ? parseFloat(wallet.balance.toString()) - parseFloat(wallet.lockedBalance.toString())
    : 0;

  return (
    <ParlayProvider>
      <div className="flex min-h-screen">
        <Sidebar role={user.role} balance={available} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <ParlaySlip />
    </ParlayProvider>
  );
}
