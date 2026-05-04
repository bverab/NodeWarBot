import { redirect } from "next/navigation";
import { routes } from "@/constants/routes";

export default function SchedulesPage() {
  redirect(routes.guilds);
}
