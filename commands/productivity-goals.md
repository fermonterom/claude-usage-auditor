---
description: Asistente interactivo para definir objetivos del proyecto actual en `.nextgenai-productivity/goals.yaml` y alinear los insights semanales.
---

# productivity-goals

Genera un archivo `goals.yaml` dentro del proyecto actual (`$CWD/.nextgenai-productivity/goals.yaml`) respondiendo 4 preguntas de alineamiento.
El archivo se usa después por `lib/insights.js` para filtrar qué insights mostrar en el informe semanal.

## Ejecución

1. **Detectar proyecto**. Usa `process.cwd()` del shell de Claude (el CWD desde el que se invoca la skill).
2. **Comprobar si ya existe** `$CWD/.nextgenai-productivity/goals.yaml`.
   - Si existe, enséñalo y pregunta "¿quieres actualizarlo o mantenerlo?". Si mantiene → salir.
3. **Hacer 4 preguntas con `AskUserQuestion`** (una por una, o en un único bloque de 4 questions):

   **Pregunta 1 · Objetivo principal del proyecto**
   - "Estoy explorando / aprendiendo"
   - "Estoy construyendo feature nueva"
   - "Refactor o deuda técnica"
   - "Mantenimiento / bugs"

   **Pregunta 2 · Qué quieres optimizar esta semana** (multiselect, hasta 4)
   - "Reducir retries" (id: retry_ratio)
   - "Sesiones de foco largas" (id: focus_session_duration)
   - "Consistencia diaria" (id: active_days)
   - "Concentración en un proyecto" (id: project_focus)
   - "Uso de Plan Mode" (id: plan_mode_usage)
   - "Concisión de prompts" (id: input_conciseness)
   - "Variedad de tools" (id: task_variety)
   - "Reducir errores" (id: error_rate)

   **Pregunta 3 · Restricciones o contexto**
   - "Sin restricciones especiales"
   - "Estoy aprendiendo, prioriza calidad sobre velocidad"
   - "Deadline ajustado, prioriza velocidad"
   - "Producto en producción, prioriza estabilidad"

   **Pregunta 4 · Frecuencia deseada de informe**
   - "Semanal (por defecto)"
   - "Diario"
   - "Solo bajo demanda"

4. **Escribir `goals.yaml`** con este formato:

```yaml
# NextGen AI Institute Productivity · goals
# Generado por /productivity-goals el {{fecha ISO}}
project: "{{nombre del proyecto = basename(cwd)}}"
objective: "{{respuesta pregunta 1}}"
focus_areas:
  - "{{libre: lo más relevante del contexto del proyecto}}"
constraints:
  - "{{respuesta pregunta 3}}"
track:
  - {{id métrica 1 de pregunta 2}}
  - {{id métrica 2}}
  # ...
report_frequency: {{weekly|daily|on-demand}}
```

5. **Confirmar al usuario** mostrando el `goals.yaml` generado y recordando que:
   - Puede editarlo manualmente (es YAML simple)
   - La próxima ejecución de `/productivity-report` usará estos objetivos para filtrar y priorizar insights
   - Para borrarlo: `rm .nextgenai-productivity/goals.yaml`

## Notas

- El archivo se guarda **dentro del proyecto**, no en `~/.nextgenai-productivity/`. Esto permite que cada proyecto tenga objetivos distintos.
- Añadir `.nextgenai-productivity/` al `.gitignore` del proyecto si el usuario lo pide (opcional).
- Si el proyecto no tiene sentido como CWD (p.ej. `~` o `/tmp`), avisar y no crear nada.
- IDs válidos de `track` están en `$HOME/.claude/skills/_library/nextgenai-productivity/lib/insights-catalog.json`.
