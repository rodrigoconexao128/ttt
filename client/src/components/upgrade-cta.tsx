import { Rocket } from "lucide-react";
import { Link } from "wouter";

export function UpgradeBanner() {
  return (
    <Link href="/plans">
      <div className="bg-gradient-to-r from-blue-600 to-violet-600 text-white p-3 flex items-center justify-between cursor-pointer shadow-md rounded-md">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 animate-pulse" />
          <span className="text-sm font-bold">Plano Ilimitado R$99</span>
        </div>
        <span className="text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30 transition-colors">
          Assinar
        </span>
      </div>
    </Link>
  );
}

export function UpgradeSidebarButton() {
  return (
    <Link href="/plans">
      <div className="flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left outline-hidden ring-sidebar-ring focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground hover:bg-sidebar-accent h-8 text-sm mt-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 hover:text-white transition-all duration-300 shadow-md font-bold justify-center cursor-pointer">
        <Rocket className="w-4 h-4 animate-pulse" />
        <span>Plano Ilimitado R$99</span>
      </div>
    </Link>
  );
}
