---
description: Quita los hooks de NextGen AI Institute Productivity de tu settings.json. Los datos se preservan por defecto.
---

# /productivity-uninstall

Ejecuta el desinstalador:

```bash
node "$HOME/.claude/skills/_library/nextgenai-productivity/lib/uninstall.js"
```

Para borrar también los datos acumulados (eventos, métricas, informes):

```bash
node "$HOME/.claude/skills/_library/nextgenai-productivity/lib/uninstall.js" --purge
```

**Tras ejecutar, informa al usuario**:
- Cuántos hooks se han quitado
- Si los datos se preservaron o se borraron
- Que los hooks dejarán de registrar eventos en la próxima sesión
