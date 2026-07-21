const CACHE_TTL_SECONDS = 6 * 60 * 60;

// Gemini 2.5 Flash: modelo estable disponible en el free tier de Google AI
// Studio (sin tarjeta de crédito). Se usa en dos llamadas separadas porque
// Gemini no combina de forma confiable la herramienta google_search con
// responseMimeType/responseSchema en la misma petición.
const RESEARCH_MODEL = "gemini-2.5-flash";
const STRUCTURE_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SCORE_MAX = {
  roic: 20,
  fcf: 20,
  leverage: 20,
  revenue: 15,
  earnings: 10,
  priceContext: 5,
  valuation: 10,
};

// ---------------------------------------------------------------------------
// Schema para el paso de estructuración (formato Gemini: subconjunto de
// OpenAPI 3.0, sin additionalProperties, sin uniones de tipo — se usa
// "nullable: true" en vez de type: [x, "null"]).
// ---------------------------------------------------------------------------

function metricSchema() {
  return {
    type: "object",
    properties: {
      value: { type: "string" },
      score: { type: "integer" },
      status: {
        type: "string",
        enum: ["cumple", "parcial", "no cumple", "sin datos"],
      },
      explanation: { type: "string" },
    },
    required: ["value", "score", "status", "explanation"],
  };
}

const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    overview: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        companyName: { type: "string" },
        exchange: { type: "string" },
        currency: { type: "string" },
        price: { type: "number", nullable: true },
        changePercent: { type: "number", nullable: true },
        marketCap: { type: "string" },
        pe: { type: "string" },
        forwardPe: { type: "string" },
        high52Week: { type: "number", nullable: true },
        distanceFromHighPercent: { type: "number", nullable: true },
        asOf: { type: "string" },
        dataConfidence: { type: "string", enum: ["alta", "media", "baja"] },
      },
      required: [
        "ticker",
        "companyName",
        "exchange",
        "currency",
        "price",
        "changePercent",
        "marketCap",
        "pe",
        "forwardPe",
        "high52Week",
        "distanceFromHighPercent",
        "asOf",
        "dataConfidence",
      ],
    },
    executiveSummary: { type: "string" },
    bearCase: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          thesis: { type: "string" },
          evidence: { type: "string" },
          severity: { type: "string", enum: ["baja", "media", "alta", "crítica"] },
          trend: {
            type: "string",
            enum: ["mejorando", "estable", "deteriorándose", "incierta"],
          },
          confirmationSignal: { type: "string" },
        },
        required: ["title", "thesis", "evidence", "severity", "trend", "confirmationSignal"],
      },
    },
    insiders: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["positivo", "neutral", "alerta", "sin datos"] },
        summary: { type: "string" },
        notableTransactions: {
          type: "array",
          maxItems: 5,
          items: { type: "string" },
        },
      },
      required: ["status", "summary", "notableTransactions"],
    },
    scorecard: {
      type: "object",
      properties: {
        roic: metricSchema(),
        fcf: metricSchema(),
        leverage: metricSchema(),
        revenue: metricSchema(),
        earnings: metricSchema(),
        priceContext: metricSchema(),
        valuation: metricSchema(),
      },
      required: ["roic", "fcf", "leverage", "revenue", "earnings", "priceContext", "valuation"],
    },
    catalysts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          probability: { type: "integer" },
          magnitudeLevel: { type: "string", enum: ["baja", "media", "alta"] },
          magnitude: { type: "string" },
          timing: { type: "string" },
          pricedIn: { type: "string", enum: ["sí", "parcialmente", "no", "incierto"] },
          evidence: { type: "string" },
          failureRisk: { type: "string" },
        },
        required: [
          "title",
          "description",
          "probability",
          "magnitudeLevel",
          "magnitude",
          "timing",
          "pricedIn",
          "evidence",
          "failureRisk",
        ],
      },
    },
    quarters: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          period: { type: "string" },
          revenueYoY: { type: "number", nullable: true },
          grossMargin: { type: "number", nullable: true },
          operatingMargin: { type: "number", nullable: true },
          freeCashFlow: { type: "string" },
          guidanceNote: { type: "string" },
        },
        required: [
          "period",
          "revenueYoY",
          "grossMargin",
          "operatingMargin",
          "freeCashFlow",
          "guidanceNote",
        ],
      },
    },
    limitations: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
  },
  // "sources" queda fuera de required a propósito: las URLs reales se toman
  // de groundingMetadata de la búsqueda (paso 1), no de lo que el modelo
  // "recuerde" al estructurar en el paso 2, para evitar URLs inventadas.
  required: [
    "overview",
    "executiveSummary",
    "bearCase",
    "insiders",
    "scorecard",
    "catalysts",
    "quarters",
    "limitations",
  ],
};

const SYSTEM_PROMPT = `Eres un analista bursátil institucional, escéptico y cuantitativo. Investigas en la web una acción cotizada y aplicas tres filtros de descarte.

REGLAS DE INVESTIGACIÓN
- Prioriza documentos regulatorios (SEC u organismo equivalente), Investor Relations, presentaciones de resultados y transcripciones oficiales.
- Complementa con fuentes de mercado y prensa financiera reconocida.
- Usa la fecha actual entregada y los últimos 8 trimestres REPORTADOS, no estimados.
- No inventes datos. Si un dato no está disponible o las fuentes discrepan, dilo explícitamente ("ND" o "sin datos").
- Distingue ventas voluntarias de insiders de retenciones tributarias, vesting, opciones o transacciones automáticas.
- Escribe todo en español claro y directo.

RÚBRICA EXACTA DEL CONVICTION SCORE
1) ROIC, máximo 20: 20 si >=15%; 12 si 10%-14,9%; 6 si 5%-9,9%; 0 si <5% o negativo.
2) FCF, máximo 20: 20 positivo y creciendo; 14 positivo y estable; 8 positivo pero cayendo; 0 negativo.
3) Deuda neta/EBITDA, máximo 20: 20 si <1x; 16 si 1x-<2x; 8 si 2x-<3x; 3 si >=3x; 0 si EBITDA negativo o situación crítica.
4) Ingresos YoY, máximo 15: 15 si >=15%; 12 si 8%-14,9%; 8 si 3%-7,9%; 4 si 0%-2,9%; 0 si negativo.
5) Beneficios y márgenes, máximo 10: 10 si ambos crecen; 7 si estables/mixtos; 3 si deterioro moderado; 0 si deterioro severo.
6) Contexto frente al máximo de 52 semanas, máximo 5: evalúa tendencia, causa de la distancia y calidad del precio; no premies automáticamente una gran caída.
7) Valoración P/E, máximo 10: compara P/E actual y forward con historia, crecimiento y pares. 10 atractiva, 7 razonable, 3 exigente, 0 extrema o no interpretable.

FILTROS
- Caso bajista: identifica exactamente 3 riesgos materiales, con evidencia y señal de confirmación.
- Catalizadores: exactamente 3 para los próximos 12 meses, con probabilidad (0-100), magnitud, timing y si ya están en precio.
- Sé conservador: aprobar un filtro no equivale a recomendar una compra.`;

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isValidTicker(ticker) {
  return /^[A-Z0-9][A-Z0-9.-]{0,9}$/.test(ticker);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function clampInteger(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

// Extrae todo el texto de una respuesta generateContent de Gemini.
function extractGeminiText(response) {
  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

// Extrae las URLs realmente consultadas por Grounding with Google Search.
function extractGroundingSources(response) {
  const candidate = response?.candidates?.[0];
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const collected = new Map();

  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    if (!isHttpUrl(uri)) continue;
    const normalized = new URL(uri).toString();
    if (collected.has(normalized)) continue;
    collected.set(normalized, {
      title: String(chunk?.web?.title || "Fuente web").slice(0, 220),
      url: normalized,
      publisher: (() => {
        try {
          return new URL(normalized).hostname;
        } catch {
          return "Web";
        }
      })(),
      publishedDate: "ND",
      sourceType: "otro",
    });
  }

  return [...collected.values()];
}

async function callGemini({ model, env, body, timeoutMs = 55_000 }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const upstreamMessage =
        responseBody?.error?.message || `Gemini respondió HTTP ${response.status}.`;
      const error = new Error(upstreamMessage);
      error.status = response.status;
      throw error;
    }

    return responseBody;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Paso 1: investigación con Grounding with Google Search (texto libre, sin
// schema — Gemini no soporta bien combinar tools + responseSchema).
async function runResearch({ ticker, env, currentDate }) {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Fecha de análisis: ${currentDate}. Ticker: ${ticker}.

Busca primero la identidad correcta del ticker (evita mezclar empresas con símbolos similares) y confirma nombre de la empresa, bolsa y moneda.

Investiga y redacta en texto corrido, con todo el detalle numérico posible, cubriendo exactamente estos bloques:

1. DATOS DE MERCADO: precio actual, variación %, market cap, P/E trailing y forward, máximo de 52 semanas, distancia % al máximo, fecha de los datos.
2. CASO BAJISTA: exactamente 3 riesgos materiales (pérdida de cuota, márgenes, crecimiento, FCF, deuda, insiders, guidance), con evidencia, severidad, tendencia y qué señal confirmaría cada uno.
3. INSIDERS: estado (positivo/neutral/alerta/sin datos), resumen y hasta 5 transacciones relevantes, distinguiendo ventas discrecionales de vesting/impuestos.
4. CONVICTION SCORE: para cada uno de los 7 criterios de la rúbrica (ROIC, FCF, deuda neta/EBITDA, ingresos YoY, beneficios y márgenes, contexto 52 semanas, valoración P/E) da el valor numérico observado, el puntaje según la rúbrica exacta, el estado (cumple/parcial/no cumple/sin datos) y una explicación breve.
5. CATALIZADORES: exactamente 3 catalizadores alcistas a 12 meses con probabilidad %, magnitud, timing, evidencia, riesgo de que no ocurra y si ya está en precio.
6. TRIMESTRES: los últimos 8 trimestres reportados con ingresos YoY %, margen bruto %, margen operativo %, flujo de caja libre y nota de guidance.
7. LIMITACIONES: hasta 6 limitaciones del análisis (datos faltantes, discrepancias entre fuentes, etc).

No inventes cifras. Si algo no está disponible, dilo explícitamente.`,
          },
        ],
      },
    ],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.2,
    },
  };

  const responseBody = await callGemini({ model: RESEARCH_MODEL, env, body, timeoutMs: 55_000 });
  const text = extractGeminiText(responseBody);
  if (!text) {
    throw new Error("Gemini no devolvió contenido de investigación utilizable.");
  }
  const sources = extractGroundingSources(responseBody);
  return { text, sources };
}

// Paso 2: convierte el texto de investigación en el JSON estricto del schema.
async function runStructuring({ ticker, env, currentDate, researchText }) {
  const body = {
    systemInstruction: {
      parts: [
        {
          text: "Conviertes una investigación bursátil ya redactada en un JSON que sigue exactamente el schema entregado. No agregues información que no esté en el texto. Si un dato no aparece, usa 0, cadena vacía, o 'sin datos'/'ND' según corresponda al tipo de campo. Responde solo JSON.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Ticker: ${ticker}. Fecha: ${currentDate}.

INVESTIGACIÓN A ESTRUCTURAR:
${researchText}

Estructura esta investigación en el JSON solicitado, respetando la rúbrica exacta del Conviction Score y el resto de las reglas ya indicadas.`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: GEMINI_SCHEMA,
    },
  };

  const responseBody = await callGemini({ model: STRUCTURE_MODEL, env, body, timeoutMs: 40_000 });
  const text = extractGeminiText(responseBody);
  if (!text) {
    throw new Error("Gemini no devolvió un JSON estructurado utilizable.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("La respuesta estructurada de Gemini no pudo convertirse a JSON.");
  }
}

function enrichAnalysis(analysis, ticker, model, groundingSources) {
  const scorecard = analysis.scorecard || {};
  let total = 0;

  for (const [key, max] of Object.entries(SCORE_MAX)) {
    const metric = scorecard[key] || {};
    metric.score = clampInteger(metric.score, 0, max);
    scorecard[key] = metric;
    total += metric.score;
  }

  const verdict =
    total >= 80 ? "mejor oportunidad" : total >= 65 ? "fuerte" : total >= 50 ? "vigilar" : "evitar";

  const bearCase = (analysis.bearCase || []).slice(0, 3);
  const seriousRisks = bearCase.filter((risk) => ["alta", "crítica"].includes(risk.severity));
  const criticalRisks = bearCase.filter((risk) => risk.severity === "crítica");
  const bearPassed = seriousRisks.length < 2 && criticalRisks.length === 0;

  const catalysts = (analysis.catalysts || []).slice(0, 3).map((catalyst) => ({
    ...catalyst,
    probability: clampInteger(catalyst.probability, 0, 100),
  }));
  const catalystCandidates = catalysts.filter(
    (catalyst) =>
      catalyst.probability >= 50 &&
      ["media", "alta"].includes(catalyst.magnitudeLevel) &&
      catalyst.pricedIn !== "sí",
  );
  const catalystPassed = catalystCandidates.length >= 2;
  const scorePassed = total >= 65;

  const filters = {
    bear: {
      passed: bearPassed,
      label: "Caso bajista",
      reason: bearPassed
        ? "No aparecen dos riesgos de severidad alta/crítica simultáneamente."
        : `${seriousRisks.length} riesgos materiales de severidad alta o crítica.`,
    },
    score: {
      passed: scorePassed,
      label: "Conviction Score",
      reason: `${total}/100 — ${verdict}. El filtro aprueba desde 65 puntos.`,
    },
    catalyst: {
      passed: catalystPassed,
      label: "Catalizadores",
      reason: `${catalystCandidates.length} catalizadores cumplen probabilidad, magnitud y precio exigidos.`,
    },
  };

  const failedFilters = Object.values(filters).filter((filter) => !filter.passed).length;
  const decision =
    failedFilters >= 2
      ? "NO TOCAR"
      : failedFilters === 1
        ? "VIGILAR / ENTRADA CONDICIONADA"
        : "APTO PARA PROFUNDIZAR";

  return {
    ...analysis,
    overview: {
      ...analysis.overview,
      ticker,
    },
    bearCase,
    catalysts,
    scorecard,
    score: { total, verdict },
    filters,
    finalDecision: {
      decision,
      failedFilters,
      rule: "Si falla 2 de 3, no lo toco.",
      explanation:
        failedFilters >= 2
          ? `La acción falla ${failedFilters} filtros. Según la regla definida, queda descartada por ahora.`
          : failedFilters === 1
            ? "Solo falla un filtro. Requiere una condición de entrada y seguimiento antes de actuar."
            : "Supera los tres filtros, pero todavía requiere valoración de entrada, técnica y tamaño de posición.",
    },
    sources: groundingSources.slice(0, 18),
    limitations: Array.isArray(analysis.limitations) ? analysis.limitations : [],
    meta: {
      generatedAt: new Date().toISOString(),
      model,
      cached: false,
      cacheHours: CACHE_TTL_SECONDS / 3600,
    },
  };
}

async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return jsonResponse(
      {
        error: "Falta configurar GEMINI_API_KEY como secreto en el Worker de Cloudflare.",
        code: "MISSING_GEMINI_API_KEY",
      },
      503,
    );
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "El cuerpo debe ser JSON válido." }, 400);
  }

  const ticker = normalizeTicker(input?.ticker);
  const forceRefresh = Boolean(input?.forceRefresh);

  if (!isValidTicker(ticker)) {
    return jsonResponse(
      {
        error:
          "Ticker inválido. Usa entre 1 y 10 caracteres: letras, números, punto o guion.",
      },
      400,
    );
  }

  const cacheKey = new Request(
    `https://cache.stock-filter.internal/v5-gemini/${encodeURIComponent(ticker)}`,
    { method: "GET" },
  );

  if (!forceRefresh) {
    const cachedResponse = await caches.default.match(cacheKey);
    if (cachedResponse) {
      const cachedPayload = await cachedResponse.json();
      cachedPayload.meta = {
        ...(cachedPayload.meta || {}),
        cached: true,
      };
      return jsonResponse(cachedPayload, 200, { "x-analysis-cache": "HIT" });
    }
  }

  try {
    const currentDate = new Date().toISOString().slice(0, 10);

    const { text: researchText, sources: groundingSources } = await runResearch({
      ticker,
      env,
      currentDate,
    });

    const parsed = await runStructuring({ ticker, env, currentDate, researchText });

    const payload = enrichAnalysis(parsed, ticker, STRUCTURE_MODEL, groundingSources);
    const storableResponse = new Response(JSON.stringify(payload), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    context.waitUntil(caches.default.put(cacheKey, storableResponse));

    return jsonResponse(payload, 200, { "x-analysis-cache": "MISS" });
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    const status = isTimeout ? 504 : error?.status === 429 ? 429 : 502;
    return jsonResponse(
      {
        error: isTimeout
          ? "El análisis excedió el tiempo disponible. Intenta nuevamente."
          : error?.message || "No fue posible completar el análisis.",
        code: isTimeout ? "UPSTREAM_TIMEOUT" : "ANALYSIS_FAILED",
      },
      status,
    );
  }
}

function onRequestGet() {
  return jsonResponse({
    name: "Stock Conviction Dashboard API",
    method: "POST",
    example: { ticker: "IBM", forceRefresh: false },
  });
}

function methodNotAllowed() {
  return jsonResponse(
    { error: "Método no permitido. Usa GET o POST en /api/analyze." },
    405,
    { allow: "GET, POST" },
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        service: "Stock Conviction Dashboard API",
        provider: "Google Gemini",
        geminiConfigured: Boolean(env.GEMINI_API_KEY),
        researchModel: RESEARCH_MODEL,
        structureModel: STRUCTURE_MODEL,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/analyze") {
      if (request.method === "GET") return onRequestGet();
      if (request.method === "POST") {
        return onRequestPost({
          request,
          env,
          waitUntil: (promise) => ctx.waitUntil(promise),
        });
      }
      return methodNotAllowed();
    }

    return env.ASSETS.fetch(request);
  },
};
