/**
 * ASTRA Interpret Worker — тонкий бэкенд-слой, который реализует §11/§14
 * мастер-промпта ASTRA (AI INTERPRETATION ENGINE): движок считает точные
 * астрономические/астрологические данные (см. src/), а этот сервис
 * передаёт уже посчитанные данные в Claude и возвращает персонализированный
 * текст. Сам сервис НИЧЕГО не вычисляет по астрономии/астрологии — только
 * форматирует то, что прислал браузер (те же DATA.points/aspects/dignities,
 * что уже используются в правило-ориентированной "Глубокой расшифровке",
 * см. scripts/interpretation/interpretation.js).
 *
 * Зачем отдельный сервис, а не вызов Claude прямо из браузера: ключ
 * Anthropic API нельзя держать в клиентском JS (сайт — статичный HTML на
 * GitHub Pages, весь код виден любому). Здесь ключ хранится как Cloudflare
 * Worker secret и никогда не попадает в ответ клиенту.
 *
 * Деплой и настройка — см. worker/README.md.
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL?: string;
  ALLOWED_ORIGIN?: string;
}

// Стили ответа — §14 брифа ("Настройки AI"): пользователь выбирает один из
// пяти на фронтенде, сюда приходит его ключ, а сама формулировка стиля
// живёт здесь (не на клиенте), чтобы её нельзя было подменить запросом.
const STYLE_PROMPTS: Record<string, string> = {
  professional:
    'Профессиональный, технический стиль — как для практикующего астролога. Используй ' +
    'астрологическую терминологию без чрезмерных пояснений "для новичков".',
  human:
    'Тёплый и понятный стиль — как для клиента без астрологического образования. Избегай ' +
    'непояснённого жаргона, переводи термины на простой язык.',
  psychological:
    'Глубокий психологический стиль — фокус на внутренних мотивах, паттернах поведения и ' +
    'точках роста, в духе психологической астрологии.',
  spiritual:
    'Более духовный, рефлексивный стиль — с акцентом на смысл, путь и внутреннюю работу, ' +
    'без эзотерического жаргона и мистификации.',
  premium:
    'Стиль персональной консультации высокого уровня — уверенный, точный, без "воды", но ' +
    'тёплый и внимательный к деталям именно этой карты.',
};
const DEFAULT_STYLE = 'human';

// Те же правила, что уже применяются в текстовом (не-AI) движке расшифровки
// — scripts/interpretation/interpretation.js — и в §24 брифа (AI SAFETY/
// QUALITY): вероятностный язык, явное основание для каждого вывода, никаких
// категоричных/медицинских/юридических/финансовых утверждений.
const SYSTEM_PROMPT = `Ты — интерпретационный слой поверх точных астрономических и астрологических
расчётов ASTRA Engine. Тебе присылают УЖЕ ТОЧНО ПОСЧИТАННЫЕ данные натальной карты (положения
планет по знакам/градусам/домам, аспекты с орбами, эссенциальные достоинства). Твоя задача — не
вычислять астрономию и не проверять её (ты этого не умеешь и не должен пытаться), а объяснять
человеку, что означают уже данные тебе факты.

Правила:
1. Работай только с данными, которые тебе прислали в сообщении пользователя — не выдумывай
   дополнительные позиции планет или аспекты.
2. Используй вероятностный, рефлексивный язык ("часто", "склонность", "может проявляться") —
   никогда не формулируй категоричные предсказания или судьбоносные утверждения.
3. Никогда не делай медицинских, юридических или финансовых утверждений и не давай советов,
   которые можно принять за профессиональную рекомендацию в этих областях.
4. Для каждого значимого вывода явно указывай, на каком элементе карты он основан (например:
   "Меркурий в Деве в 3 доме — отсюда..."), чтобы человек видел источник, а не просто верил на
   слово.
5. Отвечай связным текстом на русском языке (не списком технических полей, не JSON).`;

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(env), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Простой потолок на размер входящего запроса — не защита от
// целенаправленной атаки (для этого нужен Cloudflare rate limiting/
// Turnstile на уровне зоны, см. README), а просто щит от случайно
// огромного/некорректного тела запроса.
const MAX_BODY_CHARS = 40000;

interface InterpretPayload {
  points?: unknown[];
  housesSummary?: unknown;
  aspects?: unknown[];
  dignities?: unknown;
  style?: string;
  label?: string;
  question?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/interpret') {
      return jsonResponse({ error: 'Не найдено. Единственный endpoint — POST /interpret.' }, 404, env);
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Только POST.' }, 405, env);
    }
    if (!env.ANTHROPIC_API_KEY) {
      // Явная, а не молчаливая ошибка — тот же принцип честности об
      // ограничениях, что и во всём остальном проекте (см. §24 брифа):
      // если секрет не настроен на сервере, пользователь должен это увидеть,
      // а не получить пустой ответ без объяснения.
      return jsonResponse({ error: 'ANTHROPIC_API_KEY не настроен на сервере. См. worker/README.md.' }, 500, env);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) {
      return jsonResponse({ error: 'Слишком большой запрос.' }, 413, env);
    }

    let payload: InterpretPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: 'Некорректный JSON в теле запроса.' }, 400, env);
    }

    const { points, housesSummary, aspects, dignities, style, label, question } = payload;
    if (!Array.isArray(points) || points.length === 0 || !Array.isArray(aspects)) {
      return jsonResponse({ error: 'Отсутствуют обязательные поля: points (непустой массив), aspects (массив).' }, 400, env);
    }

    const styleKey = typeof style === 'string' && STYLE_PROMPTS[style] ? style : DEFAULT_STYLE;
    const userContent = [
      `Стиль ответа: ${STYLE_PROMPTS[styleKey]}`,
      label ? `Подпись карты: ${label}` : '',
      'Данные карты (JSON, уже точно посчитаны движком — не пересчитывай и не проверяй):',
      JSON.stringify({ points, housesSummary, aspects, dignities }),
      question
        ? `Вопрос пользователя: ${question}`
        : 'Задачи нет — составь общий разбор натальной карты: личность, эмоциональный профиль, ' +
          'отношения, карьера, таланты и вызовы. 300–500 слов.',
    ].filter(Boolean).join('\n\n');

    let anthropicRes: Response;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
    } catch (err) {
      return jsonResponse({ error: 'Не удалось связаться с Claude API.', detail: String(err) }, 502, env);
    }

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text().catch(() => '');
      return jsonResponse(
        { error: 'Claude API вернул ошибку.', status: anthropicRes.status, detail: detail.slice(0, 500) },
        502,
        env,
      );
    }

    const data = await anthropicRes.json<{ content?: Array<{ type: string; text?: string }>; model?: string }>();
    const text = (data.content || [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      return jsonResponse({ error: 'Claude API вернул пустой ответ.' }, 502, env);
    }

    return jsonResponse({ text, model: data.model || env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', style: styleKey }, 200, env);
  },
};
