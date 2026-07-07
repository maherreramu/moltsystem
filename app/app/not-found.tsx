import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-5xl font-bold text-gray-300">404</p>
        <p className="text-gray-600">Página no encontrada</p>
        <Link href="/produccion" className="text-sm text-gray-900 underline">
          Volver a producción
        </Link>
      </div>
    </div>
  );
}
