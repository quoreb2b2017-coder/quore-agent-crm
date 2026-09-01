"use client";

import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
  Clock,
  Radio,
  TrendingUp,
  Globe,
  Coffee,
  ListChecks,
  Wallet,
  FileText,
  CalendarDays,
  BarChart3,
  AlertTriangle,
  Laptop,
  Bell,
  History,
  BookOpen,
  Settings,
  Megaphone,
  UsersRound,
  MapPin,
  User,
  KeyRound,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function ModuleIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const props = { className: cn("size-4", className), "aria-hidden": true as const };

  switch (name) {
    case "users":
      return <Users {...props} />;
    case "building":
      return <Building2 {...props} />;
    case "shield":
      return <ShieldCheck {...props} />;
    case "clock":
      return <Clock {...props} />;
    case "radio":
      return <Radio {...props} />;
    case "trending":
      return <TrendingUp {...props} />;
    case "globe":
      return <Globe {...props} />;
    case "coffee":
      return <Coffee {...props} />;
    case "tasks":
      return <ListChecks {...props} />;
    case "wallet":
      return <Wallet {...props} />;
    case "file":
      return <FileText {...props} />;
    case "calendar":
      return <CalendarDays {...props} />;
    case "chart":
      return <BarChart3 {...props} />;
    case "alert":
      return <AlertTriangle {...props} />;
    case "laptop":
      return <Laptop {...props} />;
    case "bell":
      return <Bell {...props} />;
    case "history":
      return <History {...props} />;
    case "book":
      return <BookOpen {...props} />;
    case "settings":
      return <Settings {...props} />;
    case "megaphone":
      return <Megaphone {...props} />;
    case "users-round":
      return <UsersRound {...props} />;
    case "map":
      return <MapPin {...props} />;
    case "user":
      return <User {...props} />;
    case "key":
      return <KeyRound {...props} />;
    case "message":
      return <MessageCircle {...props} />;
    default:
      return <LayoutDashboard {...props} />;
  }
}
