---
description: Instala los hooks de NextGen AI Institute Productivity (v0.2 - 4 hooks) en tu settings.json y crea el directorio de datos.
---

# /productivity-install

Ejecuta el instalador del plugin NextGen AI Institute Productivity:

```bash
node "$HOME/.claude/skills/_library/nextgenai-productivity/lib/install.js"
```

Añade los hooks `PreToolUse`, `PostToolUse`, `Stop` y `SessionStart` en `~/.claude/settings.json` y crea la carpeta `~/.nextgenai-productivity/` con subdirectorios `events/`, `metrics/` y `reports/`.

El hook `SessionStart` detecta si falta `.nextgenai-productivity/goals.yaml` en el proyecto actual y sugiere ejecutar `/productivity-goals` para definir objetivos.

Es idempotente: si ya está instalado, no duplica.

Después de instalar, los hooks empezarán a registrar eventos en tu **próxima sesión** de Claude Code.

**Tras ejecutar, informa al usuario**:
- Si la instalación fue exitosa (4 hooks añadidos: PreToolUse, PostToolUse, Stop, SessionStart)
- Dónde están los datos (`~/.nextgenai-productivity/`)
- Que los eventos empezarán a registrarse en la siguiente sesión
- Flujo completo sugerido:
  1. `/productivity-status` para verificar la instalación
  2. `/productivity-goals` para definir objetivos del proyecto actual
  3. `/productivity-report` (tras acumular datos) para generar el informe HTML
