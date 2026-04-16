# Claude Usage Auditor

Plugin para **Claude Code** que mide de forma objetiva y local cómo usas el CLI: tiempo, sesiones, herramientas, retries, errores, proyectos. Cero telemetría a terceros. Insights accionables filtrados por los objetivos del proyecto.

> **100% local**. Nunca se envía nada fuera salvo que actives explícitamente la capa LLM opcional. El tracker registra metadata (tool name, tamaño, hash), jamás el contenido de tus prompts ni las respuestas de Claude.

## Qué hace

- **Mide**: tiempo por sesión, tool calls, retries (mismo hash < 60 s), errores, proyectos tocados (cwd), duración media
- **Agrega**: día / semana ISO, comparación con tu mediana personal de 4 semanas
- **Insights**: 10 reglas deterministas (retry_ratio, focus_session_duration, active_days, project_focus, plan_mode_usage, error_rate, task_variety, output_efficiency, input_conciseness, focus_ratio) filtradas por el archivo `goals.yaml` que define cada proyecto
- **Informe**: HTML autocontenido con KPIs, gráfica diaria, ranking de herramientas, ranking de proyectos, cards de insight ordenadas por severidad, tabla de sesiones
- **Capa LLM opcional**: 1-3 insights cualitativos por semana vía Claude Haiku, gateado por `~/.nextgenai-productivity/api-keys.yaml`

## Instalación

```bash
# 1. Clona el repo donde quieras (convención: ~/.claude/skills/_library/claude-usage-auditor)
mkdir -p ~/.claude/skills/_library
cd ~/.claude/skills/_library
git clone https://github.com/Luispitik/claude-usage-auditor.git

# 2. Ejecuta el instalador
node ~/.claude/skills/_library/claude-usage-auditor/lib/install.js
```

El instalador:
- Crea `~/.nextgenai-productivity/` (events, metrics, reports, opcional api-keys.yaml)
- Registra 4 hooks en `~/.claude/settings.json`: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`
- Es **idempotente**: repetir el install no duplica entradas
- Preserva cualquier hook externo ya existente

**Reinicia Claude Code** para activar los hooks.

## Uso

Desde dentro de Claude Code:

| Comando | Qué hace |
|---|---|
| `/productivity-install` | Registra hooks + crea data dir |
| `/productivity-status` | Verifica hooks, muestra eventos del día, último informe |
| `/productivity-goals` | Asistente interactivo (4 preguntas) que genera `$CWD/.nextgenai-productivity/goals.yaml` |
| `/productivity-report` | Genera informe HTML de la semana actual |
| `/productivity-uninstall` | Quita hooks. `--purge` borra también datos |

### Goals por proyecto

El hook `SessionStart` detecta si falta `goals.yaml` en el `cwd` actual y sugiere ejecutar `/productivity-goals` una vez por sesión. El asistente pregunta:

1. Objetivo principal (exploración / feature nueva / refactor / mantenimiento)
2. Métricas a seguir (multi-select sobre las 10 disponibles)
3. Restricciones (calidad / velocidad / estabilidad)
4. Frecuencia de informe

Resultado: `goals.yaml` dentro del proyecto. Los insights del informe se filtran por estos objetivos.

### Capa LLM opcional

Crea `~/.nextgenai-productivity/api-keys.yaml`:

```yaml
anthropic_api_key: sk-ant-...
model: claude-haiku-4-5-20251001
enabled: true
```

Se hace **una llamada por semana por usuario**. El payload enviado son **agregados numéricos + goals (texto breve que tú mismo escribiste)**. Nunca se envía contenido de prompts ni respuestas. Cache en `~/.nextgenai-productivity/llm-cache/YYYY-Www.json`.

## Privacidad

El tracker (`hooks/tracker.js`) persiste por evento **exclusivamente** estos 8 campos:

```
ts, mode, session_id, cwd, type, tool, input_size (bytes), input_hash (djb2 truncado)
```

Verificado por suite de tests automatizados (ver `test/security/`):
- 3 tests de privacy confirman que API keys, emails, JWT, contenidos de prompt NO aparecen en los `.jsonl`
- 1 test de whitelist confirma que no hay campos extra inesperados

## Arquitectura

```
hooks/              # Se ejecutan por Claude Code
  tracker.js          # PreToolUse / PostToolUse / Stop — registra metadata
  session-start.js    # SessionStart — detecta goals.yaml faltante
lib/                # Lógica offline
  install.js          # Configura ~/.claude/settings.json
  uninstall.js        # Quita hooks, --purge elimina datos
  aggregate.js        # Sesiones → días → semanas ISO
  insights.js         # Catálogo (capa A) + historia personal (capa B)
  insights-catalog.json # 10 reglas con thresholds + mensajes
  llm-insights.js     # Capa C opcional — Haiku
  render.js           # Orquesta aggregate + insights → HTML
  status.js           # Diagnóstico del estado del plugin
commands/           # Los 5 slash commands
templates/
  report.html         # Template autocontenido con brand tokens
test/               # 65 tests (sin dependencias)
  runner.js           # Descubre y ejecuta *.test.js
  unit/               # aggregate, insights, tracker, install
  security/           # privacy, path, yaml injection, hooks robustness
  e2e/                # pipeline completo install → ... → uninstall
```

## Tests

```bash
node test/runner.js     # ejecuta los 65 tests
node test/report.js     # genera informe HTML de seguridad en test/security-report.html
```

Cobertura actual: **65/65** pasando, 13 riesgos evaluados (3 critical, 4 high, 5 medium, 1 low), todos con mitigación aplicada o aceptados por diseño.

## Compatibilidad

- **Node.js**: 14+ (sin dependencias externas, solo stdlib)
- **SO**: Windows, macOS, Linux
- **Claude Code**: versión con hooks `PreToolUse`/`PostToolUse`/`Stop`/`SessionStart`

## Roadmap

- `v0.2` (actual): tracker + agregación + insights 3 capas + goals por proyecto
- `v0.3`: compartir goals en equipo, alertas proactivas, export a CSV/JSON
- `v0.4`: comparación anónima cross-cohort (opt-in, agregados únicamente)

## Licencia

MIT — ver [LICENSE](./LICENSE).

## Contribuir

Issues y PRs bienvenidos. Antes de abrir PR:

```bash
node test/runner.js   # debe quedar 65/65 + los nuevos tests que añadas
```

Hallazgo de seguridad: por favor reporta en privado vía Issues con etiqueta `security` en lugar de PR público.
