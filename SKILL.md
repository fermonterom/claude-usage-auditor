---
name: nextgenai-productivity
description: Mide objetivamente tu uso de Claude Code (tiempo real, tareas, retries, tools usadas) y genera informes HTML locales semanales. Replicable por cualquier persona sin configuración por usuario. 100% local, ningún dato sale de tu máquina.
version: 0.1.0
author: NextGen AI Institute · Luis Salgado
license: MIT
---

# NextGen AI Institute Productivity

Mide cómo usas Claude Code en tu trabajo real: tiempo efectivo, tareas completadas, retries, uso de herramientas, volumen de interacción. **Datos objetivos, sin opiniones**. El informe se genera en local y solo tú lo ves.

## Qué mide

Todas las métricas se extraen de eventos de tus propias sesiones de Claude Code. Nada más.

| Categoría | Métrica | De dónde sale |
|---|---|---|
| **Presencia** | Tiempo con sesión activa | Timestamps del primer y último tool call de cada sesión |
| | Tiempo por tarea | Ventanas entre primer tool call y commit siguiente |
| | Días activos / semana | Sesiones únicas por día |
| **Volumen** | Tool calls totales | Evento `PreToolUse` |
| | Tokens input/output | Metadata de sesión |
| | Turns hasta resolución | Intercambios de la sesión |
| **Patrones** | Retries detectados | Mismo tool call repetido < 60s con parámetros similares |
| | Denegaciones | Herramientas denegadas por el usuario |
| | Uso de cada tool | `Read` / `Edit` / `Write` / `Bash` / `Agent` / `WebSearch` / ... |
| | Plan Mode usages | Apariciones de `EnterPlanMode` |
| **Entrega** | Commits (si hay git) | Enlace sesión ↔ commit siguiente en el repo |
| | Archivos tocados | Paths únicos pasados a `Edit` / `Write` |

## Qué NO hace

- ❌ No lee el contenido de tus prompts ni respuestas
- ❌ No envía nada fuera de tu máquina
- ❌ No hace juicios ni coaching (v0.1 solo datos objetivos)
- ❌ No requiere cuenta ni servidor
- ❌ No depende de ningún servicio externo

Si quieres análisis o coaching automático, se añadirá en v0.2 como capa opcional que lee los mismos datos locales.

## Instalación

```
/productivity-install
```

Esto hace tres cosas:
1. Añade hooks `PreToolUse`, `PostToolUse` y `Stop` en tu `~/.claude/settings.json`
2. Crea el directorio `~/.nextgenai-productivity/`
3. Verifica que Node.js está disponible (requerido)

Para desinstalar: `/productivity-uninstall`.

## Uso diario

No hay que hacer nada. Mientras trabajas con Claude Code, los hooks registran eventos en `~/.nextgenai-productivity/events/YYYY-MM-DD.jsonl`. Solo metadata, nunca contenido.

## Generar informe

```
/productivity-report
```

Agrega los eventos de la semana en curso y genera `~/.nextgenai-productivity/reports/YYYY-Www.html`. Lo puedes abrir con doble clic o compartir con quien quieras.

Opciones:
- `/productivity-report last-week` — semana pasada
- `/productivity-report month` — último mes
- `/productivity-report 2026-W16` — semana concreta

## Ver estado

```
/productivity-status
```

Muestra si los hooks están activos, cuántos eventos se han registrado hoy, y cuándo fue el último informe.

## Dónde viven tus datos

Todo en local, en tu carpeta de usuario:

```
~/.nextgenai-productivity/
├── config.json          Configuración (versión, fecha instalación)
├── events/              Eventos raw por día (formato JSONL)
│   └── 2026-04-16.jsonl
├── metrics/             Métricas agregadas por semana
│   └── 2026-W16.json
└── reports/             Informes HTML generados
    └── 2026-W16.html
```

Puedes borrar cualquier archivo en cualquier momento. Puedes llevártelo a otro ordenador copiando la carpeta. No hay nada en la nube.

## Privacidad

- **100% local**: los hooks escriben en `~/.nextgenai-productivity/`. Nada sale de ahí.
- **Solo metadata**: nombres de tool (`Edit`, `Bash`), duración, éxito/fallo, timestamps. Nunca el argumento del tool, ni el contenido de ficheros editados, ni tus prompts.
- **Auditable**: todos los scripts están en `~/.claude/skills/_library/nextgenai-productivity/` en texto plano. Léelos si quieres.
- **Desinstalable**: `/productivity-uninstall` quita hooks y (opcionalmente) borra los datos.

## Comandos disponibles

| Comando | Qué hace |
|---|---|
| `/productivity-install` | Instala los hooks y crea el directorio de datos |
| `/productivity-uninstall` | Quita los hooks (preserva datos por defecto) |
| `/productivity-status` | Ver si está activo y estadísticas rápidas |
| `/productivity-report` | Genera HTML de la semana actual |

## Compatibilidad

- **Sistema operativo**: Windows 10+, macOS 12+, Linux (kernel 5+)
- **Requisito**: Node.js 18+ (para los hooks)
- **Claude Code**: versión 1.0+

## Roadmap

- **v0.1** (ahora): métricas objetivas + informe HTML local
- **v0.2**: capa opcional de coaching automático (reglas deterministas) basada en los mismos datos
- **v0.3**: exportación agregada anonimizada para dashboards de equipo (siempre opt-in)
- **v0.4**: integración Git para enlazar sesiones con commits y PRs

## Licencia

MIT. Úsalo, modifícalo, redistribúyelo. Si construyes encima, nos alegra saberlo.
