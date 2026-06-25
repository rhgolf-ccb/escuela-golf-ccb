import StudentProfile from "@/components/StudentProfile";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function StudentProfilePage({ params }: Props) {
  const { id } = await params;
  return <StudentProfile studentId={id} />;
}