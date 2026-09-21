# BolsaLab

Prototipo educativo para observar cómo un asistente de inversión de largo plazo propone y registra operaciones **simuladas** en acciones y ETF de México y Estados Unidos.

## Qué incluye

- Capital inicial virtual de $1,000 MXN.
- Cartera inicial configurable con VTI, NAFTRACISHRS.MX y BND.
- Conversión automática USD/MXN.
- Precios históricos de mercado cuando la fuente está disponible.
- Modo de demostración claramente identificado cuando no hay conexión.
- Rebalanceo con confirmación manual.
- Compras fraccionadas simuladas y bitácora local.
- Señales explicables basadas en tendencia, promedio de 200 días y volatilidad.
- Límites fijos: sin margen, opciones, ventas en corto ni retiros.
- Acceso privado de un solo usuario con sesión segura y bloqueo temporal por intentos fallidos.

## Ejecutar

Requiere Node.js 20 o superior y no necesita instalar paquetes.

```bash
npm start
```

Después abre `http://localhost:4173`.

## Acceso privado

Configura estas variables de entorno antes de iniciar:

- `BOLSALAB_USER`: nombre de usuario.
- `BOLSALAB_PASSWORD`: contraseña de acceso.
- `SESSION_SECRET`: texto aleatorio de al menos 32 caracteres para firmar la sesión.

En producción, agrega las tres en el panel de variables de entorno de Hostinger. Las credenciales no deben guardarse en GitHub.

## Pruebas

```bash
npm test
```

## Cómo decide

La primera versión usa una distribución objetivo:

- 45% VTI: mercado total de Estados Unidos.
- 25% NAFTRACISHRS.MX: mercado accionario mexicano.
- 20% BND: bonos diversificados de Estados Unidos.
- 10% efectivo virtual.

Al solicitar un rebalanceo, el motor compara el peso actual con el objetivo. Propone compras únicamente con el efectivo que excede la reserva de 10%. La señal de mercado es informativa; la asignación y el control de riesgo gobiernan las órdenes.

## Importante

BolsaLab no se conecta a un bróker, no mueve dinero real y no garantiza rendimientos. Los datos externos pueden retrasarse o fallar. La disponibilidad de acciones fraccionadas depende del intermediario real.
