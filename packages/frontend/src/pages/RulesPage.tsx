import React from 'react';
import { Card, CardContent } from '@heroui/react';
import { Trophy, Target, CircleDot, AlertCircle, HelpCircle } from 'lucide-react';
import { useAuth } from '../auth/auth-context';

export function RulesPage() {
  const { user } = useAuth();

  return (
    <div className="animate-fade-in">
      {/* Navy Page Header */}
      <div className="page-header">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Sistema de Puntuación</h1>
            <p className="text-white/70 text-sm mt-1">
              Conoce cómo se calculan los puntos en el Mundialito 2026
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/20">
            <span className="text-white/90 text-sm">{user?.email}</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* Puntuación por tipo */}
        <h2 className="font-display text-xl text-gray-900 uppercase tracking-wide mb-4">
          Puntos por Predicción
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-white rounded-xl shadow-sm border border-gray-200 border-t-4 border-t-blue-500">
            <CardContent className="p-6 text-center">
              <Target className="w-10 h-10 text-blue-500 mx-auto mb-3" />
              <span className="block font-display text-4xl font-bold text-gray-900 mb-2">3</span>
              <span className="block text-sm text-gray-600 font-medium">Puntos</span>
              <p className="text-xs text-gray-500 mt-3">
                Por acertar el <strong>ganador</strong> del partido (Equipo A, Equipo B o Empate)
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl shadow-sm border border-gray-200 border-t-4 border-t-green-500">
            <CardContent className="p-6 text-center">
              <CircleDot className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <span className="block font-display text-4xl font-bold text-gray-900 mb-2">5</span>
              <span className="block text-sm text-gray-600 font-medium">Puntos adicionales</span>
              <p className="text-xs text-gray-500 mt-3">
                Por acertar el <strong>marcador exacto</strong> (se suman a los 3 de ganador = 8 total)
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl shadow-sm border border-gray-200 border-t-4 border-t-yellow-500">
            <CardContent className="p-6 text-center">
              <Trophy className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
              <span className="block font-display text-4xl font-bold text-gray-900 mb-2">10</span>
              <span className="block text-sm text-gray-600 font-medium">Puntos</span>
              <p className="text-xs text-gray-500 mt-3">
                Por acertar el <strong>campeón</strong> del Mundial 2026
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Ejemplo */}
        <h2 className="font-display text-xl text-gray-900 uppercase tracking-wide mb-4">
          Ejemplo
        </h2>

        <Card className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
          <CardContent className="p-6">
            <p className="text-sm text-gray-500 mb-4">
              Resultado real: <strong className="text-gray-900">México 2 - 1 USA</strong>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-gray-500 font-medium">Jugador</th>
                    <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-gray-500 font-medium">Predicción Ganador</th>
                    <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-gray-500 font-medium">Predicción Marcador</th>
                    <th className="text-right px-4 py-2 text-xs uppercase tracking-wider text-gray-500 font-medium">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">Juan</td>
                    <td className="px-4 py-3 text-green-600">México ✓</td>
                    <td className="px-4 py-3 text-green-600">2 - 1 ✓</td>
                    <td className="px-4 py-3 text-right font-display font-bold text-gray-900">8 pts</td>
                  </tr>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">María</td>
                    <td className="px-4 py-3 text-green-600">México ✓</td>
                    <td className="px-4 py-3 text-red-500">3 - 0 ✗</td>
                    <td className="px-4 py-3 text-right font-display font-bold text-gray-900">3 pts</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">Carlos</td>
                    <td className="px-4 py-3 text-red-500">USA ✗</td>
                    <td className="px-4 py-3 text-red-500">0 - 2 ✗</td>
                    <td className="px-4 py-3 text-right font-display font-bold text-gray-900">0 pts</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Reglas adicionales */}
        <h2 className="font-display text-xl text-gray-900 uppercase tracking-wide mb-4">
          Reglas Importantes
        </h2>

        <div className="space-y-4 mb-8">
          <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
            <CardContent className="p-5 flex gap-4">
              <AlertCircle className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Penales en eliminatorias</h3>
                <p className="text-sm text-gray-600">
                  Si un partido de eliminatoria termina en empate y se define por penales, el <strong>ganador</strong> 
                  se evalúa según el equipo que ganó los penales. El <strong>marcador</strong> se evalúa según el 
                  resultado al final del tiempo extra (sin contar goles de penales).
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
            <CardContent className="p-5 flex gap-4">
              <AlertCircle className="w-6 h-6 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Predicciones se cierran al iniciar el partido</h3>
                <p className="text-sm text-gray-600">
                  No podrás enviar ni modificar predicciones una vez que el partido haya comenzado. 
                  Asegúrate de enviarlas antes del pitazo inicial.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
            <CardContent className="p-5 flex gap-4">
              <AlertCircle className="w-6 h-6 text-green-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Empate solo en fase de grupos</h3>
                <p className="text-sm text-gray-600">
                  La opción de "Empate" solo está disponible para partidos de la fase de grupos. 
                  En eliminatorias, debes elegir un ganador.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
            <CardContent className="p-5 flex gap-4">
              <AlertCircle className="w-6 h-6 text-purple-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Predicción de campeón</h3>
                <p className="text-sm text-gray-600">
                  Puedes cambiar tu predicción de campeón en cualquier momento hasta que inicie la final. 
                  Solo se permite una selección activa.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Desempate */}
        <h2 className="font-display text-xl text-gray-900 uppercase tracking-wide mb-4">
          Desempate en la Clasificación
        </h2>

        <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
          <CardContent className="p-5 flex gap-4">
            <HelpCircle className="w-6 h-6 text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">
                Si dos jugadores tienen el mismo puntaje total, se desempata por:
              </p>
              <ol className="text-sm text-gray-600 mt-2 list-decimal list-inside space-y-1">
                <li>Mayor cantidad de <strong>marcadores exactos</strong> acertados</li>
                <li>Si persiste el empate, se ordenan <strong>alfabéticamente</strong></li>
              </ol>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
