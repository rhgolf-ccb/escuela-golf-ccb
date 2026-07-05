import StudentProfile from "@/components/StudentProfile";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Rol } from "@/lib/roles";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function StudentProfilePage({ params }: Props) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  let currentRol: Rol | null = null;
  if (user) {
    const { data } = await supabase.from("app_users").select("rol").eq("id", user.id).maybeSingle();
    currentRol = (data?.rol as Rol) ?? null;
  }

  return <StudentProfile studentId={id} currentRol={currentRol} />;
}
