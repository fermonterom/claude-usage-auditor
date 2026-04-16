---
description: Genera el informe HTML de tu uso de Claude Code. Por defecto, la semana actual. También acepta `day`, `last-week`, `yesterday` o `2026-W16`.
argument-hint: "[week|day|last-week|yesterday|YYYY-Www|YYYY-MM-DD]"
---

# /productivity-report

Genera el informe HTML de productividad con Claude Code a partir de los eventos registrados localmente.

**Interpreta el argumento `$ARGUMENTS`** (si lo hay) y ejecuta el comando correspondiente:

| Argumento usuario | Comando a ejecutar |
|---|---|
| *(vacío)* o `week` o `semana` | `node ".../lib/render.js" week` |
| `last-week` o `semana pasada` o `last` | `node ".../lib/render.js" week last` |
| `day` o `hoy` | `node ".../lib/render.js" day` |
| `yesterday` o `ayer` | `node ".../lib/render.js" day yesterday` |
| `2026-W16` (formato semana) | `node ".../lib/render.js" week 2026-W16` |
| `2026-04-16` (formato día) | `node ".../lib/render.js" day 2026-04-16` |

Ruta real del script:
```
$HOME/.claude/skills/_library/nextgenai-productivity/lib/render.js
```

**Tras ejecutar, informa al usuario**:
- Dónde se ha guardado el HTML (`~/.nextgenai-productivity/reports/...`)
- Cuántas sesiones, días y eventos entraron en el informe
- Que puede abrirlo con doble clic o con la ruta `file://` mostrada

Si el script dice "Sin eventos en este periodo", sugiere:
- Verificar instalación con `/productivity-status`
- Si los hooks se acaban de instalar, los datos empezarán a llegar en la **próxima sesión** de Claude Code
