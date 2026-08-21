export default function Loading() {
  // Este loading cubre todas las rutas de (app): las de staff, que son oscuras,
  // y las de padres (calendario, mi perfil, reservas), que siguen claras. No
  // puede pintar fondo propio ni tomar el tema de ninguna de las dos, porque en
  // la otra se vería como un parpadeo del color equivocado. Se queda en un gris
  // medio, que es el único que se lee sobre las dos superficies.
  return (
    <div className="flex items-center justify-center py-20 text-(--text-muted)">
      <svg className="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Cargando…
    </div>
  );
}
