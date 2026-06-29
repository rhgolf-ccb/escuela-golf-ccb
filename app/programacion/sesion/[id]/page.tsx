import AsistenciaView from "@/components/AsistenciaView";

type Props = { params: Promise<{ id: string }> };

export default async function AsistenciaPage({ params }: Props) {
  const { id } = await params;
  return <AsistenciaView sesionId={id} />;
}
