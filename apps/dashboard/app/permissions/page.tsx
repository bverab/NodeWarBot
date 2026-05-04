import { redirect } from "next/navigation";
import { routes } from "@/constants/routes";

export default function PermissionsPage() {
  redirect(routes.guilds);
}
