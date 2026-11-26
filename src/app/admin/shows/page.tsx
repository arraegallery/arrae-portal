import { redirect } from "next/navigation";

/** Show settings moved: the Shows list, and each show's Call step for its dates. */
export default function ShowsSettingsRedirect() {
  redirect("/admin/s");
}
