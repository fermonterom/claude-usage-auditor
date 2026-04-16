---
description: Muestra si los hooks de NextGen AI Institute Productivity (v0.2 - 4 hooks) están activos y estadísticas rápidas (eventos hoy, último informe, etc).
---

# /productivity-status

Ejecuta el verificador de estado:

```bash
node "$HOME/.claude/skills/_library/nextgenai-productivity/lib/status.js"
```

**Tras ejecutar, resume al usuario**:
- Si los 4 hooks (PreToolUse, PostToolUse, Stop, SessionStart) están activos
- Cuántos eventos se han registrado hoy
- Cuándo fue el último informe generado
- Si el proyecto actual tiene `.nextgenai-productivity/goals.yaml` definido
- Acciones sugeridas si algo falta (instalar, definir goals con `/productivity-goals`, generar informe)
