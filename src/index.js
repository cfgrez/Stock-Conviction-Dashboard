const CACHE_TTL_SECONDS = 6 * 60 * 60;
// gpt-5.6-terra: mejor equilibrio calidad/costo para análisis financiero que
// gpt-5.6-luna (pensado para volumen alto y tareas simples). Puedes forzar
// otro modelo con la variable de entorno OPENAI_MODEL en Cloudflare.
const DEFAULT_MODEL = "gpt-5.6-terra";

const SCORE_MAX = {
  roic: 20,
  fcf: 20,
  leverage: 20,
  revenue: 15,
  earnings: 10,
  priceContext: 5,
  valuation: 10,
};

function metricSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "score", "status", "explanation"],
    properties: {
      value: { type: "string" },
      score: { type: "integer" },
      status: {
        type: "string",
        enum: ["cumple", "parcial", "no cumple", "sin datos"],
      },
      explanation: { type: "string" },
    },
  };
}

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "overview",
    "executiveSummary",
    "bearCase",
    "insiders",
    "scorecard",
    "catalysts",
    "quarters",
    "sources",
    "limitations",
  ],
  properties: {
    overview: {
      type: "object",
      additionalProperties: false,
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
      properties: {
        ticker: { type: "string" },
        companyName: { type: "string" },
        exchange: { type: "string" },
        currency: { type: "string" },
        price: { type: ["number", "null"] },
        changePercent: { type: ["number", "null"] },
        marketCap: { type: "string" },
        pe: { type: "string" },
        forwardPe: { type: "string" },
        high52Week: { type: ["number", "null"] },
        distanceFromHighPercent: { type: ["number", "null"] },
        asOf: { type: "string" },
        dataConfidence: {
          type: "string",
          enum: ["alta", "media", "baja"],
        },
      },
    },
    executiveSummary: { type: "string" },
    bearCase: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "thesis",
          "evidence",
          "severity",
          "trend",
          "confirmationSignal",
        ],
        properties: {
          title: { type: "string" },
          thesis: { type: "string" },
          evidence: { type: "string" },
          severity: {
            type: "string",
            enum: ["baja", "media", "alta", "crítica"],
          },
          trend: {
            type: "string",
            enum: ["mejorando", "estable", "deteriorándose", "incierta"],
          },
          confirmationSignal: { type: "string" },
        },
      },
    },
    insiders: {
      type: "object",
      additionalProperties: false,
      required: ["status", "summary", "notableTransactions"],
      properties: {
        status: {
          type: "string",
          enum: ["positivo", "neutral", "alerta", "sin datos"],
        },
        summary: { type: "string" },
        notableTransactions: {
          type: "array",
          maxItems: 5,
          items: { type: "string" },
        },
      },
    },
    scorecard: {
      type: "object",
      additionalProperties: false,
      required: [
        "roic",
        "fcf",
        "leverage",
        "revenue",
        "earnings",
        "priceContext",
        "valuation",
      ],
      properties: {
        roic: metricSchema(),
        fcf: metricSchema(),
        leverage: metricSchema(),
        revenue: metricSchema(),
        earnings: metricSchema(),
        priceContext: metricSchema(),
        valuation: metricSchema(),
      },
    },
    catalysts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
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
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          probability: { type: "integer", minimum: 0, maximum: 100 },
          magnitudeLevel: {
            type: "string",
            enum: ["baja", "media", "alta"],
          },
          magnitude: { type: "string" },
          timing: { type: "string" },
          pricedIn: {
            type: "string",
            enum: ["sí", "parcialmente", "no", "incierto"],
          },
          evidence: { type: "string" },
          failureRisk: { type: "string" },
        },
      },
    },
    quarters: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "period",
          "revenueYoY",
          "grossMargin",
          "operatingMargin",
          "freeCashFlow",
          "guidanceNote",
        ],
        properties: {
          period: { type: "string" },
          revenueYoY: { type: ["number", "null"] },
          grossMargin: { type: ["number", "null"] },
          operatingMargin: { type: ["number", "null"] },
          freeCashFlow: { type: "string" },
          guidanceNote: { type: "string" },
        },
      },
    },
    sources: {
      type: "array",
      minItems: 4,
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url", "publisher", "publishedDate", "sourceType"],
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          publisher: { type: "string" },
          publishedDate: { type: "string" },
          sourceType: {
            type: "string",
            enum: [
              "filing",
              "resultados",
              "mercado",
              "noticia",
              "insiders",
              "otro",
            ],
          },
        },
      },
    },
    limitations: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
  },
};

const SYSTEM_PROMPT = `Eres un analista bursátil institucional, escéptico y cuantitativo. Debes investigar en la web y analizar una acción cotizada.

REGLAS DE INVESTIGACIÓN
- Prioriza documentos regulatorios (SEC u organismo equivalente), Investor Relations, presentaciones de resultados y transcripciones oficiales.
- Complementa con fuentes de mercado y prensa financiera reconocida.
- Trabaja con la fecha actual entregada por el usuario y con los últimos 8 trimestres REPORTADOS, no estimados.
- No inventes datos. Si un dato no está disponible o las fuentes discrepan, usa null, “ND” o “sin datos” y explícalo.
- Distingue ventas voluntarias de insiders de retenciones tributarias, vesting, opciones o transacciones automáticas.
- Los URLs de sources deben ser URLs exactos realmente consultados en la búsqueda; jamás inventes enlaces.
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
- Catalizadores: exactamente 3 para los próximos 12 meses, con probabilidad, magnitud, timing y si ya están en precio.
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

function extractOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  for (const item of response?.output || []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        return part.text.trim();
      }
    }
  }

  return "";
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function collectWebSources(response) {
  const collected = new Map();

  function add(url, title = "Fuente web", publisher = "Web") {
    if (!isHttpUrl(url)) return;
    const normalized = new URL(url).toString();
    if (!collected.has(normalized)) {
      collected.set(normalized, {
        title: String(title || "Fuente web").slice(0, 220),
        url: normalized,
        publisher: String(publisher || new URL(normalized).hostname).slice(0, 100),
        publishedDate: "ND",
        sourceType: "otro",
      });
    }
  }

  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.url === "string") {
      add(value.url, value.title || value.name, value.publisher || value.site_name);
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    Object.values(value).forEach(walk);
  }

  walk(response?.output || []);
  return [...collected.values()];
}

function clampInteger(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function enrichAnalysis(analysis, ticker, model, rawResponse) {
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

  const seriousRisks = (analysis.bearCase || []).filter((risk) =>
    ["alta", "crítica"].includes(risk.severity),
  );
  const criticalRisks = (analysis.bearCase || []).filter(
    (risk) => risk.severity === "crítica",
  );
  const bearPassed = seriousRisks.length < 2 && criticalRisks.length === 0;

  const catalystCandidates = (analysis.catalysts || []).filter(
    (catalyst) =>
      Number(catalyst.probability) >= 50 &&
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

  const modelSources = Array.isArray(analysis.sources) ? analysis.sources : [];
  const rawSources = collectWebSources(rawResponse);
  const dedupedSources = new Map();
  for (const source of [...modelSources, ...rawSources]) {
    if (!isHttpUrl(source?.url)) continue;
    const url = new URL(source.url).toString();
    if (!dedupedSources.has(url)) {
      dedupedSources.set(url, { ...source, url });
    }
  }

  return {
    ...analysis,
    overview: {
      ...analysis.overview,
      ticker,
    },
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
    sources: [...dedupedSources.values()].slice(0, 18),
    meta: {
      generatedAt: new Date().toISOString(),
      model,
      cached: false,
      cacheHours: CACHE_TTL_SECONDS / 3600,
    },
  };
}

async function requestOpenAI({ ticker, env, currentDate }) {
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 110_000);

  const body = {
    model,
    store: false,
    reasoning: { effort: "medium" },
    tools: [{ type: "web_search", search_context_size: "high" }],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
    max_output_tokens: 12_000,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Fecha de análisis: ${currentDate}. Ticker: ${ticker}.

Aplica los tres filtros completos:
1. Caso bajista: pérdida de cuota, márgenes, crecimiento, FCF, deuda, insiders y guidance en los últimos 8 trimestres.
2. Conviction Score /100 usando estrictamente la rúbrica entregada.
3. Tres catalizadores alcistas en los próximos 12 meses con probabilidad, magnitud, timing y si están en precio.

Busca primero la identidad correcta del ticker y evita mezclar empresas con símbolos similares. Entrega exactamente el JSON solicitado.`,
      },
    ],
    text: {
      verbosity: "medium",
      format: {
        type: "json_schema",
        name: "stock_filter_analysis",
        strict: true,
        schema: ANALYSIS_SCHEMA,
      },
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const upstreamMessage =
        responseBody?.error?.message || `OpenAI respondió HTTP ${response.status}.`;
      const error = new Error(upstreamMessage);
      error.status = response.status;
      throw error;
    }

    return { responseBody, model };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.OPENAI_API_KEY) {
    return jsonResponse(
      {
        error: "Falta configurar OPENAI_API_KEY como secreto en Cloudflare Pages.",
        code: "MISSING_OPENAI_API_KEY",
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

  const model = env.OPENAI_MODEL || DEFAULT_MODEL;
  const cacheKey = new Request(
    `https://cache.stock-filter.internal/v4/${encodeURIComponent(ticker)}?model=${encodeURIComponent(model)}`,
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
    const { responseBody, model: usedModel } = await requestOpenAI({
      ticker,
      env,
      currentDate,
    });

    const outputText = extractOutputText(responseBody);
    if (!outputText) {
      throw new Error("La API no devolvió un análisis utilizable.");
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error("La respuesta estructurada no pudo convertirse a JSON.");
    }

    const payload = enrichAnalysis(parsed, ticker, usedModel, responseBody);
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
        openAIConfigured: Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
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
