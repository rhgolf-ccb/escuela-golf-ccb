import StudentProfile from "@/components/StudentProfile";

export default function StudentProfilePage({ params }: { params: { id: string } }) {
  return <StudentProfile studentId={params.id} />;
}