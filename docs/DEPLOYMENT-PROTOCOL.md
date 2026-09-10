# 🚀 Protocolo de Despliegue - ABT Frontend

## 📋 Descripción General

Este documento describe los protocolos recomendados para el despliegue de actualizaciones de código en el proyecto **ABT Frontend**, incluyendo hotfixes, nuevas features y releases programados.

---

## 🔄 Tipos de Actualizaciones

### 1. 🔥 Hotfixes (Correcciones Urgentes)
**Prioridad**: 🔴 Alta  
**Tiempo estimado**: 30 min - 2 horas  
**Requiere**: Aprobación de Lead/Manager

### 2. ✨ Features (Nuevas Funcionalidades)
**Prioridad**: 🟡 Media  
**Tiempo estimado**: 1-5 días  
**Requiere**: Revisión de código + QA

### 3. 📦 Releases (Versiones Programadas)
**Prioridad**: 🟢 Normal  
**Tiempo estimado**: Variable  
**Requiere**: Planning + QA completo

---

## 🔥 Protocolo para HOTFIXES

### 📝 Definición
Un hotfix es una corrección urgente para un bug crítico en producción que afecta:
- 🚫 Funcionalidad principal del sistema
- 💥 Errores que bloquean usuarios
- 🔒 Problemas de seguridad

### 🛠️ Proceso de Hotfix

#### 1️⃣ **Identificación y Evaluación** (5-10 min)
```bash
# Reportar en canal de emergencias (Slack/Teams)
📢 [HOTFIX] Descripción del problema
   - Severidad: [Crítico/Alto/Medio]
   - Usuarios afectados: [Cantidad/Porcentaje]
   - Funcionalidad afectada: [Descripción]
```

#### 2️⃣ **Creación de Rama Hotfix** (2 min)
```bash
# Desde main, crear rama hotfix
git checkout main
git pull origin main

# Nomenclatura: hotfix/YYYYMMDD-descripcion-breve
git checkout -b hotfix/20251107-fix-login-error

# O usando git-flow
git flow hotfix start fix-login-error
```

#### 3️⃣ **Desarrollo de la Corrección** (15-60 min)
```bash
# Implementar la corrección MÍNIMA necesaria
# NO agregar features adicionales
# Enfocarse SOLO en resolver el problema

# Commits descriptivos
git add .
git commit -m "fix: corregir error de autenticación en login

- Problema: usuarios no podían iniciar sesión
- Causa: validación de token incorrecta
- Solución: actualizar lógica de validación

Refs: #TICKET-123"
```

#### 4️⃣ **Testing Local** (10-20 min)
```bash
# Ejecutar tests unitarios
npm test

# Ejecutar tests e2e si están disponibles
npm run e2e

# Verificar manualmente el fix
npm start

# Checklist de validación:
✅ El bug original está corregido
✅ No se introdujeron nuevos bugs
✅ Tests pasan correctamente
✅ No hay warnings críticos en consola
```

#### 5️⃣ **Push y Creación de MR** (5 min)
```bash
# Push de la rama
git push origin hotfix/20251107-fix-login-error

# Crear Merge Request con template HOTFIX
# Título: [HOTFIX] Corregir error de autenticación en login
# Descripción:
```

**Template de MR para Hotfix:**
```markdown
## 🔥 HOTFIX

### Problema
- **Severidad**: [Crítico/Alto]
- **Descripción**: [Descripción detallada del bug]
- **Impacto**: [Usuarios/funcionalidades afectadas]
- **Ticket**: #TICKET-123

### Solución
- [Descripción de la corrección implementada]

### Testing
- [ ] Tests unitarios pasados
- [ ] Validación manual realizada
- [ ] No hay regresiones

### Checklist Pre-Deploy
- [ ] Código revisado por al menos 1 desarrollador
- [ ] Tests pasando
- [ ] Build exitoso
- [ ] Aprobación de Lead/Manager

### Screenshots/Videos
[Si aplica]

### Rollback Plan
En caso de problemas:
1. Revertir commit: `git revert [commit-hash]`
2. Deploy de versión anterior
3. Tiempo estimado de rollback: 5-10 min
```

#### 6️⃣ **Code Review Express** (10-20 min)
```bash
# Revisión por al menos 1 desarrollador senior
# Focus en:
✅ La solución resuelve el problema
✅ No introduce nuevos riesgos
✅ Código es claro y mantenible
✅ Tests son adecuados

# Aprobación rápida pero cuidadosa
```

#### 7️⃣ **Merge a Main** (2 min)
```bash
# Después de aprobación, merge a main
# El pipeline se ejecuta automáticamente:
# Test → Build → Deploy → Verify → Cleanup

# Opción A: Merge desde GitLab UI
# Opción B: Merge manual
git checkout main
git merge --no-ff hotfix/20251107-fix-login-error
git push origin main
```

#### 8️⃣ **Monitoreo Post-Deploy** (30 min)
```bash
# Verificar deploy exitoso en GitLab CI/CD
# URL: https://gitlab.com/[org]/abt-frontend/-/pipelines

# Monitorear logs en tiempo real
docker compose -f docker-compose.prod.yml logs -f frontend

# Verificar métricas:
✅ Aplicación respondiendo correctamente
✅ No hay errores en logs
✅ Usuarios pueden usar la funcionalidad corregida
✅ No hay picos de errores

# Verificar en navegador
curl -I http://localhost:4200
```

#### 9️⃣ **Comunicación** (5 min)
```bash
# Notificar a stakeholders
📢 [HOTFIX DEPLOYED] Fix de autenticación
   ✅ Deploy completado: [Hora]
   ✅ Problema resuelto: [Descripción]
   ✅ Validación: OK
   📊 Monitoreo: En curso (30 min)
```

#### 🔟 **Limpieza** (2 min)
```bash
# Después de confirmar éxito (30 min - 1 hora)
# Eliminar rama local
git branch -d hotfix/20251107-fix-login-error

# Eliminar rama remota
git push origin --delete hotfix/20251107-fix-login-error

# Actualizar documentación si es necesario
```

### ⏱️ **Timeline de Hotfix**
```
Total: 1-2 horas

Identificación ──────── 10 min
Desarrollo ──────────── 30-60 min
Testing ─────────────── 15 min
Review + Merge ──────── 15 min
Deploy (automático) ─── 10 min
Monitoreo ───────────── 30 min
```

---

## ✨ Protocolo para FEATURES

### 📝 Definición
Una feature es una nueva funcionalidad o mejora significativa que:
- 🎯 Agrega valor al producto
- 🔧 Mejora experiencia de usuario
- 📊 Implementa nuevos requerimientos

### 🛠️ Proceso de Feature

#### 1️⃣ **Planning y Diseño** (1-2 días)
```markdown
## Checklist de Planning
- [ ] Requerimientos claros y documentados
- [ ] Diseño UI/UX aprobado
- [ ] Estimación de tiempo realizada
- [ ] Dependencias identificadas
- [ ] Criterios de aceptación definidos
```

#### 2️⃣ **Creación de Rama Feature** (2 min)
```bash
# Desde main, crear rama feature
git checkout main
git pull origin main

# Nomenclatura: feature/TICKET-descripcion
git checkout -b feature/ABT-123-reporte-agregaciones

# O usando git-flow
git flow feature start ABT-123-reporte-agregaciones
```

#### 3️⃣ **Desarrollo** (Variable: 1-5 días)
```bash
# Desarrollo incremental con commits frecuentes
git add src/app/features/reports
git commit -m "feat(reports): agregar componente de agregaciones

- Implementar widget de resumen
- Agregar configuración de agregaciones
- Tests unitarios incluidos

Refs: ABT-123"

# Commits atómicos y descriptivos
# Seguir Conventional Commits
# Push regular para backup
git push origin feature/ABT-123-reporte-agregaciones
```

**Tipos de Commits (Conventional Commits):**
```bash
feat:     Nueva funcionalidad
fix:      Corrección de bug
docs:     Solo documentación
style:    Formato, sin cambio de lógica
refactor: Refactorización de código
test:     Agregar o modificar tests
chore:    Tareas de mantenimiento
perf:     Mejoras de performance
```

#### 4️⃣ **Testing Exhaustivo** (0.5-1 día)
```bash
# Tests unitarios
npm test

# Tests de integración
npm run test:integration

# Tests E2E (si aplica)
npm run e2e

# Verificación manual
npm start

# Checklist de Testing:
✅ Todos los tests pasan
✅ Cobertura de código > 80%
✅ No hay warnings en consola
✅ Funcionalidad probada en diferentes navegadores
✅ Responsive design verificado
✅ Performance aceptable
✅ Accesibilidad validada
```

#### 5️⃣ **Documentación** (0.5 día)
```bash
# Documentar en README o docs/
# - Cómo usar la nueva feature
# - Configuración necesaria
# - Ejemplos de uso
# - APIs modificadas/agregadas

# Actualizar CHANGELOG.md
echo "## [Unreleased]
### Added
- Nuevo widget de agregaciones en reportes (#ABT-123)" >> CHANGELOG.md
```

#### 6️⃣ **Crear Merge Request** (15 min)
```bash
# Push final
git push origin feature/ABT-123-reporte-agregaciones

# Crear MR en GitLab
```

**Template de MR para Feature:**
```markdown
## ✨ Feature

### Descripción
[Descripción detallada de la funcionalidad]

### Ticket
Refs: #ABT-123

### Tipo de Cambio
- [ ] Nueva funcionalidad
- [ ] Mejora de funcionalidad existente
- [ ] Breaking change

### Capturas de Pantalla / Videos
[Screenshots o GIFs demostrando la funcionalidad]

### Testing
- [ ] Tests unitarios agregados/actualizados
- [ ] Tests de integración agregados/actualizados
- [ ] Tests E2E agregados (si aplica)
- [ ] Cobertura de código > 80%
- [ ] Testing manual completado

### Documentación
- [ ] README actualizado
- [ ] Documentación técnica agregada
- [ ] CHANGELOG actualizado
- [ ] Comentarios en código completos

### Checklist
- [ ] Código sigue las guías de estilo del proyecto
- [ ] Self-review realizado
- [ ] Tests locales pasando
- [ ] No hay warnings en consola
- [ ] Build exitoso
- [ ] Performance validada

### Consideraciones de Deploy
[Cualquier consideración especial para el deploy]

### Rollback Plan
[Plan de rollback si es necesario]
```

#### 7️⃣ **Code Review** (0.5-1 día)
```bash
# Asignar a al menos 2 revisores
# Uno técnico + uno de negocio/QA

# Revisores verifican:
✅ Código limpio y mantenible
✅ Tests adecuados
✅ Performance aceptable
✅ Seguridad (sin vulnerabilidades)
✅ Cumple requerimientos
✅ UX apropiada

# Iterar según feedback
# Resolver todos los comentarios
```

#### 8️⃣ **QA Testing** (0.5-1 día)
```bash
# QA realiza testing exhaustivo
# - Funcionalidad completa
# - Edge cases
# - Integración con otras features
# - Diferentes navegadores/dispositivos
# - Performance y usabilidad

# QA aprueba o reporta issues
```

#### 9️⃣ **Merge a Main** (5 min)
```bash
# Después de todas las aprobaciones
git checkout main
git pull origin main
git merge --no-ff feature/ABT-123-reporte-agregaciones

# Agregar tag de versión
git tag -a v1.5.0 -m "Release v1.5.0: Widget de agregaciones"
git push origin main --tags

# Pipeline se ejecuta automáticamente
```

#### 🔟 **Deploy y Monitoreo** (1 hora)
```bash
# Monitorear pipeline
# Verificar deploy exitoso
# Realizar smoke tests
# Monitorear métricas por 1 hora

# Comunicar a stakeholders
📢 [FEATURE DEPLOYED] Widget de Agregaciones
   ✅ Versión: v1.5.0
   ✅ Deploy: [Fecha y hora]
   📊 Monitoreo: En curso
```

#### 1️⃣1️⃣ **Limpieza** (5 min)
```bash
# Eliminar rama feature
git branch -d feature/ABT-123-reporte-agregaciones
git push origin --delete feature/ABT-123-reporte-agregaciones

# Mover ticket a "Done"
# Actualizar documentación de proyecto
```

### ⏱️ **Timeline de Feature**
```
Total: 3-7 días

Planning ────────────── 1-2 días
Desarrollo ──────────── 1-5 días
Testing ─────────────── 0.5-1 día
Documentación ───────── 0.5 día
Review + QA ─────────── 1-2 días
Deploy + Monitoreo ──── 2-3 horas
```

---

## 📦 Protocolo para RELEASES

### 📝 Definición
Un release es una versión planificada que agrupa múltiples features y fixes:
- 📅 Programado con antelación
- 🎯 Incluye múltiples cambios
- 📊 Requiere coordinación de equipo

### 🛠️ Proceso de Release

#### 1️⃣ **Preparación** (1 semana antes)
```bash
# Crear rama de release
git checkout main
git pull origin main
git checkout -b release/v1.5.0

# Congelar features (feature freeze)
# Solo se permiten bug fixes en esta rama

# Actualizar versión
npm version 1.5.0 --no-git-tag-version

# Actualizar CHANGELOG.md
```

#### 2️⃣ **Testing Intensivo** (1 semana)
```bash
# QA completo en rama de release
# - Regression testing
# - Integration testing
# - Performance testing
# - Security testing
# - User acceptance testing (UAT)

# Fixes se hacen directamente en rama release
git checkout release/v1.5.0
# ... hacer fixes ...
git commit -m "fix: corregir validación en formulario"
```

#### 3️⃣ **Release Notes** (1 día)
```markdown
# docs/releases/v1.5.0.md

## Release v1.5.0 - [Fecha]

### 🎉 Highlights
- Widget de agregaciones en reportes
- Mejoras en performance de dashboards
- Nueva visualización de datos geográficos

### ✨ Features
- feat(reports): nuevo widget de agregaciones (#ABT-123)
- feat(dashboard): gráficos interactivos (#ABT-124)
- feat(map): capa de calor (#ABT-125)

### 🐛 Bug Fixes
- fix(auth): corregir timeout de sesión (#ABT-126)
- fix(forms): validación de campos numéricos (#ABT-127)

### 🔧 Improvements
- perf(table): optimizar renderizado (#ABT-128)
- style(ui): mejorar responsive design (#ABT-129)

### 📚 Documentation
- docs: actualizar guía de reportes
- docs: agregar ejemplos de API

### ⚠️ Breaking Changes
Ninguno

### 🔄 Migration Guide
No requiere migraciones

### 📊 Metrics
- Cobertura de tests: 85%
- Performance: +15% más rápido
- Bundle size: -5% más pequeño
```

#### 4️⃣ **Pre-Deploy Checklist** (1 día)
```markdown
## Pre-Deploy Checklist

### Código
- [ ] Todos los tests pasan
- [ ] Build exitoso sin warnings
- [ ] Cobertura de código > 80%
- [ ] No hay dependencias vulnerables
- [ ] Code review completo

### Documentación
- [ ] CHANGELOG actualizado
- [ ] Release notes escritas
- [ ] Documentación técnica actualizada
- [ ] Guías de usuario actualizadas

### Testing
- [ ] QA completo realizado
- [ ] UAT aprobado por stakeholders
- [ ] Performance validada
- [ ] Security scan realizado

### Infraestructura
- [ ] Backup de base de datos realizado
- [ ] Capacidad del servidor verificada
- [ ] Plan de rollback preparado
- [ ] Monitoreo configurado

### Comunicación
- [ ] Equipo notificado
- [ ] Usuarios informados (si aplica)
- [ ] Stakeholders alineados
- [ ] Ventana de mantenimiento programada
```

#### 5️⃣ **Merge a Main** (1 hora)
```bash
# Merge de release a main
git checkout main
git merge --no-ff release/v1.5.0

# Crear tag anotado
git tag -a v1.5.0 -m "Release v1.5.0

- Widget de agregaciones
- Mejoras de performance
- Correcciones de bugs

Ver: docs/releases/v1.5.0.md"

# Push
git push origin main --tags

# También merge a develop (si se usa git-flow)
git checkout develop
git merge --no-ff release/v1.5.0
git push origin develop
```

#### 6️⃣ **Deploy** (30 min)
```bash
# El pipeline ejecuta automáticamente
# Monitorear en tiempo real

# Verificar cada etapa:
✅ Tests
✅ Build
✅ Deploy
✅ Verify
✅ Cleanup
```

#### 7️⃣ **Post-Deploy Monitoring** (4-24 horas)
```bash
# Monitoreo intensivo primeras 4 horas
# Monitoreo regular siguientes 24 horas

# Métricas a vigilar:
📊 Tasa de errores
📈 Tiempo de respuesta
👥 Usuarios activos
💾 Uso de memoria/CPU
🔒 Logs de seguridad

# Dashboard de monitoreo
# Alertas configuradas
# Equipo on-call disponible
```

#### 8️⃣ **Comunicación Post-Deploy** (1 hora)
```bash
# Notificación a todos los stakeholders
📢 [RELEASE DEPLOYED] v1.5.0 en producción

✅ Deploy completado: [Fecha/hora]
✅ Todas las validaciones: OK
📊 Monitoreo: Activo
📚 Release notes: [URL]

Nuevas features:
- Widget de agregaciones en reportes
- Mejoras en performance de dashboards
- Nueva visualización geográfica

[Changelog completo]: [URL]
```

#### 9️⃣ **Limpieza** (30 min)
```bash
# Eliminar rama de release
git branch -d release/v1.5.0
git push origin --delete release/v1.5.0

# Archivar documentación de release
# Actualizar roadmap
# Cerrar milestone en project management
```

#### 🔟 **Post-Mortem** (1 semana después)
```markdown
## Post-Mortem Release v1.5.0

### ✅ Qué salió bien
- Deploy sin incidentes
- Timeline cumplido
- No se necesitó rollback

### ⚠️ Qué se puede mejorar
- Testing de performance podría ser más exhaustivo
- Comunicación con usuarios podría ser anticipada

### 📊 Métricas
- Tiempo total de deploy: 45 min
- Downtime: 0 segundos
- Issues post-deploy: 2 menores

### 🎯 Acciones para próximo release
- [ ] Automatizar más tests de performance
- [ ] Mejorar proceso de comunicación
- [ ] Implementar feature flags
```

### ⏱️ **Timeline de Release**
```
Total: 2-3 semanas

Preparación ────────── 1 semana
Testing QA ─────────── 1 semana
Release Notes ──────── 1 día
Pre-Deploy ─────────── 1 día
Deploy ─────────────── 1 hora
Monitoreo ──────────── 24 horas
Post-Mortem ───────── 1 semana después
```

---

## 🔄 Git Branching Strategy

### Estrategia de Ramas

```
main (production)
  ├── hotfix/fix-critical-bug ──┐
  │                              ├─→ merge to main
  │                              └─→ merge to develop
  ├── release/v1.5.0 ───────────┐
  │                             ├─→ merge to main
  │                             └─→ merge to develop
  └── develop
       ├── feature/new-widget
       ├── feature/dashboard-improvements
       └── feature/map-visualization
```

### Reglas de Ramas

#### `main`
- 🔒 Protegida (no push directo)
- ✅ Siempre deployable
- 🏷️ Tagged con versiones
- 🚀 Refleja producción

#### `develop`
- 🔧 Rama de integración
- ✨ Última versión de desarrollo
- 🧪 Testing continuo

#### `feature/*`
- ✨ Nuevas funcionalidades
- 🌿 Partir de `develop`
- 🔀 Merge a `develop`
- 🗑️ Eliminar después del merge

#### `hotfix/*`
- 🔥 Correcciones urgentes
- 🌿 Partir de `main`
- 🔀 Merge a `main` Y `develop`
- 🗑️ Eliminar después del merge

#### `release/*`
- 📦 Preparación de release
- 🌿 Partir de `develop`
- 🔀 Merge a `main` Y `develop`
- 🗑️ Eliminar después del merge

---

## 🚨 Plan de Rollback

### Cuándo hacer Rollback

❌ **Indicadores para rollback inmediato:**
- Errores críticos afectando > 10% usuarios
- Pérdida de datos
- Vulnerabilidad de seguridad
- Performance degradada > 50%
- Funcionalidad crítica no funciona

### Proceso de Rollback

#### Opción 1: Revert Commit (Rápido - 5 min)
```bash
# Identificar commit problemático
git log --oneline

# Revertir commit
git revert [commit-hash]
git push origin main

# Pipeline deployará automáticamente
```

#### Opción 2: Deploy de Versión Anterior (10 min)
```bash
# Checkout a tag anterior
git checkout v1.4.0

# Crear rama temporal
git checkout -b rollback-to-v1.4.0

# Force push a main (con precaución)
git push origin rollback-to-v1.4.0:main --force

# Pipeline deployará versión anterior
```

#### Opción 3: Rollback de Contenedor (5 min)
```bash
# Si la imagen anterior está disponible
docker compose down
docker pull [registry]/abt-frontend:v1.4.0
docker compose up -d
```

### Post-Rollback

```bash
# 1. Verificar que el rollback fue exitoso
curl -I http://localhost:4200

# 2. Notificar a stakeholders
📢 [ROLLBACK EJECUTADO]
   Versión revertida a: v1.4.0
   Razón: [Descripción del problema]
   Status: Sistema estable

# 3. Investigar y documentar el problema
# 4. Crear hotfix si es necesario
# 5. Post-mortem del incidente
```

---

## 📊 Métricas y KPIs

### Métricas de Deploy

```bash
# Lead Time
Tiempo desde commit hasta producción
Target: < 2 horas (hotfix), < 1 semana (feature)

# Deployment Frequency
Frecuencia de deploys
Target: 2-3 por semana

# Change Failure Rate
% de deploys que requieren hotfix/rollback
Target: < 10%

# Mean Time to Recovery (MTTR)
Tiempo promedio de recuperación ante problemas
Target: < 30 min

# Test Coverage
Cobertura de código por tests
Target: > 80%
```

---

## 🎯 Mejores Prácticas

### ✅ DO's

1. ✅ **Commits pequeños y frecuentes**
   ```bash
   # Bueno
   git commit -m "feat: agregar validación de email"
   git commit -m "test: agregar tests para validación"
   git commit -m "docs: documentar nueva validación"
   
   # Malo
   git commit -m "implementar todo el feature completo"
   ```

2. ✅ **Tests antes de push**
   ```bash
   npm test && git push
   ```

3. ✅ **Deploy en horarios de bajo tráfico**
   - Preferiblemente fuera de horario laboral
   - Evitar viernes tarde y lunes temprano

4. ✅ **Comunicación proactiva**
   - Notificar antes, durante y después del deploy

5. ✅ **Monitoreo activo**
   - Primeros 30 min: Monitoreo intensivo
   - Primeras 4 horas: Monitoreo activo
   - Primeras 24 horas: Monitoreo regular

6. ✅ **Documentar TODO**
   - Cambios
   - Decisiones
   - Problemas encontrados
   - Soluciones aplicadas

### ❌ DON'Ts

1. ❌ **NO hacer push directo a main**
   ```bash
   # Siempre usar pull requests
   ```

2. ❌ **NO deployar sin tests**
   ```bash
   # Nunca saltarse la etapa de tests
   ```

3. ❌ **NO deployar código sin revisar**
   ```bash
   # Siempre requiere code review
   ```

4. ❌ **NO deployar viernes tarde**
   ```bash
   # A menos que sea hotfix crítico
   ```

5. ❌ **NO ignorar warnings del pipeline**
   ```bash
   # Investigar y resolver warnings
   ```

6. ❌ **NO deployar sin plan de rollback**
   ```bash
   # Siempre tener estrategia de salida
   ```

---

## 🔐 Seguridad y Compliance

### Security Checklist

```markdown
- [ ] Dependencias actualizadas (npm audit)
- [ ] No hay secretos en código
- [ ] Variables sensibles en GitLab CI/CD
- [ ] HTTPS configurado
- [ ] Headers de seguridad configurados
- [ ] Input validation implementada
- [ ] Autenticación y autorización verificadas
```

### Comandos de Seguridad

```bash
# Auditar dependencias
npm audit

# Fix automático de vulnerabilidades
npm audit fix

# Verificar dependencias desactualizadas
npm outdated

# Actualizar dependencias
npm update
```

---

## 📞 Contactos de Emergencia

### Escalación de Problemas

```markdown
🔴 Nivel 1 - Crítico (< 5 min respuesta)
   Lead Developer: [Nombre] - [Teléfono]
   DevOps Lead: [Nombre] - [Teléfono]

🟡 Nivel 2 - Alto (< 30 min respuesta)
   Senior Developer: [Nombre] - [Teléfono]
   QA Lead: [Nombre] - [Teléfono]

🟢 Nivel 3 - Normal (< 2 horas respuesta)
   Product Manager: [Nombre] - [Email]
   Project Manager: [Nombre] - [Email]
```

---

## 📚 Templates y Checklists

### Checklist Rápido - Hotfix
```markdown
- [ ] Problema identificado y documentado
- [ ] Rama hotfix creada
- [ ] Corrección implementada (mínima)
- [ ] Tests pasando
- [ ] MR creado con template HOTFIX
- [ ] Code review aprobado
- [ ] Merge a main
- [ ] Pipeline exitoso
- [ ] Verificación en producción
- [ ] Monitoreo 30 min
- [ ] Comunicación a stakeholders
- [ ] Limpieza de rama
```

### Checklist Completo - Feature
```markdown
- [ ] Requerimientos claros
- [ ] Diseño aprobado
- [ ] Rama feature creada
- [ ] Desarrollo completado
- [ ] Tests unitarios > 80% coverage
- [ ] Tests de integración
- [ ] Documentación actualizada
- [ ] CHANGELOG actualizado
- [ ] MR creado con template FEATURE
- [ ] Code review (2+ aprobaciones)
- [ ] QA testing aprobado
- [ ] Performance validada
- [ ] Merge a main
- [ ] Pipeline exitoso
- [ ] Deploy verificado
- [ ] Monitoreo 1 hora
- [ ] Comunicación a stakeholders
- [ ] Limpieza de rama
```

### Checklist Release
```markdown
- [ ] Feature freeze
- [ ] Rama release creada
- [ ] Versión actualizada
- [ ] CHANGELOG completo
- [ ] Release notes escritas
- [ ] Testing QA completo
- [ ] UAT aprobado
- [ ] Security scan realizado
- [ ] Performance validada
- [ ] Backup de BD realizado
- [ ] Plan de rollback preparado
- [ ] Comunicación previa enviada
- [ ] Merge a main y develop
- [ ] Tag creado
- [ ] Pipeline exitoso
- [ ] Deploy verificado
- [ ] Monitoreo 24 horas
- [ ] Comunicación post-deploy
- [ ] Post-mortem agendado
```

---

## 🔗 Enlaces Útiles

- 📘 [Conventional Commits](https://www.conventionalcommits.org/)
- 📗 [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)
- 📙 [Semantic Versioning](https://semver.org/)
- 📕 [Keep a Changelog](https://keepachangelog.com/)

---

**Última actualización**: Noviembre 7, 2025  
**Versión**: 1.0  
**Mantenido por**: Equipo de Desarrollo ABT Frontend  
**Revisión**: Trimestral
